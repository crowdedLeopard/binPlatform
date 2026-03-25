/**
 * Confidence Scoring Unit Tests
 * 
 * Tests the confidence score calculation logic for collection data.
 * Confidence reflects data quality, freshness, and method reliability.
 */

import { describe, it, expect } from 'vitest';
import type { LookupMethod } from '../../../src/adapters/base/adapter.interface';

type ConfidenceFactors = {
  method: LookupMethod;
  ageHours: number;
  parseWarnings: number;
  validationFailures: number;
  isPartialData: boolean;
  upstreamRiskLevel: 'low' | 'medium' | 'high' | 'critical';
};

type ConfidenceThresholds = {
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  STALE: number;
};

const CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  HIGH: 0.8,
  MEDIUM: 0.6,
  LOW: 0.4,
  STALE: 0.2,
};

const computeConfidence = (factors: ConfidenceFactors): number => {
  const methodBaseScores: Record<LookupMethod, number> = {
    api: 0.95,
    hidden_json: 0.85,
    pdf_calendar: 0.70,
    browser_automation: 0.75,
    html_form: 0.80,
    unsupported: 0.0,
    unknown: 0.5,
  };

  let confidence = methodBaseScores[factors.method] || 0.5;

  // Freshness decay (API method example)
  if (factors.method === 'api') {
    if (factors.ageHours > 24) {
      const hoursOver = factors.ageHours - 24;
      const decay = Math.min(hoursOver * 0.02, 0.5);
      confidence -= decay;
    }
  }

  // Parse warnings penalty
  const warningPenalty = factors.parseWarnings * 0.05;
  confidence -= warningPenalty;

  // Partial data penalty
  if (factors.isPartialData) {
    confidence -= 0.15;
  }

  // Upstream risk multiplier
  const riskMultipliers = {
    low: 1.0,
    medium: 0.95,
    high: 0.85,
    critical: 0.7,
  };
  confidence *= riskMultipliers[factors.upstreamRiskLevel];

  // Validation failures penalty
  const validationPenalty = factors.validationFailures * 0.10;
  confidence -= validationPenalty;

  // Clamp to [0, 1]
  return Math.max(0.0, Math.min(1.0, confidence));
};

