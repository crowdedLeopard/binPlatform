/**
 * Hampshire Bin Collection Data Platform
 * Evidence Retention Management
 *
 * Queries for evidence retention and data lifecycle management.
 *
 * @module admin/retention
 */

/**
 * Evidence retention statistics.
 */
export interface RetentionStats {
  /** Total evidence files stored */
  totalEvidenceFiles: number;

  /** Total size in bytes */
  totalSizeBytes: number;

  /** Evidence files older than retention window */
  expiredFiles: number;

  /** Size of expired files in bytes */
  expiredSizeBytes: number;

  /** Files marked for deletion */
  markedForDeletion: number;

  /** Retention window in days */
  retentionWindowDays: number;

  /** Last purge timestamp */
  lastPurgeAt: string | null;
}

/**
 * Evidence file reference.
 */
export interface EvidenceRef {
  /** Evidence reference ID */
  evidenceRef: string;

  /** Storage path */
  storagePath: string;

  /** Captured at timestamp */
  capturedAt: string;

  /** Size in bytes */
  sizeBytes: number;

  /** Evidence type */
  evidenceType: string;

  /** Whether contains PII */
  containsPii: boolean;
}

/**
 * Evidence purge result.
 */
export interface PurgeResult {
  /** Number of files deleted */
  filesDeleted: number;

  /** Bytes freed */
  bytesFreed: number;

  /** Purge started at */
  startedAt: string;

  /** Purge completed at */
  completedAt: string;

  /** Errors encountered */
  errors: string[];
}

/**
 * Get evidence retention statistics.
 *
 * @returns Promise resolving to retention stats
 */
export async function getEvidenceRetentionStats(): Promise<RetentionStats> {
  // TODO: Wire to PostgreSQL queries + blob storage API
  // Query:
  // SELECT
  //   COUNT(*) as total_files,
  //   SUM(size_bytes) as total_size,
  //   COUNT(CASE WHEN captured_at < NOW() - INTERVAL '90 days' THEN 1 END) as expired,
  //   SUM(CASE WHEN captured_at < NOW() - INTERVAL '90 days' THEN size_bytes ELSE 0 END) as expired_size
  // FROM source_evidence

  return {
    totalEvidenceFiles: 0,
    totalSizeBytes: 0,
    expiredFiles: 0,
    expiredSizeBytes: 0,
    markedForDeletion: 0,
    retentionWindowDays: 90,
    lastPurgeAt: null,
  };
}

/**
 * Get evidence files older than retention window.
 *
 * @param olderThanDays - Age threshold in days
 * @returns Promise resolving to evidence references
 */
export async function getExpiredEvidence(
  olderThanDays: number
): Promise<EvidenceRef[]> {
  // TODO: Wire to PostgreSQL queries
  // Query:
  // SELECT evidence_ref, storage_path, captured_at, size_bytes, evidence_type, contains_pii
  // FROM source_evidence
  // WHERE captured_at < NOW() - INTERVAL '$1 days'
  // AND deleted_at IS NULL
  // ORDER BY captured_at ASC

  return [];
}

/**
 * Mark evidence files for deletion.
 *
 * Sets deleted_at timestamp but does not immediately purge from blob storage.
 * Actual deletion happens during purge operation.
 *
 * @param refs - Evidence reference IDs to mark
 * @returns Promise resolving when marked
 */
export async function markEvidenceForDeletion(refs: string[]): Promise<void> {
  // TODO: Wire to PostgreSQL update
  // UPDATE source_evidence
  // SET deleted_at = NOW()
  // WHERE evidence_ref = ANY($1)

  return;
}

/**
 * Purge expired evidence from blob storage.
 *
 * This is an async operation that:
 * 1. Queries evidence marked for deletion
 * 2. Deletes from blob storage
 * 3. Removes database records
 * 4. Logs purge audit event
 *
 * @returns Promise resolving to purge result
 */
export async function purgeExpiredEvidence(): Promise<PurgeResult> {
  // TODO: Implement blob storage deletion + database cleanup
  // This should be an async job (BullMQ) not synchronous

  const startedAt = new Date().toISOString();

  // Stub implementation
  return {
    filesDeleted: 0,
    bytesFreed: 0,
    startedAt,
    completedAt: new Date().toISOString(),
    errors: [],
  };
}
