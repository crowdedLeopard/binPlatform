/**
 * Hampshire Bin Collection Data Platform
 * Confidence Scoring Engine
 *
 * Calculates confidence scores for acquisition results using weighted
 * multi-factor analysis. Every CollectionEventResult carries a confidence
 * score computed consistently across all adapters.
 *
 * @module core/confidence
 */

import { LookupMethod } from '../../adapters/base/adapter.interface';
import {
  ConfidenceFactors,
  ConfidenceAssessment,
  UpstreamRiskLevel,
} from './types';
import { calculateFreshnessScore } from './freshness';
import { interpretConfidenceScore } from './thresholds';

/**
 * Base confidence scores for acquisition methods.
 * Higher scores for more reliable/structured data sources.
 */
const METHOD_BASE_SCORES: Record<LookupMethod, number> = {
  [LookupMethod.API]: 1.0,
  [LookupMethod.HIDDEN_JSON]: 0.95,
  [LookupMethod.HTML_FORM]: 0.85,
  [LookupMethod.BROWSER_AUTOMATION]: 0.75,
  [LookupMethod.PDF_CALENDAR]: 0.7,
  [LookupMethod.UNKNOWN]: 0.3,
  [LookupMethod.UNSUPPORTED]: 0.0,
};

/**
 * Upstream risk level modifiers.
 */
const UPSTREAM_RISK_MODIFIERS: Record<UpstreamRiskLevel, number> = {
  low: 1.0,
  medium: 0.9,
  high: 0.75,
};

/**
 * Component weights for final score calculation.
 * Totals to 1.0 for weighted average.
 */
const COMPONENT_WEIGHTS = {
  method: 0.35,
  freshness: 0.25,
  validation: 0.25,
  health: 0.15,
} as const;

/**
 * Compute validation score from pass/fail counts.
 *
 * @param passed - Number of validations passed
 * @param failed - Number of validations failed
 * @returns Validation score (0.0-1.0)
 */
function computeValidationScore(passed: number, failed: number): number {
  const total = passed + failed;

  if (total === 0) {
    // No validations run: assume valid
    return 1.0;
  }

  // Each failure reduces score by 10%, clamped at 0
  const failurePenalty = failed * 0.1;
  return Math.max(0.0, 1.0 - failurePenalty);
}

/**
 * Compute confidence score from weighted factors.
 *
 * Formula: (method_score × 0.35) + (freshness_score × 0.25) +
 *          (validation_score × 0.25) + (health_score × 0.15)
 *
 * With multiplicative penalties for:
 * - Partial data: -15%
 * - Stale cache: -10%
 * - Parse warnings: -5% each
 *
 * @param factors - Confidence factors for this acquisition
 * @returns Confidence assessment with score and breakdown
 *
 * @example
 * const factors: ConfidenceFactors = {
 *   acquisitionMethod: LookupMethod.API,
 *   sourceAge: 2,
 *   parseWarnings: 0,
 *   upstreamRiskLevel: 'low',
 *   validationsPassed: 5,
 *   validationsFailed: 0,
 *   isPartialData: false,
 *   isCachedResult: true,
 *   adapterHealthScore: 0.98,
 *   isCacheStale: false,
 * };
 * const assessment = computeConfidence(factors);
 * // → score: ~0.97, level: 'confirmed'
 */
export function computeConfidence(
  factors: ConfidenceFactors
): ConfidenceAssessment {
  const penalties: string[] = [];

  // Component scores
  const methodScore =
    METHOD_BASE_SCORES[factors.acquisitionMethod] *
    UPSTREAM_RISK_MODIFIERS[factors.upstreamRiskLevel];

  const freshnessScore = calculateFreshnessScore(
    factors.sourceAge,
    factors.acquisitionMethod
  );

  const validationScore = computeValidationScore(
    factors.validationsPassed,
    factors.validationsFailed
  );

  const healthScore = factors.adapterHealthScore;

  // Weighted base score
  let score =
    methodScore * COMPONENT_WEIGHTS.method +
    freshnessScore * COMPONENT_WEIGHTS.freshness +
    validationScore * COMPONENT_WEIGHTS.validation +
    healthScore * COMPONENT_WEIGHTS.health;

  // Apply multiplicative penalties
  if (factors.isPartialData) {
    score *= 0.85;
    penalties.push('partial_data');
  }

  if (factors.isCacheStale) {
    score *= 0.9;
    penalties.push('stale_cache');
  }

  if (factors.parseWarnings > 0) {
    const warningPenalty = Math.max(
      0.5,
      1.0 - factors.parseWarnings * 0.05
    );
    score *= warningPenalty;
    penalties.push(`parse_warnings:${factors.parseWarnings}`);
  }

  // Clamp to [0, 1]
  score = Math.max(0.0, Math.min(1.0, score));

  const level = interpretConfidenceScore(score);

  return {
    score,
    level,
    factors,
    componentScores: {
      methodScore,
      freshnessScore,
      validationScore,
      healthScore,
    },
    penaltiesApplied: penalties,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Re-export types and utilities.
 */
export * from './types';
export * from './freshness';
export * from './thresholds';
