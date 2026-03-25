/**
 * Drift Detection Unit Tests
 * 
 * Tests schema drift detection for adapter responses.
 * Detects when upstream data structure changes from expected baseline.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type DriftType = 
  | 'new_fields' 
  | 'missing_fields' 
  | 'type_change' 
  | 'value_range_change' 
  | 'no_drift';

type DriftSeverity = 'minor' | 'major' | 'breaking';

type DriftRecommendation = 
  | 'log_and_continue' 
  | 'alert_team' 
  | 'fail_acquisition' 
  | 'none';

type SchemaSnapshot = {
  snapshotId: string;
  adapterId: string;
  capturedAt: string;
  sampleData: unknown;
  fieldTypes: Record<string, string>;
};

type DriftDetectionResult = {
  hasDrift: boolean;
  driftType?: DriftType;
  severity?: DriftSeverity;
  recommendation: DriftRecommendation;
  drifts: Array<{
    field: string;
    expected: string;
    actual: string;
    severity: DriftSeverity;
  }>;
};

const mockAuditLogger = {
  logDriftEvent: vi.fn(),
};

const detectDrift = (
  currentData: unknown,
  previousSnapshot: SchemaSnapshot | null
): DriftDetectionResult => {
  if (!previousSnapshot) {
    return {
      hasDrift: false,
      driftType: 'no_drift',
      recommendation: 'none',
      drifts: [],
    };
  }

  const currentFields = Object.keys(currentData as Record<string, unknown>);
  const snapshotFields = Object.keys(previousSnapshot.fieldTypes);

  const drifts: DriftDetectionResult['drifts'] = [];

  // Check for missing fields
  for (const field of snapshotFields) {
    if (!currentFields.includes(field)) {
      drifts.push({
        field,
        expected: previousSnapshot.fieldTypes[field],
        actual: 'missing',
        severity: 'major',
      });
    }
  }

  // Check for new fields
  for (const field of currentFields) {
    if (!snapshotFields.includes(field)) {
      drifts.push({
        field,
        expected: 'not_present',
        actual: typeof (currentData as Record<string, unknown>)[field],
        severity: 'minor',
      });
    }
  }

  // Check for type changes
  for (const field of currentFields) {
    if (snapshotFields.includes(field)) {
      const currentType = typeof (currentData as Record<string, unknown>)[field];
      const expectedType = previousSnapshot.fieldTypes[field];
      
      if (currentType !== expectedType) {
        drifts.push({
          field,
          expected: expectedType,
          actual: currentType,
          severity: 'breaking',
        });
      }
    }
  }

  if (drifts.length === 0) {
    return {
      hasDrift: false,
      driftType: 'no_drift',
      recommendation: 'none',
      drifts: [],
    };
  }

  // Determine overall drift type and severity
  const hasBreaking = drifts.some(d => d.severity === 'breaking');
  const hasMajor = drifts.some(d => d.severity === 'major');
  const hasNewFields = drifts.some(d => d.actual !== 'missing' && d.expected === 'not_present');
  const hasMissingFields = drifts.some(d => d.actual === 'missing');

  let driftType: DriftType;
  let severity: DriftSeverity;
  let recommendation: DriftRecommendation;

  if (hasBreaking) {
    driftType = 'type_change';
    severity = 'breaking';
    recommendation = 'fail_acquisition';
  } else if (hasMissingFields) {
    driftType = 'missing_fields';
    severity = 'major';
    recommendation = 'alert_team';
  } else if (hasNewFields) {
    driftType = 'new_fields';
    severity = 'minor';
    recommendation = 'log_and_continue';
  } else {
    driftType = 'no_drift';
    severity = 'minor';
    recommendation = 'log_and_continue';
  }

  // Log drift event
  mockAuditLogger.logDriftEvent({
    adapterId: previousSnapshot.adapterId,
    driftType,
    severity,
    drifts,
    timestamp: new Date().toISOString(),
  });

  return {
    hasDrift: true,
    driftType,
    severity,
    recommendation,
    drifts,
  };
};

describe('Drift Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('No Previous Snapshot', () => {
    it('should report no drift when no previous snapshot exists', () => {
      const currentData = {
        collectionDate: '2026-04-01',
        serviceType: 'general_waste',
      };

      const result = detectDrift(currentData, null);

      expect(result.hasDrift).toBe(false);
      expect(result.driftType).toBe('no_drift');
      expect(result.recommendation).toBe('none');
      expect(result.drifts).toHaveLength(0);
    });
  });

  describe('Identical Data', () => {
    it('should report no drift for identical result to snapshot', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_001',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          collectionDate: '2026-03-15',
          serviceType: 'general_waste',
          isConfirmed: true,
        },
        fieldTypes: {
          collectionDate: 'string',
          serviceType: 'string',
          isConfirmed: 'boolean',
        },
      };

      const currentData = {
        collectionDate: '2026-04-01',
        serviceType: 'recycling',
        isConfirmed: true,
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(false);
      expect(result.driftType).toBe('no_drift');
      expect(result.drifts).toHaveLength(0);
    });
  });

  describe('New Fields Drift', () => {
    it('should detect new field in result that was not in snapshot', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_002',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          collectionDate: '2026-03-15',
          serviceType: 'general_waste',
        },
        fieldTypes: {
          collectionDate: 'string',
          serviceType: 'string',
        },
      };

      const currentData = {
        collectionDate: '2026-04-01',
        serviceType: 'recycling',
        newField: 'unexpected_value',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(true);
      expect(result.driftType).toBe('new_fields');
      expect(result.severity).toBe('minor');
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].field).toBe('newField');
      expect(result.drifts[0].expected).toBe('not_present');
      expect(result.drifts[0].severity).toBe('minor');
    });

    it('should recommend "log_and_continue" for new fields', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_003',
        adapterId: 'fareham',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          date: '2026-03-15',
        },
        fieldTypes: {
          date: 'string',
        },
      };

      const currentData = {
        date: '2026-04-01',
        additionalInfo: 'new data',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.recommendation).toBe('log_and_continue');
    });
  });

  describe('Missing Fields Drift', () => {
    it('should detect field missing from result that was in snapshot', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_004',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          collectionDate: '2026-03-15',
          serviceType: 'general_waste',
          isConfirmed: true,
        },
        fieldTypes: {
          collectionDate: 'string',
          serviceType: 'string',
          isConfirmed: 'boolean',
        },
      };

      const currentData = {
        collectionDate: '2026-04-01',
        serviceType: 'recycling',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(true);
      expect(result.driftType).toBe('missing_fields');
      expect(result.severity).toBe('major');
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].field).toBe('isConfirmed');
      expect(result.drifts[0].actual).toBe('missing');
      expect(result.drifts[0].severity).toBe('major');
    });

    it('should recommend "alert_team" for missing fields', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_005',
        adapterId: 'fareham',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          date: '2026-03-15',
          critical_field: 'value',
        },
        fieldTypes: {
          date: 'string',
          critical_field: 'string',
        },
      };

      const currentData = {
        date: '2026-04-01',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.recommendation).toBe('alert_team');
    });
  });

  describe('Type Change Drift', () => {
    it('should detect field type change (string → number)', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_006',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          collectionDate: '2026-03-15',
          priority: 'high',
        },
        fieldTypes: {
          collectionDate: 'string',
          priority: 'string',
        },
      };

      const currentData = {
        collectionDate: '2026-04-01',
        priority: 5,
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(true);
      expect(result.driftType).toBe('type_change');
      expect(result.severity).toBe('breaking');
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].field).toBe('priority');
      expect(result.drifts[0].expected).toBe('string');
      expect(result.drifts[0].actual).toBe('number');
      expect(result.drifts[0].severity).toBe('breaking');
    });

    it('should recommend "fail_acquisition" for type changes', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_007',
        adapterId: 'fareham',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          isActive: true,
        },
        fieldTypes: {
          isActive: 'boolean',
        },
      };

      const currentData = {
        isActive: 'yes',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.recommendation).toBe('fail_acquisition');
    });
  });

  describe('Audit Event Logging', () => {
    it('should log drift event with audit logger for minor drift', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_008',
        adapterId: 'east-hampshire',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          date: '2026-03-15',
        },
        fieldTypes: {
          date: 'string',
        },
      };

      const currentData = {
        date: '2026-04-01',
        newOptionalField: 'value',
      };

      const result = detectDrift(currentData, snapshot);

      expect(mockAuditLogger.logDriftEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterId: 'east-hampshire',
          driftType: 'new_fields',
          severity: 'minor',
        })
      );
    });

    it('should log drift event with audit logger for breaking drift', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_009',
        adapterId: 'fareham',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          count: 5,
        },
        fieldTypes: {
          count: 'number',
        },
      };

      const currentData = {
        count: '5',
      };

      const result = detectDrift(currentData, snapshot);

      expect(mockAuditLogger.logDriftEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterId: 'fareham',
          driftType: 'type_change',
          severity: 'breaking',
          drifts: expect.arrayContaining([
            expect.objectContaining({
              field: 'count',
              expected: 'number',
              actual: 'string',
            }),
          ]),
        })
      );
    });

    it('should include timestamp in drift event', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_010',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          value: 'test',
        },
        fieldTypes: {
          value: 'string',
        },
      };

      const currentData = {
        value: 'test',
        extra: 'field',
      };

      detectDrift(currentData, snapshot);

      expect(mockAuditLogger.logDriftEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })
      );
    });
  });

  describe('Multiple Drifts', () => {
    it('should detect multiple types of drift simultaneously', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_011',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          date: '2026-03-15',
          type: 'refuse',
          confirmed: true,
        },
        fieldTypes: {
          date: 'string',
          type: 'string',
          confirmed: 'boolean',
        },
      };

      const currentData = {
        date: 2026,
        type: 'recycling',
        newField: 'surprise',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(true);
      expect(result.drifts).toHaveLength(3);
      
      // Breaking change (type change) should take precedence
      expect(result.severity).toBe('breaking');
      expect(result.driftType).toBe('type_change');
      expect(result.recommendation).toBe('fail_acquisition');
    });
  });

  describe('Drift Severity Precedence', () => {
    it('breaking drift should take precedence over major', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_012',
        adapterId: 'fareham',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          field1: 'value',
          field2: 5,
        },
        fieldTypes: {
          field1: 'string',
          field2: 'number',
        },
      };

      const currentData = {
        field2: '5',
      };

      const result = detectDrift(currentData, snapshot);

      // Has both missing field (major) and type change (breaking)
      expect(result.severity).toBe('breaking');
      expect(result.recommendation).toBe('fail_acquisition');
    });

    it('major drift should take precedence over minor', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_013',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          required: 'value',
        },
        fieldTypes: {
          required: 'string',
        },
      };

      const currentData = {
        optional: 'new',
      };

      const result = detectDrift(currentData, snapshot);

      // Has both missing field (major) and new field (minor)
      expect(result.severity).toBe('major');
      expect(result.recommendation).toBe('alert_team');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty current data', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_014',
        adapterId: 'eastleigh',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {
          field: 'value',
        },
        fieldTypes: {
          field: 'string',
        },
      };

      const currentData = {};

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(true);
      expect(result.driftType).toBe('missing_fields');
      expect(result.severity).toBe('major');
    });

    it('should handle empty snapshot', () => {
      const snapshot: SchemaSnapshot = {
        snapshotId: 'snap_015',
        adapterId: 'fareham',
        capturedAt: '2026-03-01T00:00:00Z',
        sampleData: {},
        fieldTypes: {},
      };

      const currentData = {
        newField: 'value',
      };

      const result = detectDrift(currentData, snapshot);

      expect(result.hasDrift).toBe(true);
      expect(result.driftType).toBe('new_fields');
      expect(result.severity).toBe('minor');
    });
  });
});
