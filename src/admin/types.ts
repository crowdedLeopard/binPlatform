/**
 * Hampshire Bin Collection Data Platform
 * Admin Dashboard Types
 *
 * Type definitions for admin dashboard queries.
 *
 * @module admin
 */

/**
 * Dashboard summary statistics.
 */
export interface DashboardStats {
  /** Total number of councils */
  totalCouncils: number;

  /** Number of healthy adapters */
  activeAdapters: number;

  /** Number of degraded adapters */
  degradedAdapters: number;

  /** Number of disabled adapters (kill switch active) */
  disabledAdapters: number;

  /** Total acquisitions today */
  totalAcquisitionsToday: number;

  /** Success rate today (percentage 0-100) */
  successRateToday: number;

  /** Average confidence score across all cached results */
  averageConfidenceScore: number;

  /** Number of pending drift alerts */
  pendingDriftAlerts: number;

  /** Number of open security events */
  openSecurityEvents: number;

  /** ISO 8601 timestamp of last refresh */
  lastRefreshAt: string;
}

/**
 * Per-adapter status row for dashboard grid.
 */
export interface AdapterStatusRow {
  /** Council identifier */
  councilId: string;

  /** Council name */
  councilName: string;

  /** Health status */
  status: 'healthy' | 'degraded' | 'unavailable' | 'disabled';

  /** Kill switch active */
  killSwitchActive: boolean;

  /** Success rate over last 7 days (percentage 0-100) */
  successRate7d: number;

  /** Last successful acquisition timestamp */
  lastSuccessAt: string | null;

  /** Last failure timestamp */
  lastFailureAt: string | null;

  /** Current confidence score of cached data */
  currentConfidence: number | null;
}

/**
 * Recent acquisition summary.
 */
export interface AcquisitionSummary {
  /** Acquisition attempt ID */
  attemptId: string;

  /** Council ID */
  councilId: string;

  /** Council name */
  councilName: string;

  /** Started at timestamp */
  startedAt: string;

  /** Duration in ms */
  durationMs: number;

  /** Success flag */
  success: boolean;

  /** Confidence score */
  confidence: number;

  /** Failure category (if failed) */
  failureCategory?: string;
}

/**
 * Confidence distribution histogram.
 */
export interface ConfidenceDistribution {
  /** Confirmed (≥0.8) */
  confirmed: number;

  /** Likely (≥0.6) */
  likely: number;

  /** Unverified (≥0.4) */
  unverified: number;

  /** Stale (<0.4) */
  stale: number;
}
