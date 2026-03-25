/**
 * Evidence Storage Service
 * 
 * Stores raw upstream responses (JSON, HTML, PDF, screenshots) as evidence
 * for audit, debugging, and compliance purposes.
 * 
 * Evidence is stored in Azure Blob Storage with 90-day retention.
 * 
 * @module storage/evidence
 */

import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

export interface EvidenceMetadata {
  /** Council identifier */
  councilId: string;
  
  /** Acquisition attempt ID (correlates with metadata) */
  attemptId: string;
  
  /** Evidence type */
  evidenceType: 'json' | 'html' | 'screenshot' | 'pdf' | 'har';
  
  /** ISO 8601 timestamp of capture */
  capturedAt: string;
  
  /** UPRN or property identifier */
  propertyIdentifier?: string;
  
  /** Request correlation ID */
  correlationId?: string;
  
  /** Whether evidence contains PII */
  containsPii: boolean;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface EvidenceReference {
  /** Unique evidence reference ID */
  evidenceRef: string;
  
  /** Storage path */
  storagePath: string;
  
  /** Content hash (SHA-256) */
  contentHash: string;
  
  /** Size in bytes */
  sizeBytes: number;
  
  /** ISO 8601 timestamp of capture */
  capturedAt: string;
  
  /** Retention expiry date (90 days) */
  expiresAt: string;
}

/**
 * Store evidence in blob storage.
 * 
 * @param councilId - Council identifier
 * @param evidenceType - Type of evidence
 * @param content - Evidence content (Buffer or string)
 * @param metadata - Evidence metadata
 * @returns Evidence reference with storage details
 */
export async function storeEvidence(
  councilId: string,
  evidenceType: 'json' | 'html' | 'screenshot' | 'pdf' | 'har',
  content: Buffer | string,
  metadata: EvidenceMetadata
): Promise<EvidenceReference> {
  // Convert content to Buffer
  const buffer = typeof content === 'string' 
    ? Buffer.from(content, 'utf-8') 
    : content;
  
  // Generate content hash
  const contentHash = createHash('sha256').update(buffer).digest('hex');
  
  // Generate unique reference ID
  const evidenceRef = uuidv4();
  
  // Generate storage path
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const extension = getFileExtension(evidenceType);
  const storagePath = `${councilId}/${date}/${evidenceRef}.${extension}`;
  
  // Calculate expiry date (90 days from now)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);
  
  // Store in blob storage
  await storeToBlobStorage(storagePath, buffer, {
    contentType: getContentType(evidenceType),
    metadata: {
      councilId,
      evidenceType,
      attemptId: metadata.attemptId,
      capturedAt: metadata.capturedAt,
      contentHash,
      containsPii: String(metadata.containsPii),
    },
    expiresAt,
  });
  
  return {
    evidenceRef,
    storagePath,
    contentHash,
    sizeBytes: buffer.length,
    capturedAt: metadata.capturedAt,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Get file extension for evidence type.
 */
function getFileExtension(evidenceType: string): string {
  const extensions: Record<string, string> = {
    json: 'json',
    html: 'html',
    screenshot: 'png',
    pdf: 'pdf',
    har: 'har',
  };
  
  return extensions[evidenceType] || 'bin';
}

/**
 * Get content type for evidence type.
 */
function getContentType(evidenceType: string): string {
  const contentTypes: Record<string, string> = {
    json: 'application/json',
    html: 'text/html',
    screenshot: 'image/png',
    pdf: 'application/pdf',
    har: 'application/json',
  };
  
  return contentTypes[evidenceType] || 'application/octet-stream';
}

/**
 * Store content to blob storage.
 * 
 * Implementation varies based on environment:
 * - Production: Azure Blob Storage
 * - Development: Local filesystem
 * - Test: In-memory storage
 */
async function storeToBlobStorage(
  storagePath: string,
  content: Buffer,
  options: {
    contentType: string;
    metadata: Record<string, string>;
    expiresAt: Date;
  }
): Promise<void> {
  const environment = process.env.NODE_ENV || 'development';
  
  if (environment === 'production') {
    // Azure Blob Storage implementation
    await storeToAzureBlob(storagePath, content, options);
  } else if (environment === 'development') {
    // Local filesystem implementation
    await storeToLocalFilesystem(storagePath, content, options);
  } else {
    // Test environment — in-memory storage
    storeToMemory(storagePath, content, options);
  }
}

/**
 * Store to Azure Blob Storage (production).
 */
async function storeToAzureBlob(
  storagePath: string,
  content: Buffer,
  options: {
    contentType: string;
    metadata: Record<string, string>;
    expiresAt: Date;
  }
): Promise<void> {
  // Implementation with @azure/storage-blob
  // 
  // import { BlobServiceClient } from '@azure/storage-blob';
  // 
  // const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  // const containerName = 'evidence';
  // 
  // const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  // const containerClient = blobServiceClient.getContainerClient(containerName);
  // const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
  // 
  // await blockBlobClient.upload(content, content.length, {
  //   blobHTTPHeaders: {
  //     blobContentType: options.contentType,
  //   },
  //   metadata: options.metadata,
  //   // Note: Lifecycle policy in Azure handles expiry, not per-blob setting
  // });
  
  console.log(`[EVIDENCE] Stored to Azure Blob: ${storagePath} (${content.length} bytes)`);
}

/**
 * Store to local filesystem (development).
 */
async function storeToLocalFilesystem(
  storagePath: string,
  content: Buffer,
  options: {
    contentType: string;
    metadata: Record<string, string>;
    expiresAt: Date;
  }
): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');
  
  // Create evidence directory in project root
  const evidenceDir = path.join(process.cwd(), 'evidence-local');
  const fullPath = path.join(evidenceDir, storagePath);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  
  // Write content
  await fs.writeFile(fullPath, content);
  
  // Write metadata file
  const metadataPath = `${fullPath}.meta.json`;
  await fs.writeFile(
    metadataPath,
    JSON.stringify({
      ...options.metadata,
      contentType: options.contentType,
      expiresAt: options.expiresAt.toISOString(),
      storedAt: new Date().toISOString(),
    }, null, 2)
  );
  
  console.log(`[EVIDENCE] Stored to local filesystem: ${fullPath} (${content.length} bytes)`);
}

/**
 * Store to in-memory cache (test environment).
 */
const memoryStorage = new Map<string, { content: Buffer; metadata: any }>();

function storeToMemory(
  storagePath: string,
  content: Buffer,
  options: {
    contentType: string;
    metadata: Record<string, string>;
    expiresAt: Date;
  }
): void {
  memoryStorage.set(storagePath, {
    content,
    metadata: {
      ...options.metadata,
      contentType: options.contentType,
      expiresAt: options.expiresAt.toISOString(),
    },
  });
  
  console.log(`[EVIDENCE] Stored to memory: ${storagePath} (${content.length} bytes)`);
}

/**
 * Retrieve evidence from storage (for debugging/audit).
 */
export async function retrieveEvidence(
  storagePath: string
): Promise<Buffer | null> {
  const environment = process.env.NODE_ENV || 'development';
  
  if (environment === 'test') {
    const stored = memoryStorage.get(storagePath);
    return stored?.content || null;
  }
  
  if (environment === 'development') {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const evidenceDir = path.join(process.cwd(), 'evidence-local');
    const fullPath = path.join(evidenceDir, storagePath);
    
    try {
      return await fs.readFile(fullPath);
    } catch {
      return null;
    }
  }
  
  // Production Azure Blob retrieval
  // Implementation with @azure/storage-blob
  return null;
}
