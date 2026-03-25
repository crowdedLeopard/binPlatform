/**
 * Hampshire Bin Collection Data Platform
 * Evidence Expiry Management
 *
 * Manages expiry and deletion of raw evidence stored in blob storage.
 * Sets expiry metadata on upload, queries expired blobs, and deletes with audit.
 *
 * @module storage/evidence/expiry
 */

import { logger } from '../../observability/logger.js';
import { auditLogger } from '../../observability/audit.js';

// =============================================================================
// TYPES
// =============================================================================

export interface EvidenceMetadata {
  /** Blob reference (path or URL) */
  blobRef: string;
  /** When evidence expires (ISO-8601) */
  expiresAt: Date;
  /** Council ID */
  councilId: string;
  /** Evidence type (html, json, pdf, screenshot) */
  evidenceType: 'html' | 'json' | 'pdf' | 'screenshot';
  /** Upload timestamp */
  uploadedAt: Date;
  /** Size in bytes */
  sizeBytes: number;
}

export interface ExpiredEvidence {
  blobRef: string;
  expiresAt: Date;
  councilId: string;
  evidenceType: string;
  sizeBytes: number;
  daysExpired: number;
}

export interface DeleteResult {
  blobRef: string;
  deleted: boolean;
  error?: string;
}

// =============================================================================
// BLOB STORAGE CLIENT INTERFACE
// =============================================================================

/**
 * Abstract blob storage client.
 * Implement for Azure Blob Storage, AWS S3, or local filesystem.
 */
export interface BlobStorageClient {
  /** Set metadata on a blob */
  setMetadata(blobRef: string, metadata: Record<string, string>): Promise<void>;

  /** Get metadata from a blob */
  getMetadata(blobRef: string): Promise<Record<string, string> | null>;

  /** List blobs with metadata */
  listBlobs(prefix?: string): Promise<Array<{ blobRef: string; metadata: Record<string, string>; sizeBytes: number }>>;

  /** Delete a blob */
  deleteBlob(blobRef: string): Promise<void>;

  /** Check if blob exists */
  exists(blobRef: string): Promise<boolean>;
}

let blobClient: BlobStorageClient | null = null;

export function setBlobStorageClient(client: BlobStorageClient): void {
  blobClient = client;
  logger.info('Blob storage client configured for evidence expiry');
}

// =============================================================================
// EXPIRY MANAGEMENT
// =============================================================================

/**
 * Set expiry metadata on evidence blob.
 * Called when evidence is uploaded.
 */
export async function setEvidenceExpiry(
  blobRef: string,
  expiresAt: Date,
  councilId: string,
  evidenceType: 'html' | 'json' | 'pdf' | 'screenshot'
): Promise<void> {
  if (!blobClient) {
    throw new Error('Blob storage client not initialized');
  }

  const metadata = {
    expiresAt: expiresAt.toISOString(),
    councilId,
    evidenceType,
    uploadedAt: new Date().toISOString(),
  };

  await blobClient.setMetadata(blobRef, metadata);

  logger.debug('Evidence expiry set', {
    blobRef,
    expiresAt: expiresAt.toISOString(),
    councilId,
    evidenceType,
  });
}

/**
 * List expired evidence blobs.
 * Returns blobs where expiresAt < now.
 */
export async function listExpiredEvidence(): Promise<ExpiredEvidence[]> {
  if (!blobClient) {
    throw new Error('Blob storage client not initialized');
  }

  const now = new Date();
  const expired: ExpiredEvidence[] = [];

  // List all blobs with metadata
  const blobs = await blobClient.listBlobs();

  for (const blob of blobs) {
    const { blobRef, metadata, sizeBytes } = blob;

    // Check if has expiry metadata
    if (!metadata.expiresAt) {
      logger.warn('Blob missing expiry metadata', { blobRef });
      continue;
    }

    const expiresAt = new Date(metadata.expiresAt);

    // Check if expired
    if (expiresAt < now) {
      const daysExpired = Math.floor((now.getTime() - expiresAt.getTime()) / 1000 / 60 / 60 / 24);

      expired.push({
        blobRef,
        expiresAt,
        councilId: metadata.councilId || 'unknown',
        evidenceType: metadata.evidenceType || 'unknown',
        sizeBytes,
        daysExpired,
      });
    }
  }

  logger.info('Listed expired evidence', {
    total: blobs.length,
    expired: expired.length,
  });

  return expired;
}

/**
 * Delete evidence blob with audit log.
 * NEVER deletes silently - always logs to audit.
 */
export async function deleteEvidence(
  blobRef: string,
  reason: string
): Promise<void> {
  if (!blobClient) {
    throw new Error('Blob storage client not initialized');
  }

  // Get metadata before deletion
  const metadata = await blobClient.getMetadata(blobRef);
  const councilId = metadata?.councilId || 'unknown';
  const evidenceType = metadata?.evidenceType || 'unknown';

  // Audit log BEFORE deletion
  auditLogger.log({
    eventType: 'admin.adapter.enable' as any, // TODO: Add EVIDENCE_DELETE event type
    severity: 'warning',
    actor: { type: 'system' },
    resource: {
      type: 'evidence',
      councilId,
    },
    action: 'evidence.delete',
    outcome: 'success',
    metadata: {
      blobRef,
      reason,
      evidenceType,
      expiresAt: metadata?.expiresAt,
    },
  });

  // Delete blob
  await blobClient.deleteBlob(blobRef);

  logger.info('Evidence deleted', {
    blobRef,
    reason,
    councilId,
    evidenceType,
  });
}

/**
 * Delete multiple expired evidence blobs.
 * Returns results for each blob (success/failure).
 */
export async function deleteExpiredEvidence(
  expiredList: ExpiredEvidence[],
  dryRun = false
): Promise<DeleteResult[]> {
  const results: DeleteResult[] = [];

  logger.info('Deleting expired evidence', {
    count: expiredList.length,
    dryRun,
  });

  for (const evidence of expiredList) {
    if (dryRun) {
      logger.info('[DRY RUN] Would delete evidence', {
        blobRef: evidence.blobRef,
        daysExpired: evidence.daysExpired,
        councilId: evidence.councilId,
      });

      results.push({
        blobRef: evidence.blobRef,
        deleted: false, // dry run
      });
      continue;
    }

    try {
      await deleteEvidence(
        evidence.blobRef,
        `Expired ${evidence.daysExpired} days ago (retention policy)`
      );

      results.push({
        blobRef: evidence.blobRef,
        deleted: true,
      });
    } catch (error) {
      logger.error('Failed to delete evidence', {
        blobRef: evidence.blobRef,
        error,
      });

      results.push({
        blobRef: evidence.blobRef,
        deleted: false,
        error: String(error),
      });
    }
  }

  const successCount = results.filter(r => r.deleted).length;
  const failureCount = results.filter(r => !r.deleted && !dryRun).length;

  logger.info('Expired evidence deletion complete', {
    total: expiredList.length,
    successCount,
    failureCount,
    dryRun,
  });

  return results;
}

/**
 * Get expiry date for evidence type.
 * Based on retention policy.
 */
export function getEvidenceExpiryDate(
  evidenceType: 'html' | 'json' | 'pdf' | 'screenshot',
  uploadedAt = new Date()
): Date {
  const retentionDays = {
    html: 90,
    json: 90,
    pdf: 30,
    screenshot: 7,
  };

  const expiryDate = new Date(uploadedAt);
  expiryDate.setDate(expiryDate.getDate() + retentionDays[evidenceType]);
  return expiryDate;
}
