/**
 * Adapter Registry
 * Maps council IDs to adapter instances
 * Provides adapter lookup and lifecycle management
 */

import { CouncilAdapter } from './base/interface.js';
import { BasingstokeAdapter } from './basingstoke/index.js';
import { EastHampshireAdapter } from './east-hampshire/index.js';
// TODO: Import other adapters

const adapters = new Map<string, CouncilAdapter>();

/**
 * Initialize all adapters
 */
export function initializeAdapters(): void {
  // Register all adapters
  registerAdapter(new BasingstokeAdapter());
  registerAdapter(new EastHampshireAdapter());
  // TODO: Register remaining adapters
}

/**
 * Register an adapter
 */
export function registerAdapter(adapter: CouncilAdapter): void {
  adapters.set(adapter.metadata.councilId, adapter);
}

/**
 * Get adapter by council ID
 */
export function getAdapter(councilId: string): CouncilAdapter | undefined {
  return adapters.get(councilId);
}

/**
 * Get all registered adapters
 */
export function getAllAdapters(): CouncilAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Cleanup all adapters (on shutdown)
 */
export async function cleanupAdapters(): Promise<void> {
  const cleanupPromises = Array.from(adapters.values()).map(adapter =>
    adapter.cleanup().catch(err => {
      console.error(`Failed to cleanup adapter ${adapter.metadata.councilId}:`, err);
    })
  );
  
  await Promise.all(cleanupPromises);
}
