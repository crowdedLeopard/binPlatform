/**
 * Hampshire Bin Collection Data Platform
 * Adapter Health Aggregation
 *
 * Per-adapter health queries for admin dashboard.
 *
 * @module admin/adapter-health
 */

/**
 * Detailed adapter health summary.
 */
export interface AdapterHealthSummary {
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

  /** Average latency in ms */
  avgLatencyMs: number;

  /** Last successful acquisition timestamp */
  lastSuccessAt: string | null;

  /** Last failure timestamp */
  lastFailureAt: string | null;

  /** Last failure reason */
  lastFailureReason: string | null;

  /** Current confidence score of cached data */
  currentConfidence: number;

  /** Number of drift alerts for this adapter */
  driftAlerts: number;
}

/**
 * Detailed adapter health information.
 */
export interface AdapterHealthDetail {
  /** Summary information */
  summary: AdapterHealthSummary;

  /** Recent acquisition history (last 20) */
  recentAttempts: {
    attemptId: string;
    startedAt: string;
    durationMs: number;
    success: boolean;
    confidence: number;
    failureCategory?: string;
    errorMessage?: string;
  }[];

  /** Recent drift events (last 10) */
  recentDrift: {
    alertId: string;
    detectedAt: string;
    driftType: string;
    severity: string;
    affectedFields: string[];
    acknowledged: boolean;
  }[];

  /** Capabilities */
  capabilities: {
    lookupMethod: string;
    supportsAddressLookup: boolean;
    supportsCollectionServices: boolean;
    supportsCollectionEvents: boolean;
  };
}

/**
 * Get adapter health summary for all adapters.
 *
 * @returns Promise resolving to health summaries
 */
export async function getAdapterHealthSummary(): Promise<
  AdapterHealthSummary[]
> {
  // TODO: Wire to PostgreSQL queries
  // Query:
  // SELECT
  //   c.council_id,
  //   c.council_name,
  //   ca.kill_switch_active,
  //   -- derive health status from recent attempts
  //   -- calculate success rate from last 7d
  //   -- get last success/failure timestamps
  //   -- count drift alerts
  // FROM councils c
  // LEFT JOIN council_adapters ca ON c.council_id = ca.council_id
  // LEFT JOIN (
  //   SELECT council_id, AVG(duration_ms) as avg_latency
  //   FROM acquisition_attempts
  //   WHERE started_at > NOW() - INTERVAL '7 days'
  //   GROUP BY council_id
  // ) latency ON c.council_id = latency.council_id

  return [];
}

/**
 * Get detailed health information for a specific adapter.
 *
 * @param councilId - Council identifier
 * @returns Promise resolving to detailed health info
 */
export async function getAdapterHealthDetail(
  councilId: string
): Promise<AdapterHealthDetail> {
  // TODO: Wire to PostgreSQL queries
  // Join:
  // - council_adapters (kill switch, health)
  // - acquisition_attempts (recent history)
  // - drift_alerts (recent drift)
  // - council capabilities

  return {
    summary: {
      councilId,
      councilName: '',
      status: 'healthy',
      killSwitchActive: false,
      successRate7d: 0,
      avgLatencyMs: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureReason: null,
      currentConfidence: 0,
      driftAlerts: 0,
    },
    recentAttempts: [],
    recentDrift: [],
    capabilities: {
      lookupMethod: '',
      supportsAddressLookup: false,
      supportsCollectionServices: false,
      supportsCollectionEvents: false,
    },
  };
}
