/**
 * Hampshire Bin Collection Data Platform
 * Freshness Decay Functions
 *
 * Calculates time-based decay scores for data freshness.
 *
 * @module core/confidence/freshness
 */

import { LookupMethod } from '../../adapters/base/adapter.interface';

/**
 * Freshness decay curves for different acquisition methods.
 * Different data types have different staleness characteristics.
 */
const FRESHNESS_PROFILES = {
  /** API data: fresh for 4h, then linear decay */
  api: {
    freshUntilHours: 4,
    decayRate: 0.025, // lose 2.5% per hour after fresh window
    minScore: 0.2,
  },

  /** Hidden JSON: similar to API */
  hidden_json: {
    freshUntilHours: 4,
    decayRate: 0.025,
    minScore: 0.2,
  },

  /** HTML form: moderate decay */
  html_form: {
    freshUntilHours: 4,
    decayRate: 0.03,
    minScore: 0.2,
  },

  /** Browser automation: faster decay (higher acquisition cost) */
  browser_automation: {
    freshUntilHours: 4,
    decayRate: 0.03,
    minScore: 0.2,
  },

  /** PDF/calendar: slower decay (calendars change less frequently) */
  pdf_calendar: {
    freshUntilHours: 24,
    decayRate: 0.015,
    minScore: 0.2,
  },

  /** Unknown method: aggressive decay */
  unknown: {
    freshUntilHours: 1,
    decayRate: 0.1,
    minScore: 0.1,
  },

  /** Unsupported: immediate stale */
  unsupported: {
    freshUntilHours: 0,
    decayRate: 1.0,
    minScore: 0.0,
  },
} as const;

/**
 * Calculate freshness score based on data age and acquisition method.
 *
 * @param ageHours - Hours since data was acquired
 * @param method - Acquisition method used
 * @returns Freshness score (0.0-1.0)
 *
 * @example
 * // API data 2 hours old: still fresh
 * calculateFreshnessScore(2, LookupMethod.API) // → 1.0
 *
 * // API data 12 hours old: decaying
 * calculateFreshnessScore(12, LookupMethod.API) // → 0.8 (8h past fresh window × 2.5% = -20%)
 *
 * // PDF data 24 hours old: still fresh
 * calculateFreshnessScore(24, LookupMethod.PDF_CALENDAR) // → 1.0
 */
export function calculateFreshnessScore(
  ageHours: number,
  method: LookupMethod
): number {
  const profile = FRESHNESS_PROFILES[method] || FRESHNESS_PROFILES.unknown;

  // Within fresh window: full score
  if (ageHours <= profile.freshUntilHours) {
    return 1.0;
  }

  // Past fresh window: apply linear decay
  const hoursStale = ageHours - profile.freshUntilHours;
  const decayAmount = hoursStale * profile.decayRate;
  const score = Math.max(1.0 - decayAmount, profile.minScore);

  return score;
}

/**
 * Determine if data is considered stale based on age and method.
 *
 * @param ageHours - Hours since data was acquired
 * @param method - Acquisition method used
 * @returns True if data should be considered stale
 */
export function isStale(ageHours: number, method: LookupMethod): boolean {
  const score = calculateFreshnessScore(ageHours, method);
  return score <= 0.3;
}

/**
 * Get the fresh window duration for a given method.
 *
 * @param method - Acquisition method
 * @returns Hours that data is considered fresh
 */
export function getFreshWindow(method: LookupMethod): number {
  const profile = FRESHNESS_PROFILES[method] || FRESHNESS_PROFILES.unknown;
  return profile.freshUntilHours;
}
