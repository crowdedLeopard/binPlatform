/**
 * Hampshire Bin Collection Data Platform
 * Schema Snapshot Utilities
 *
 * Utilities for capturing and comparing schema snapshots.
 *
 * @module core/drift/snapshot
 */

import { FieldSchema, SchemaSnapshot, ParsedResult } from './types';

/**
 * Infer schema from parsed result data.
 *
 * @param data - Parsed result data
 * @returns Field schema map
 */
function inferSchema(data: unknown, pathPrefix = ''): Record<string, FieldSchema> {
  const fields: Record<string, FieldSchema> = {};

  if (data === null || data === undefined) {
    return fields;
  }

  if (Array.isArray(data)) {
    // For arrays, analyze first few elements
    const samples = data.slice(0, 5);
    samples.forEach((item, idx) => {
      const itemFields = inferSchema(item, `${pathPrefix}[]`);
      Object.assign(fields, itemFields);
    });
    return fields;
  }

  if (typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      const path = pathPrefix ? `${pathPrefix}.${key}` : key;
      const types = [typeof value];
      const isArray = Array.isArray(value);

      fields[path] = {
        path,
        types,
        required: value !== null && value !== undefined,
        isArray,
        sampleValues: [value],
      };

      // Recurse for nested objects/arrays
      if (typeof value === 'object' && value !== null) {
        const nestedFields = inferSchema(value, path);
        Object.assign(fields, nestedFields);
      }

      // Extract numeric range
      if (typeof value === 'number') {
        fields[path].numericRange = { min: value, max: value };
      }

      // Extract string pattern (basic)
      if (typeof value === 'string') {
        fields[path].stringPattern = value.length > 0 ? `length:${value.length}` : 'empty';
      }
    }
  }

  return fields;
}

/**
 * Create schema snapshot from parsed result.
 *
 * @param result - Parsed result
 * @param version - Snapshot version number
 * @returns Schema snapshot
 */
export function createSnapshot(
  result: ParsedResult,
  version = 1
): SchemaSnapshot {
  const fields = inferSchema(result.data);

  return {
    councilId: result.metadata.councilId,
    version,
    fields,
    capturedAt: new Date().toISOString(),
    sampleSize: 1,
    isActive: true,
  };
}

/**
 * Merge multiple snapshots to improve schema accuracy.
 *
 * @param snapshots - Array of snapshots to merge
 * @returns Merged snapshot
 */
export function mergeSnapshots(snapshots: SchemaSnapshot[]): SchemaSnapshot {
  if (snapshots.length === 0) {
    throw new Error('Cannot merge empty snapshot array');
  }

  const base = snapshots[0];
  const mergedFields: Record<string, FieldSchema> = { ...base.fields };

  // Merge fields from all snapshots
  for (const snapshot of snapshots.slice(1)) {
    for (const [path, field] of Object.entries(snapshot.fields)) {
      if (mergedFields[path]) {
        // Merge types
        const existingTypes = new Set(mergedFields[path].types);
        field.types.forEach((t) => existingTypes.add(t));
        mergedFields[path].types = Array.from(existingTypes);

        // Update required flag (only required if present in all)
        mergedFields[path].required =
          mergedFields[path].required && field.required;

        // Merge sample values (keep up to 5)
        mergedFields[path].sampleValues = [
          ...mergedFields[path].sampleValues,
          ...field.sampleValues,
        ].slice(0, 5);

        // Merge numeric range
        if (field.numericRange && mergedFields[path].numericRange) {
          mergedFields[path].numericRange = {
            min: Math.min(
              mergedFields[path].numericRange!.min,
              field.numericRange.min
            ),
            max: Math.max(
              mergedFields[path].numericRange!.max,
              field.numericRange.max
            ),
          };
        }
      } else {
        // New field in this snapshot
        mergedFields[path] = field;
      }
    }
  }

  return {
    councilId: base.councilId,
    version: base.version,
    fields: mergedFields,
    capturedAt: new Date().toISOString(),
    sampleSize: snapshots.reduce((sum, s) => sum + s.sampleSize, 0),
    isActive: true,
  };
}
