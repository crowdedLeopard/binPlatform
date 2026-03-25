/**
 * Hampshire Bin Collection Data Platform
 * Confidence Scoring Types
 *
 * Type definitions for confidence scoring system.
 *
 * @module core/confidence
 */

import { LookupMethod } from '../../adapters/base/adapter.interface';

/**
 * Upstream source risk level assessment.
 */
export type UpstreamRiskLevel = 'low' | 'medium' | 'high';

/**
 * Factors that contribute to confidence score calculation.
 * All factors are logged with each acquisition for audit and debugging.
 */
export interface ConfidenceFactors {
  /** Method used to acquire data (api > json > html > browser > pdf) */
  acquisitionMethod: LookupMethod;

  /** Hours since data was acquired from source */
  sourceAge: number;

  /** Number of non-fatal warnings encountered during parse */
  parseWarnings: number;

  /** Risk level of upstream source (council stability/reliability) */
  upstreamRiskLevel: UpstreamRiskLevel;

  /** Number of field validations that passed */
  validationsPassed: number;

  /** Number of field validations that failed */
  validationsFailed: number;

  /** Whether data is incomplete/partial (missing expected fields) */
  isPartialData: boolean;

  /** Whether result came from cache rather than fresh acquisition */
  isCachedResult: boolean;

  /** Health score of adapter (0.0-1.0 from recent health checks) */
  adapterHealthScore: number;

  /** Whether cached data is stale (past freshness window) */
  isCacheStale?: boolean;
}

/**
 * Named confidence thresholds for interpretation.
 */
export const CONFIDENCE = {
  /** High confidence: display as "confirmed" */
  HIGH: 0.8,

  /** Medium confidence: display as "likely" */
  MEDIUM: 0.6,

  /** Low confidence: display as "unverified" */
  LOW: 0.4,

  /** Stale data: trigger re-acquisition */
  STALE: 0.2,
} as const;

/**
 * Confidence score interpretation for display.
 */
export type ConfidenceLevel = 'confirmed' | 'likely' | 'unverified' | 'stale';

/**
 * Full confidence assessment result.
 */
export interface ConfidenceAssessment {
  /** Final confidence score (0.0-1.0) */
  score: number;

  /** Interpretation level for display */
  level: ConfidenceLevel;

  /** Breakdown of contributing factors */
  factors: ConfidenceFactors;

  /** Weighted component scores for transparency */
  componentScores: {
    methodScore: number;
    freshnessScore: number;
    validationScore: number;
    healthScore: number;
  };

  /** Penalties applied (multiplicative) */
  penaltiesApplied: string[];

  /** ISO 8601 timestamp when assessment was made */
  assessedAt: string;
}
