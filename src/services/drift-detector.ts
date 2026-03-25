/**
 * Drift Detection Service
 * 
 * Monitors council adapters for unexpected changes (schema drift, endpoint failures).
 * Runs periodic health checks and compares responses against stored schema snapshots.
 * 
 * @module services/drift-detector
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { compareWithSnapshot, updateSnapshot } from './schema-snapshot.js';
import type { SchemaComparisonResult } from './schema-snapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, '../../data/adapter-config.json');
const TEST_POSTCODES_PATH = path.join(__dirname, '../../data/test-postcodes.json');
const DRIFT_STATE_PATH = path.join(__dirname, '../../data/drift-state.json');

export type DriftStatus = 'ok' | 'drifted' | 'unreachable' | 'unknown' | 'disabled';

export interface DriftCheckResult {
  councilId: string;
  status: DriftStatus;
  lastOkAt: string | null;
  schemaChanged: boolean;
  httpStatusChanged: boolean;
  responseTimeMs: number;
  details: string;
  httpStatus?: number;
  schemaComparison?: SchemaComparisonResult;
  timestamp: string;
}

export interface AdapterConfig {
  council_id: string;
  display_name: string;
  base_url: string;
  address_lookup_path: string | null;
  address_lookup_params: Record<string, string> | null;
  collection_lookup_path: string | null;
  collection_lookup_params: Record<string, string> | null;
  method: string;
  response_format: 'json' | 'html';
  postcode_param: string | null;
  property_param: string | null;
  enabled: boolean;
  last_verified: string;
  schema_hash: string | null;
  notes: string;
}

export interface DriftState {
  councilId: string;
  lastOkAt: string | null;
  lastCheckedAt: string;
  consecutiveFailures: number;
  lastHttpStatus: number | null;
  lastSchemaHash: string | null;
}

/**
 * Load adapter configurations from disk.
 */
