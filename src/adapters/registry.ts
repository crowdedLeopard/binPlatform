/**
 * Adapter Registry
 * 
 * Centralised registry for all council adapters.
 * Manages adapter lifecycle, kill switches, and discovery.
 * Now supports config-driven endpoint management with hot-reload.
 * 
 * @module adapters/registry
 */

import type { CouncilAdapter } from './base/adapter.interface.js';
import { EastleighAdapter } from './eastleigh/index.js';
import { RushmoorAdapter } from './rushmoor/index.js';
import { FarehamAdapter } from './fareham/index.js';
import { EastHampshireAdapter } from './east-hampshire/index.js';
import { NewForestAdapter } from './new-forest/index.js';
import { SouthamptonAdapter } from './southampton/index.js';
// Phase 3 Wave 2 adapters (Batch A - form-based)
import { BasingstokeDeaneAdapter } from './basingstoke-deane/index.js';
import { GosportAdapter } from './gosport/index.js';
import { HavantAdapter } from './havant/index.js';
import { HartAdapter } from './hart/index.js';
// Phase 3 Wave 2 adapters (Batch B - form-based + React SPA)
import { PortsmouthAdapter } from './portsmouth/index.js';
import { TestValleyAdapter } from './test-valley/index.js';
import { WinchesterAdapter } from './winchester/index.js';

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Adapter configuration interface (from adapter-config.json).
 */
export interface AdapterConfigEntry {
  council_id: string;
  display_name: string;
  base_url: string;
  enabled: boolean;
  last_verified: string;
  schema_hash: string | null;
  notes: string;
  [key: string]: unknown;
}

/**
 * Load adapter configuration from disk.
 * Can be called multiple times for hot-reload.
 */
function loadAdapterConfig(): Record<string, AdapterConfigEntry> {
  const configPath = path.join(__dirname, '../../data/adapter-config.json');
  try {
    const data = readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.warn('[REGISTRY] Failed to load adapter config:', error);
    return {};
  }
}

/**
 * Registry of TypeScript adapter implementations.
 * Maps council ID to adapter factory function.
 */
const adapterImplementations: Record<string, () => CouncilAdapter> = {
  'eastleigh': () => new EastleighAdapter(),
  'rushmoor': () => new RushmoorAdapter(),
  'fareham': () => new FarehamAdapter(),
  'east-hampshire': () => new EastHampshireAdapter(),
  'new-forest': () => new NewForestAdapter(),
  'southampton': () => new SouthamptonAdapter(),
  'basingstoke-deane': () => new BasingstokeDeaneAdapter(),
  'gosport': () => new GosportAdapter(),
  'havant': () => new HavantAdapter(),
  'hart': () => new HartAdapter(),
  'portsmouth': () => new PortsmouthAdapter(),
  'test-valley': () => new TestValleyAdapter(),
  'winchester': () => new WinchesterAdapter(),
};

export class AdapterDisabledError extends Error {
  constructor(councilId: string) {
    super(`Adapter '${councilId}' is disabled via kill switch`);
    this.name = 'AdapterDisabledError';
  }
}

/**
 * Adapter registry with kill switch support and config-driven management.
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
    
    // Check config-based enabled flag
    const config = loadAdapterConfig();
    if (config[adapter.councilId]?.enabled === false) {
      console.warn(`[REGISTRY] Adapter '${adapter.councilId}' disabled in config — not registered`);
      return;
    }
    
    this.adapters.set(adapter.councilId, adapter);
    console.log(`[REGISTRY] Registered adapter: ${adapter.councilId}`);
  }
  
  /**
   * Get adapter by council ID.
   * Throws AdapterDisabledError if adapter is disabled or not found.
   * 
   * This method checks both the registry and the current config state,
   * allowing for runtime config changes without restart.
   */
  get(councilId: string): CouncilAdapter {
    // Check kill switches first
    if (process.env.ADAPTER_KILL_SWITCH_GLOBAL === 'true') {
      throw new AdapterDisabledError(councilId);
    }
    
    const killSwitchVar = `ADAPTER_KILL_SWITCH_${councilId.toUpperCase().replace(/-/g, '_')}`;
    if (process.env[killSwitchVar] === 'true') {
      throw new AdapterDisabledError(councilId);
    }
    
    // Check config enabled flag (hot-reload support)
    const config = loadAdapterConfig();
    if (config[councilId]?.enabled === false) {
      throw new AdapterDisabledError(councilId);
    }
    
    const adapter = this.adapters.get(councilId);
    
    if (!adapter) {
      throw new AdapterDisabledError(councilId);
    }
    
    return adapter;
  }
  
  /**
   * Get all registered adapters (filtered by current config state).
   */
  getAll(): CouncilAdapter[] {
    const config = loadAdapterConfig();
    return Array.from(this.adapters.values()).filter(
      (adapter) => config[adapter.councilId]?.enabled !== false
    );
  }
  
  /**
   * Check if adapter is registered and enabled.
   */
  has(councilId: string): boolean {
    if (!this.adapters.has(councilId)) return false;
    
    const config = loadAdapterConfig();
    return config[councilId]?.enabled !== false;
  }
  
  /**
   * Get list of registered and enabled council IDs.
   */
  listCouncils(): string[] {
    const config = loadAdapterConfig();
    return Array.from(this.adapters.keys()).filter(
      (id) => config[id]?.enabled !== false
    );
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
  
  // Register Phase 2 adapters (Eastleigh, Rushmoor)
  adapterRegistry.register(new EastleighAdapter());
  adapterRegistry.register(new RushmoorAdapter());
  
  // Register Phase 3 Wave 1 adapters (Fareham, East Hampshire)
  adapterRegistry.register(new FarehamAdapter());
  adapterRegistry.register(new EastHampshireAdapter());
  
  // Register postponed adapters (New Forest)
  adapterRegistry.register(new NewForestAdapter());
  adapterRegistry.register(new SouthamptonAdapter());
  
  // Register Phase 3 Wave 2 adapters - Batch A (form-based councils)
  adapterRegistry.register(new BasingstokeDeaneAdapter());
  adapterRegistry.register(new GosportAdapter());
  adapterRegistry.register(new HavantAdapter());
  adapterRegistry.register(new HartAdapter());
  
  // Register Phase 3 Wave 2 adapters - Batch B (form-based + React SPA)
  adapterRegistry.register(new PortsmouthAdapter());
  adapterRegistry.register(new TestValleyAdapter());
  adapterRegistry.register(new WinchesterAdapter());
  
  const registeredCount = adapterRegistry.getAll().length;
  console.log(`[REGISTRY] Initialized ${registeredCount} adapter(s)`);
  
  // Log status of each adapter
  for (const adapter of adapterRegistry.getAll()) {
    console.log(`  - ${adapter.councilId}: registered`);
  }
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

/**
 * Get list of enabled councils from configuration (regardless of implementation).
 * Useful for drift detection and config-only operations.
 */
export function getEnabledCouncils(): string[] {
  const config = loadAdapterConfig();
  return Object.entries(config)
    .filter(([_, c]) => c.enabled)
    .map(([id]) => id);
}

/**
 * Get adapter configuration for a council.
 * Returns null if not found.
 */
export function getAdapterConfig(councilId: string): AdapterConfigEntry | null {
  const config = loadAdapterConfig();
  return config[councilId] || null;
}

/**
 * Check if an adapter has a TypeScript implementation.
 */
export function hasImplementation(councilId: string): boolean {
  return councilId in adapterImplementations;
}

