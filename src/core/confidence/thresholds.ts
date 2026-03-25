/**
 * Hampshire Bin Collection Data Platform
 * Confidence Thresholds
 *
 * Named thresholds and interpretation functions for confidence scores.
 *
 * @module core/confidence/thresholds
 */

import { CONFIDENCE, ConfidenceLevel } from './types';

/**
 * Interpret a confidence score as a named level.
 *
 * @param score - Confidence score (0.0-1.0)
 * @returns Named confidence level
 *
 * @example
 * interpretConfidenceScore(0.9) // → 'confirmed'
 * interpretConfidenceScore(0.7) // → 'likely'
 * interpretConfidenceScore(0.5) // → 'unverified'
 * interpretConfidenceScore(0.1) // → 'stale'
 */
export function interpretConfidenceScore(score: number): ConfidenceLevel {
  if (score >= CONFIDENCE.HIGH) return 'confirmed';
  if (score >= CONFIDENCE.MEDIUM) return 'likely';
  if (score >= CONFIDENCE.LOW) return 'unverified';
  return 'stale';
}

/**
 * Check if confidence score meets minimum threshold.
 *
 * @param score - Confidence score to check
 * @param minLevel - Minimum required level
 * @returns True if score meets or exceeds minimum level
 */
export function meetsConfidenceThreshold(
  score: number,
  minLevel: ConfidenceLevel
): boolean {
  const thresholds: Record<ConfidenceLevel, number> = {
    confirmed: CONFIDENCE.HIGH,
    likely: CONFIDENCE.MEDIUM,
    unverified: CONFIDENCE.LOW,
    stale: CONFIDENCE.STALE,
  };

  return score >= thresholds[minLevel];
}

/**
 * Get human-readable description for confidence level.
 *
 * @param level - Confidence level
 * @returns Human-readable description
 */
export function getConfidenceDescription(level: ConfidenceLevel): string {
  const descriptions: Record<ConfidenceLevel, string> = {
    confirmed:
      'High confidence - data acquired from reliable source with validation',
    likely:
      'Likely accurate - data acquired successfully but with minor concerns',
    unverified:
      'Unverified - data present but reliability uncertain, verify independently',
    stale:
      'Stale data - refresh recommended, may not reflect current information',
  };

  return descriptions[level];
}

/**
 * Determine if score should trigger re-acquisition.
 *
 * @param score - Current confidence score
 * @returns True if re-acquisition should be triggered
 */
export function shouldTriggerReacquisition(score: number): boolean {
  return score <= CONFIDENCE.STALE;
}
