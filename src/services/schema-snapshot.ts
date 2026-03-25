/**
 * Schema Snapshot Service
 * 
 * Detects structural changes in API responses by hashing response schemas.
 * Used to monitor for council website changes that could break adapters.
 * 
 * @module services/schema-snapshot
 */

import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOTS_PATH = path.join(__dirname, '../../data/schema-snapshots.json');

export interface SchemaSnapshot {
  councilId: string;
  hash: string;
  capturedAt: string;
  responseKeys: string[];
  structureDepth: number;
}

export interface SchemaComparisonResult {
  councilId: string;
  changed: boolean;
  previousHash: string | null;
  currentHash: string;
  changedFields?: string[];
  previousSnapshot?: SchemaSnapshot;
}

/**
 * Hash the structure of an API response (keys and types, not values).
 * 
 * @param response - The API response to hash
 * @returns SHA-256 hash (first 16 chars) of the response structure
 */
export function hashResponseSchema(response: unknown): string {
  const structure = extractStructure(response);
  const structureJson = JSON.stringify(structure, null, 0);
  return crypto
    .createHash('sha256')
    .update(structureJson)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Extract the structural signature of an object (recursive).
 * 
 * This captures the shape of the data, not the values:
 * - For objects: map of keys to their value types
 * - For arrays: array length indicator + first element structure
 * - For primitives: the JavaScript type
 * 
 * @param obj - The object to extract structure from
 * @param depth - Current recursion depth (max 3 to avoid deep nesting)
 * @returns Structural representation of the object
 */
function extractStructure(obj: unknown, depth = 0): unknown {
  // Limit depth to avoid infinite recursion and overly-deep structures
  if (depth > 3) {
    return typeof obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return ['empty'];
    }
    // Capture array length category and structure of first element
    const lengthCategory = obj.length === 1 ? 'single' : obj.length < 10 ? 'few' : 'many';
    return [lengthCategory, extractStructure(obj[0], depth + 1)];
  }

  if (obj && typeof obj === 'object') {
    const entries = Object.entries(obj).map(([key, value]) => [
      key,
      extractStructure(value, depth + 1),
    ]);
    return Object.fromEntries(entries);
  }

  // Primitives: return their type
  if (obj === null) return 'null';
  if (obj === undefined) return 'undefined';
  return typeof obj;
}

/**
 * Get all response keys from an API response (top-level only).
 * 
 * @param response - The API response
 * @returns Array of top-level keys
 */
function getResponseKeys(response: unknown): string[] {
  if (response && typeof response === 'object' && !Array.isArray(response)) {
    return Object.keys(response);
  }
  return [];
}

/**
 * Calculate structure depth (how many levels deep the object is).
 * 
 * @param obj - The object to measure
 * @returns Maximum depth
 */
function calculateDepth(obj: unknown): number {
  if (Array.isArray(obj)) {
    if (obj.length === 0) return 1;
    return 1 + Math.max(...obj.map(calculateDepth));
  }

  if (obj && typeof obj === 'object') {
    const depths = Object.values(obj).map(calculateDepth);
    return depths.length === 0 ? 1 : 1 + Math.max(...depths);
  }

  return 0;
}

/**
 * Create a new schema snapshot from an API response.
 * 
 * @param councilId - The council ID this snapshot is for
 * @param response - The API response to snapshot
 * @returns Schema snapshot object
 */
export function createSnapshot(councilId: string, response: unknown): SchemaSnapshot {
  return {
    councilId,
    hash: hashResponseSchema(response),
    capturedAt: new Date().toISOString(),
    responseKeys: getResponseKeys(response),
    structureDepth: calculateDepth(response),
  };
}

/**
 * Load all stored schema snapshots from disk.
 * 
 * @returns Map of council ID to schema snapshot
 */
export function loadSnapshots(): Map<string, SchemaSnapshot> {
  if (!existsSync(SNAPSHOTS_PATH)) {
    return new Map();
  }

  try {
    const data = readFileSync(SNAPSHOTS_PATH, 'utf-8');
    const snapshots: SchemaSnapshot[] = JSON.parse(data);
    return new Map(snapshots.map((s) => [s.councilId, s]));
  } catch (error) {
    console.warn('[SCHEMA] Failed to load snapshots:', error);
    return new Map();
  }
}

/**
 * Save schema snapshots to disk.
 * 
 * @param snapshots - Map of council ID to schema snapshot
 */
export function saveSnapshots(snapshots: Map<string, SchemaSnapshot>): void {
  const snapshotArray = Array.from(snapshots.values());
  writeFileSync(SNAPSHOTS_PATH, JSON.stringify(snapshotArray, null, 2), 'utf-8');
}

/**
 * Compare a new API response against a stored snapshot.
 * 
 * @param councilId - The council ID to check
 * @param response - The current API response
 * @returns Comparison result showing if schema changed
 */
export function compareWithSnapshot(
  councilId: string,
  response: unknown
): SchemaComparisonResult {
  const snapshots = loadSnapshots();
  const previousSnapshot = snapshots.get(councilId);
  const currentHash = hashResponseSchema(response);

  if (!previousSnapshot) {
    return {
      councilId,
      changed: false,
      previousHash: null,
      currentHash,
    };
  }

  const changed = previousSnapshot.hash !== currentHash;
  const currentKeys = getResponseKeys(response);
  const previousKeys = previousSnapshot.responseKeys;

  let changedFields: string[] | undefined;
  if (changed) {
    // Identify which keys changed
    const addedKeys = currentKeys.filter((k) => !previousKeys.includes(k));
    const removedKeys = previousKeys.filter((k) => !currentKeys.includes(k));
    changedFields = [
      ...addedKeys.map((k) => `+${k}`),
      ...removedKeys.map((k) => `-${k}`),
    ];
  }

  return {
    councilId,
    changed,
    previousHash: previousSnapshot.hash,
    currentHash,
    changedFields,
    previousSnapshot,
  };
}

/**
 * Update or create a snapshot for a council.
 * 
 * @param councilId - The council ID to update
 * @param response - The current API response
 * @returns The created/updated snapshot
 */
export function updateSnapshot(councilId: string, response: unknown): SchemaSnapshot {
  const snapshots = loadSnapshots();
  const newSnapshot = createSnapshot(councilId, response);
  snapshots.set(councilId, newSnapshot);
  saveSnapshots(snapshots);
  return newSnapshot;
}

/**
 * Delete a snapshot for a council.
 * 
 * @param councilId - The council ID to delete
 * @returns true if deleted, false if not found
 */
export function deleteSnapshot(councilId: string): boolean {
  const snapshots = loadSnapshots();
  const existed = snapshots.has(councilId);
  snapshots.delete(councilId);
  saveSnapshots(snapshots);
  return existed;
}