function loadAdapterConfig(): Record<string, AdapterConfig> {
  if (!existsSync(CONFIG_PATH)) {
    throw new Error(`Adapter config not found: ${CONFIG_PATH}`);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
}

/**
 * Load test postcodes from disk.
 */
function loadTestPostcodes(): Record<string, string> {
  if (!existsSync(TEST_POSTCODES_PATH)) {
    throw new Error(`Test postcodes not found: ${TEST_POSTCODES_PATH}`);
  }
  const data = JSON.parse(readFileSync(TEST_POSTCODES_PATH, 'utf-8'));
  // Handle both old format (flat) and new format (nested under "postcodes")
  return data.postcodes || data;
}

/**
 * Load drift state from disk.
 */
function loadDriftState(): Map<string, DriftState> {
  if (!existsSync(DRIFT_STATE_PATH)) {
    return new Map();
  }

  try {
    const data = readFileSync(DRIFT_STATE_PATH, 'utf-8');
    const states: DriftState[] = JSON.parse(data);
    return new Map(states.map((s) => [s.councilId, s]));
  } catch (error) {
    console.warn('[DRIFT] Failed to load drift state:', error);
    return new Map();
  }
}

/**
 * Save drift state to disk.
 */
function saveDriftState(states: Map<string, DriftState>): void {
  const stateArray = Array.from(states.values());
  writeFileSync(DRIFT_STATE_PATH, JSON.stringify(stateArray, null, 2), 'utf-8');
}

/**
 * Update drift state for a council.
 */
function updateDriftState(
  councilId: string,
  success: boolean,
  httpStatus: number | null,
  schemaHash: string | null
): void {
  const states = loadDriftState();
  const existing = states.get(councilId);

  const now = new Date().toISOString();

  if (success) {
    states.set(councilId, {
      councilId,
      lastOkAt: now,
      lastCheckedAt: now,
      consecutiveFailures: 0,
      lastHttpStatus: httpStatus,
      lastSchemaHash: schemaHash,
    });
  } else {
    states.set(councilId, {
      councilId,
      lastOkAt: existing?.lastOkAt || null,
      lastCheckedAt: now,
      consecutiveFailures: (existing?.consecutiveFailures || 0) + 1,
      lastHttpStatus: httpStatus,
      lastSchemaHash: schemaHash,
    });
  }

  saveDriftState(states);
}

/**
 * Make a test request to a council adapter endpoint.
 * 
 * @param config - Adapter configuration
 * @param postcode - Test postcode for the council
 * @returns Response data and metadata
 */
async function makeTestRequest(
  config: AdapterConfig,
  postcode: string
): Promise<{
  success: boolean;
  httpStatus: number | null;
  responseTimeMs: number;
  data: unknown;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    // For now, we only test API-based adapters (not HTML scrapers)
    if (config.response_format === 'html') {
      // HTML scrapers need more complex setup (browser automation)
      // For now, just do a simple HEAD request to check endpoint availability
      const response = await fetch(config.base_url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      });

      return {
        success: response.ok,
        httpStatus: response.status,
        responseTimeMs: Date.now() - startTime,
        data: null,
      };
    }

    // API-based adapters: make a real test request
    if (!config.collection_lookup_path) {
      return {
        success: false,
        httpStatus: null,
        responseTimeMs: Date.now() - startTime,
        data: null,
        error: 'No collection lookup path configured',
      };
    }

    const url = new URL(config.collection_lookup_path, config.base_url);

    // Add query params
    if (config.collection_lookup_params) {
      Object.entries(config.collection_lookup_params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    // Add postcode/property param if configured
    if (config.postcode_param) {
      url.searchParams.set(config.postcode_param, postcode);
    }

    const response = await fetch(url.toString(), {
      method: config.method,
      headers: {
        'User-Agent':
          'HampshireBinData/1.0 (Municipal Service; +https://binday.example.com/about)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(30000),
    });

    let data: unknown = null;
    if (response.ok) {
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    return {
      success: response.ok,
      httpStatus: response.status,
      responseTimeMs: Date.now() - startTime,
      data,
    };
  } catch (error) {
    return {
      success: false,
      httpStatus: null,
      responseTimeMs: Date.now() - startTime,
      data: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check a single adapter for drift.
 * 
 * Makes a test request and compares response schema against stored snapshot.
 * 
 * @param councilId - Council ID to check
 * @returns Drift check result
 */
export async function checkAdapterDrift(councilId: string): Promise<DriftCheckResult> {
  const timestamp = new Date().toISOString();

  try {
    // Load configuration
    const configs = loadAdapterConfig();
    const config = configs[councilId];

    if (!config) {
      return {
        councilId,
        status: 'unknown',
        lastOkAt: null,
        schemaChanged: false,
        httpStatusChanged: false,
        responseTimeMs: 0,
        details: 'Council not found in adapter configuration',
        timestamp,
      };
    }

    if (!config.enabled) {
      return {
        councilId,
        status: 'disabled',
        lastOkAt: null,
        schemaChanged: false,
        httpStatusChanged: false,
        responseTimeMs: 0,
        details: 'Adapter is disabled in configuration',
        timestamp,
      };
    }

    // Load test postcode
    const testPostcodes = loadTestPostcodes();
    const postcode = testPostcodes[councilId];

    if (!postcode) {
      return {
        councilId,
        status: 'unknown',
        lastOkAt: null,
        schemaChanged: false,
        httpStatusChanged: false,
        responseTimeMs: 0,
        details: 'No test postcode configured for council',
        timestamp,
      };
    }

    // Make test request
    const result = await makeTestRequest(config, postcode);

    // Load previous drift state
    const states = loadDriftState();
    const previousState = states.get(councilId);

    // Check for HTTP status change
    const httpStatusChanged =
      previousState?.lastHttpStatus !== null &&
      result.httpStatus !== previousState.lastHttpStatus;

    // Check for schema drift (only for successful JSON responses)
    let schemaChanged = false;
    let schemaComparison: SchemaComparisonResult | undefined;

    if (result.success && result.data && config.response_format === 'json') {
      schemaComparison = compareWithSnapshot(councilId, result.data);
      schemaChanged = schemaComparison.changed;

      // Update snapshot if schema changed
      if (schemaChanged) {
        updateSnapshot(councilId, result.data);
      }
    }

    // Determine overall status
    let status: DriftStatus;
    let details: string;

    if (!result.success) {
      status = 'unreachable';
      details = result.error || `HTTP ${result.httpStatus || 'error'}`;
    } else if (schemaChanged) {
      status = 'drifted';
      details = `Schema changed: ${schemaComparison?.changedFields?.join(', ') || 'unknown fields'}`;
    } else if (httpStatusChanged) {
      status = 'drifted';
      details = `HTTP status changed: ${previousState?.lastHttpStatus} → ${result.httpStatus}`;
    } else {
      status = 'ok';
      details = 'No drift detected';
    }

    // Update drift state
    const schemaHash = schemaComparison?.currentHash || null;
    updateDriftState(councilId, status === 'ok', result.httpStatus, schemaHash);

    return {
      councilId,
      status,
      lastOkAt: status === 'ok' ? timestamp : previousState?.lastOkAt || null,
      schemaChanged,
      httpStatusChanged,
      responseTimeMs: result.responseTimeMs,
      details,
      httpStatus: result.httpStatus || undefined,
      schemaComparison,
      timestamp,
    };
  } catch (error) {
    return {
      councilId,
      status: 'unknown',
      lastOkAt: null,
      schemaChanged: false,
      httpStatusChanged: false,
      responseTimeMs: 0,
      details: `Error checking drift: ${error instanceof Error ? error.message : String(error)}`,
      timestamp,
    };
  }
}

/**
 * Check all enabled adapters for drift in parallel.
 * 
 * @returns Array of drift check results for all enabled councils
 */
export async function checkAllAdaptersDrift(): Promise<DriftCheckResult[]> {
  const configs = loadAdapterConfig();
  const enabledCouncils = Object.entries(configs)
    .filter(([_, config]) => config.enabled)
    .map(([id]) => id);

  console.log(`[DRIFT] Checking ${enabledCouncils.length} enabled adapters...`);

  const results = await Promise.all(
    enabledCouncils.map((councilId) => checkAdapterDrift(councilId))
  );

  // Summary
  const statusCounts = results.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<DriftStatus, number>
  );

  console.log('[DRIFT] Check complete:', statusCounts);

  return results;
}

/**
 * Get drift state for a council.
 * 
 * @param councilId - Council ID to get state for
 * @returns Drift state or undefined if not found
 */
export function getDriftState(councilId: string): DriftState | undefined {
  const states = loadDriftState();
  return states.get(councilId);
}

/**
 * Get all drift states.
 * 
 * @returns Map of council ID to drift state
 */
export function getAllDriftStates(): Map<string, DriftState> {
  return loadDriftState();
}
