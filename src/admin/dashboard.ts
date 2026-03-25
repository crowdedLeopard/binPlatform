/**
 * Hampshire Bin Collection Data Platform
 * Admin Dashboard Data Layer
 *
 * Aggregate queries for admin dashboard views.
 *
 * @module admin/dashboard
 */

import {
  DashboardStats,
  AdapterStatusRow,
  AcquisitionSummary,
  ConfidenceDistribution,
} from './types';

/**
 * Get dashboard summary statistics.
 *
 * Aggregates data from:
 * - councils table (total count)
 * - council_adapters table (kill switch status, health)
 * - acquisition_attempts table (today's attempts, success rate)
 * - cached results (average confidence)
 * - drift_alerts table (pending alerts)
 * - security_events table (open events)
 *
 * @returns Promise resolving to dashboard stats
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  // TODO: Wire to PostgreSQL queries
  // This is a stub implementation showing the interface

  return {
    totalCouncils: 13,
    activeAdapters: 10,
    degradedAdapters: 2,
    disabledAdapters: 1,
    totalAcquisitionsToday: 247,
    successRateToday: 94.3,
    averageConfidenceScore: 0.87,
    pendingDriftAlerts: 3,
    openSecurityEvents: 0,
    lastRefreshAt: new Date().toISOString(),
  };
}

/**
 * Get adapter status summary for all councils.
 *
 * Aggregates recent acquisition attempts, health checks, and kill switch state.
 *
 * @returns Promise resolving to adapter status rows
 */
export async function getAdapterStatusSummary(): Promise<AdapterStatusRow[]> {
  // TODO: Wire to PostgreSQL queries
  // Query:
  // SELECT
  //   c.council_id,
  //   c.council_name,
  //   ca.kill_switch_active,
  //   -- derive status from health check + kill switch
  //   -- success rate from acquisition_attempts last 7d
  //   -- confidence from cached results
  // FROM councils c
  // LEFT JOIN council_adapters ca ON c.council_id = ca.council_id
  // ORDER BY c.council_name

  return [];
}

/**
 * Get recent acquisitions across all councils.
 *
 * @param limit - Maximum number of results (default 50)
 * @returns Promise resolving to acquisition summaries
 */
export async function getRecentAcquisitions(
  limit = 50
): Promise<AcquisitionSummary[]> {
  // TODO: Wire to PostgreSQL queries
  // Query:
  // SELECT
  //   aa.attempt_id,
  //   aa.council_id,
  //   c.council_name,
  //   aa.started_at,
  //   aa.duration_ms,
  //   aa.success,
  //   aa.confidence,
  //   aa.failure_category
  // FROM acquisition_attempts aa
  // JOIN councils c ON aa.council_id = c.council_id
  // ORDER BY aa.started_at DESC
  // LIMIT $1

  return [];
}

/**
 * Get confidence score distribution across cached results.
 *
 * @returns Promise resolving to confidence distribution histogram
 */
export async function getConfidenceDistribution(): Promise<ConfidenceDistribution> {
  // TODO: Wire to PostgreSQL queries
  // Query:
  // SELECT
  //   COUNT(CASE WHEN confidence >= 0.8 THEN 1 END) as confirmed,
  //   COUNT(CASE WHEN confidence >= 0.6 AND confidence < 0.8 THEN 1 END) as likely,
  //   COUNT(CASE WHEN confidence >= 0.4 AND confidence < 0.6 THEN 1 END) as unverified,
  //   COUNT(CASE WHEN confidence < 0.4 THEN 1 END) as stale
  // FROM cached_results

  return {
    confirmed: 0,
    likely: 0,
    unverified: 0,
    stale: 0,
  };
}
