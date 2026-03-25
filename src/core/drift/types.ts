/**
 * Hampshire Bin Collection Data Platform
 * Drift Detection Types
 *
 * Type definitions for schema drift detection.
 *
 * @module core/drift
 */

/**
 * Type of drift detected.
 */
export type DriftType =
  | 'new_fields'
  | 'missing_fields'
  | 'type_change'
  | 'value_range_change'
  | 'none';

/**
 * Severity of detected drift.
 */
export type DriftSeverity = 'minor' | 'major' | 'breaking';

/**
 * Recommended action for drift.
 */
export type DriftRecommendation =
  | 'log_and_continue'
  | 'flag_for_review'
  | 'fail_acquisition';

/**
 * Drift detection report.
 */
export interface DriftReport {
  /** Whether schema drift was detected */
  hasDrift: boolean;

  /** Type of drift detected */
  driftType: DriftType;

  /** Fields affected by drift */
  affectedFields: string[];

  /** Severity of drift */
  severity: DriftSeverity;

  /** Recommended action */
  recommendation: DriftRecommendation;

  /** Human-readable description of drift */
  description: string;

  /** ISO 8601 timestamp of detection */
  detectedAt: string;
}

/**
 * Schema snapshot for a single parsed result.
 */
export interface SchemaSnapshot {
  /** Council identifier */
  councilId: string;

  /** Snapshot version (incremented on schema change) */
  version: number;

  /** Field types detected in response */
  fields: Record<string, FieldSchema>;

  /** ISO 8601 timestamp when snapshot was taken */
  capturedAt: string;

  /** Sample size used to infer schema */
  sampleSize: number;

  /** Whether this is the active/current schema */
  isActive: boolean;
}

/**
 * Schema for a single field.
 */
export interface FieldSchema {
  /** Field path (e.g., "events[].collectionDate") */
  path: string;

  /** Detected type(s) */
  types: string[];

  /** Whether field is always present */
  required: boolean;

  /** Whether field is an array */
  isArray: boolean;

  /** Sample values (up to 5, for range detection) */
  sampleValues: unknown[];

  /** Observed min/max for numeric fields */
  numericRange?: { min: number; max: number };

  /** Observed pattern for string fields (regex-like) */
  stringPattern?: string;
}

/**
 * Parsed result structure for drift detection.
 * Simplified representation of adapter output.
 */
export interface ParsedResult {
  /** Result data (any structure) */
  data: unknown;

  /** Result metadata */
  metadata: {
    councilId: string;
    acquiredAt: string;
  };
}
