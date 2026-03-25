// TODO: Azure Blob Storage client for evidence storage
// Upload, download, list blobs
// Generate SAS tokens for secure access

import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { logger } from '../../observability/logger.js';

let containerClient: ContainerClient | null = null;

export interface StorageConfig {
  connectionString: string;
  containerName: string;
}

export async function initStorage(config: StorageConfig): Promise<void> {
  const { connectionString, containerName } = config;

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  containerClient = blobServiceClient.getContainerClient(containerName);

  // Create container if it doesn't exist
  try {
    await containerClient.createIfNotExists({
      access: 'private'
    });
    logger.info({ container: containerName }, 'Storage container ready');
  } catch (err) {
    logger.error({ err }, 'Failed to initialize storage container');
    throw err;
  }
}

export function getStorage(): ContainerClient {
  if (!containerClient) {
    throw new Error('Storage not initialized. Call initStorage() first.');
  }
  return containerClient;
}

export async function uploadEvidence(
  blobName: string,
  content: string | Buffer,
  contentType: string
): Promise<string> {
  const client = getStorage();
  const blockBlobClient = client.getBlockBlobClient(blobName);

  await blockBlobClient.upload(content, Buffer.byteLength(content), {
    blobHTTPHeaders: {
      blobContentType: contentType
    },
    metadata: {
      uploadedAt: new Date().toISOString()
    }
  });

  logger.debug({ blobName }, 'Evidence uploaded');
  return blobName;
}

export async function downloadEvidence(blobName: string): Promise<Buffer> {
  const client = getStorage();
  const blockBlobClient = client.getBlockBlobClient(blobName);

  const downloadResponse = await blockBlobClient.download();
  const chunks: Buffer[] = [];

  for await (const chunk of downloadResponse.readableStreamBody!) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

export async function listEvidence(prefix?: string): Promise<string[]> {
  const client = getStorage();
  const blobs: string[] = [];

  for await (const blob of client.listBlobsFlat({ prefix })) {
    blobs.push(blob.name);
  }

  return blobs;
}

export async function healthCheck(): Promise<boolean> {
  if (!containerClient) return false;

  try {
    await containerClient.getProperties();
    return true;
  } catch (err) {
    logger.error({ err }, 'Storage health check failed');
    return false;
  }
}
