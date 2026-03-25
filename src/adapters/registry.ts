/**
 * Adapter Registry
 * 
 * Centralised registry for all council adapters.
 * Manages adapter lifecycle, kill switches, and discovery.
 * 
 * @module adapters/registry
 */

import type { CouncilAdapter } from './base/adapter.interface.js';
import { EastleighAdapter } from './eastleigh/index.js';
import { RushmoorAdapter } from './rushmoor/index.js';

export class AdapterDisabledError extends Error {
  constructor(councilId: string) {
    super(`Adapter '${councilId}' is disabled via kill switch`);
    this.name = 'AdapterDisabledError';
  }
}

/**
 * Adapter registry with kill switch support.
 */
class AdapterRegistry {
  private adapters = new Map<string, CouncilAdapter>();
  
  /**
   * Register an adapter.
   */
  register(adapter: CouncilAdapter): void {
    // Check for global kill switch
    if (process.env.ADAPTER_KILL_SWITCH_GLOBAL === 'true') {
      console.warn(`[REGISTRY] Global kill switch enabled — adapter '${adapter.councilId}' not registered`);
      return;
    }
    
    // Check for adapter-specific kill switch
    const killSwitchVar = `ADAPTER_KILL_SWITCH_${adapter.councilId.toUpperCase().replace(/-/g, '_')}`;
    if (process.env[killSwitchVar] === 'true') {
      console.warn(`[REGISTRY] Kill switch enabled for '${adapter.councilId}' — not registered`);
      return;
    }
    
    this.adapters.set(adapter.councilId, adapter);
    console.log(`[REGISTRY] Registered adapter: ${adapter.councilId}`);
  }
  
  /**
   * Get adapter by council ID.
   * Throws AdapterDisabledError if adapter is disabled or not found.
   */
  get(councilId: string): CouncilAdapter {
    const adapter = this.adapters.get(councilId);
    
    if (!adapter) {
      throw new AdapterDisabledError(councilId);
    }
    
    return adapter;
  }
  
  /**
   * Get all registered adapters.
   */
  getAll(): CouncilAdapter[] {
    return Array.from(this.adapters.values());
  }
  
  /**
   * Check if adapter is registered.
   */
  has(councilId: string): boolean {
    return this.adapters.has(councilId);
  }
  
  /**
   * Get list of registered council IDs.
   */
  listCouncils(): string[] {
    return Array.from(this.adapters.keys());
  }
}

// Singleton registry instance
export const adapterRegistry = new AdapterRegistry();

/**
 * Initialize all adapters.
 * Should be called at application startup.
 */
export function initializeAdapters(): void {
  console.log('[REGISTRY] Initializing adapters...');
  
  // Register Phase 1 adapters
  adapterRegistry.register(new EastleighAdapter());
  adapterRegistry.register(new RushmoorAdapter());
  
  // TODO: Register Phase 2+ adapters as implemented
  // adapterRegistry.register(new FarehamAdapter());
  // adapterRegistry.register(new EastHampshireAdapter());
  // ... etc
  
  const registeredCount = adapterRegistry.getAll().length;
  console.log(`[REGISTRY] Initialized ${registeredCount} adapter(s)`);
}

/**
 * Get adapter by council ID.
 * Convenience function for common usage.
 */
export function getAdapter(councilId: string): CouncilAdapter {
  return adapterRegistry.get(councilId);
}

/**
 * Get all registered adapters.
 */
export function getAllAdapters(): CouncilAdapter[] {
  return adapterRegistry.getAll();
}

/**
 * Check if council is supported.
 */
export function isCouncilSupported(councilId: string): boolean {
  return adapterRegistry.has(councilId);
}

/**
 * Get list of supported councils.
 */
export function getSupportedCouncils(): string[] {
  return adapterRegistry.listCouncils();
}

