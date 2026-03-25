/**
 * Hampshire Bin Collection Data Platform
 * Drift Detection Engine
 *
 * Detects schema drift in upstream data sources.
 *
 * @module core/drift
 */

import {
  DriftReport,
  SchemaSnapshot,
  ParsedResult,
  DriftType,
  DriftSeverity,
  DriftRecommendation,
} from './types';
import { createSnapshot } from './snapshot';

/**
 * Drift detector interface.
 */
export interface DriftDetector {
  /**
   * Detect drift between current result and last known schema.
   *
   * @param councilId - Council identifier
   * @param currentResult - Current parsed result
   * @param previousSchema - Previous schema snapshot
   * @returns Drift report
   */
  detectDrift(
    councilId: string,
    currentResult: ParsedResult,
    previousSchema: SchemaSnapshot
  ): DriftReport;

  /**
   * Record a schema snapshot after successful parse.
   *
   * @param councilId - Council identifier
   * @param result - Parsed result
   * @returns Promise resolving when snapshot is recorded
   */
  recordSnapshot(councilId: string, result: ParsedResult): Promise<void>;
}

/**
 * Compare two schemas and generate drift report.
 *
 * @param current - Current schema snapshot
 * @param previous - Previous schema snapshot
 * @returns Drift report
 */
function compareSchemas(
  current: SchemaSnapshot,
  previous: SchemaSnapshot
): DriftReport {
  const currentFields = new Set(Object.keys(current.fields));
  const previousFields = new Set(Object.keys(previous.fields));

  const newFields = Array.from(currentFields).filter(
    (f) => !previousFields.has(f)
  );
  const missingFields = Array.from(previousFields).filter(
    (f) => !currentFields.has(f)
  );
  const commonFields = Array.from(currentFields).filter((f) =>
    previousFields.has(f)
  );

  const typeChanges: string[] = [];

  // Check for type changes in common fields
  for (const field of commonFields) {
    const currentTypes = new Set(current.fields[field].types);
    const previousTypes = new Set(previous.fields[field].types);

    const typesMatch =
      currentTypes.size === previousTypes.size &&
      Array.from(currentTypes).every((t) => previousTypes.has(t));

    if (!typesMatch) {
      typeChanges.push(field);
    }
  }

  // Determine drift type and severity
  let driftType: DriftType = 'none';
  let severity: DriftSeverity = 'minor';
  let recommendation: DriftRecommendation = 'log_and_continue';
  let description = 'No schema drift detected';
  const affectedFields: string[] = [];

  if (missingFields.length > 0) {
    driftType = 'missing_fields';
    affectedFields.push(...missingFields);
    description = `${missingFields.length} field(s) missing from current response`;

    // Missing required fields is breaking
    const missingRequired = missingFields.filter(
      (f) => previous.fields[f].required
    );
    if (missingRequired.length > 0) {
      severity = 'breaking';
      recommendation = 'fail_acquisition';
      description = `${missingRequired.length} required field(s) missing: ${missingRequired.join(', ')}`;
    } else {
      severity = 'major';
      recommendation = 'flag_for_review';
    }
  }

  if (typeChanges.length > 0) {
    driftType = 'type_change';
    affectedFields.push(...typeChanges);
    description = `Type change detected in ${typeChanges.length} field(s): ${typeChanges.join(', ')}`;
    severity = 'breaking';
    recommendation = 'fail_acquisition';
  }

  if (newFields.length > 0 && driftType === 'none') {
    driftType = 'new_fields';
    affectedFields.push(...newFields);
    description = `${newFields.length} new field(s) detected: ${newFields.join(', ')}`;
    severity = 'minor';
    recommendation = 'log_and_continue';
  }

  return {
    hasDrift: driftType !== 'none',
    driftType,
    affectedFields,
    severity,
    recommendation,
    description,
    detectedAt: new Date().toISOString(),
  };
}

/**
 * In-memory drift detector implementation.
 * Production implementation should use PostgreSQL storage.
 */
export class InMemoryDriftDetector implements DriftDetector {
  private snapshots: Map<string, SchemaSnapshot> = new Map();

  detectDrift(
    councilId: string,
    currentResult: ParsedResult,
    previousSchema: SchemaSnapshot
  ): DriftReport {
    const currentSnapshot = createSnapshot(currentResult);
    return compareSchemas(currentSnapshot, previousSchema);
  }

  async recordSnapshot(councilId: string, result: ParsedResult): Promise<void> {
    const snapshot = createSnapshot(result);
    this.snapshots.set(councilId, snapshot);
  }

  getSnapshot(councilId: string): SchemaSnapshot | undefined {
    return this.snapshots.get(councilId);
  }
}

/**
 * Re-export types.
 */
export * from './types';
export * from './snapshot';