describe('Confidence Scoring', () => {
  describe('Base Scores by Acquisition Method', () => {
    it('API method should have base score ~0.95', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeCloseTo(0.95, 2);
    });

    it('PDF method should have base score ~0.70', () => {
      const factors: ConfidenceFactors = {
        method: 'pdf_calendar',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeCloseTo(0.70, 2);
    });

    it('Browser method should have base score ~0.75', () => {
      const factors: ConfidenceFactors = {
        method: 'browser_automation',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeCloseTo(0.75, 2);
    });
  });

  describe('Freshness Decay', () => {
    it('fresh data (0 hours old) should have no freshness penalty', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeCloseTo(0.95, 2);
    });

    it('stale data (25 hours old, API) should have confidence below 0.5', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 25,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeLessThan(0.5);
      expect(confidence).toBeGreaterThan(0.0);
    });

    it('very stale data (72+ hours) should have confidence <= 0.25', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 72,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeLessThanOrEqual(0.25);
    });
  });

  describe('Parse Warnings Penalty', () => {
    it('3 parse warnings should reduce confidence by 0.15', () => {
      const baseFactors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const withWarningsFactors: ConfidenceFactors = {
        ...baseFactors,
        parseWarnings: 3,
      };

      const baseConfidence = computeConfidence(baseFactors);
      const withWarnings = computeConfidence(withWarningsFactors);

      const difference = baseConfidence - withWarnings;
      expect(difference).toBeCloseTo(0.15, 2);
    });
  });

  describe('Partial Data Flag', () => {
    it('partial data flag should reduce confidence by 0.15', () => {
      const baseFactors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const partialFactors: ConfidenceFactors = {
        ...baseFactors,
        isPartialData: true,
      };

      const baseConfidence = computeConfidence(baseFactors);
      const partialConfidence = computeConfidence(partialFactors);

      const difference = baseConfidence - partialConfidence;
      expect(difference).toBeCloseTo(0.15, 2);
    });
  });

  describe('Upstream Risk Multiplier', () => {
    it('high upstream risk should apply multiplier', () => {
      const lowRiskFactors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const highRiskFactors: ConfidenceFactors = {
        ...lowRiskFactors,
        upstreamRiskLevel: 'high',
      };

      const lowRiskConfidence = computeConfidence(lowRiskFactors);
      const highRiskConfidence = computeConfidence(highRiskFactors);

      expect(highRiskConfidence).toBeLessThan(lowRiskConfidence);
      expect(highRiskConfidence).toBeCloseTo(lowRiskConfidence * 0.85, 2);
    });
  });

  describe('Validation Failures Penalty', () => {
    it('2 validation failures should reduce confidence by 0.20', () => {
      const baseFactors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const withFailuresFactors: ConfidenceFactors = {
        ...baseFactors,
        validationFailures: 2,
      };

      const baseConfidence = computeConfidence(baseFactors);
      const withFailures = computeConfidence(withFailuresFactors);

      const difference = baseConfidence - withFailures;
      expect(difference).toBeCloseTo(0.20, 2);
    });
  });

  describe('Combined Penalties', () => {
    it('all penalties combined should be clamped to minimum 0.0', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 100,
        parseWarnings: 10,
        validationFailures: 5,
        isPartialData: true,
        upstreamRiskLevel: 'critical',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeGreaterThanOrEqual(0.0);
      expect(confidence).toBeLessThanOrEqual(1.0);
    });

    it('confidence should never be negative', () => {
      const extremeFactors: ConfidenceFactors = {
        method: 'unknown',
        ageHours: 200,
        parseWarnings: 20,
        validationFailures: 10,
        isPartialData: true,
        upstreamRiskLevel: 'critical',
      };

      const confidence = computeConfidence(extremeFactors);
      expect(confidence).toBe(0.0);
    });
  });

  describe('Deterministic Computation', () => {
    it('same inputs should always produce same output', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 12,
        parseWarnings: 2,
        validationFailures: 1,
        isPartialData: false,
        upstreamRiskLevel: 'medium',
      };

      const confidence1 = computeConfidence(factors);
      const confidence2 = computeConfidence(factors);
      const confidence3 = computeConfidence(factors);

      expect(confidence1).toBe(confidence2);
      expect(confidence2).toBe(confidence3);
    });
  });

  describe('Named Thresholds', () => {
    it('HIGH threshold should be 0.8', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBe(0.8);
    });

    it('MEDIUM threshold should be 0.6', () => {
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBe(0.6);
    });

    it('LOW threshold should be 0.4', () => {
      expect(CONFIDENCE_THRESHOLDS.LOW).toBe(0.4);
    });

    it('STALE threshold should be 0.2', () => {
      expect(CONFIDENCE_THRESHOLDS.STALE).toBe(0.2);
    });

    it('thresholds should be in descending order', () => {
      expect(CONFIDENCE_THRESHOLDS.HIGH).toBeGreaterThan(CONFIDENCE_THRESHOLDS.MEDIUM);
      expect(CONFIDENCE_THRESHOLDS.MEDIUM).toBeGreaterThan(CONFIDENCE_THRESHOLDS.LOW);
      expect(CONFIDENCE_THRESHOLDS.LOW).toBeGreaterThan(CONFIDENCE_THRESHOLDS.STALE);
    });
  });

  describe('Threshold Classification', () => {
    it('confidence 0.85 should be classified as HIGH', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 0,
        parseWarnings: 1,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeGreaterThan(CONFIDENCE_THRESHOLDS.HIGH);
    });

    it('confidence 0.65 should be classified as MEDIUM', () => {
      const factors: ConfidenceFactors = {
        method: 'pdf_calendar',
        ageHours: 0,
        parseWarnings: 1,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeGreaterThan(CONFIDENCE_THRESHOLDS.MEDIUM);
      expect(confidence).toBeLessThan(CONFIDENCE_THRESHOLDS.HIGH);
    });

    it('confidence 0.45 should be classified as LOW', () => {
      const factors: ConfidenceFactors = {
        method: 'unknown',
        ageHours: 0,
        parseWarnings: 1,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeGreaterThan(CONFIDENCE_THRESHOLDS.LOW);
      expect(confidence).toBeLessThan(CONFIDENCE_THRESHOLDS.MEDIUM);
    });
  });

  describe('Real-World Scenarios', () => {
    it('fresh API data with no issues should have very high confidence', () => {
      const factors: ConfidenceFactors = {
        method: 'api',
        ageHours: 1,
        parseWarnings: 0,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'low',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('PDF data with minor warnings should still be usable', () => {
      const factors: ConfidenceFactors = {
        method: 'pdf_calendar',
        ageHours: 48,
        parseWarnings: 2,
        validationFailures: 0,
        isPartialData: false,
        upstreamRiskLevel: 'medium',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeGreaterThan(CONFIDENCE_THRESHOLDS.MEDIUM);
      expect(confidence).toBeLessThan(CONFIDENCE_THRESHOLDS.HIGH);
    });

    it('stale browser automation data should have low confidence', () => {
      const factors: ConfidenceFactors = {
        method: 'browser_automation',
        ageHours: 96,
        parseWarnings: 3,
        validationFailures: 1,
        isPartialData: true,
        upstreamRiskLevel: 'high',
      };

      const confidence = computeConfidence(factors);
      expect(confidence).toBeLessThan(CONFIDENCE_THRESHOLDS.LOW);
    });
  });
});
