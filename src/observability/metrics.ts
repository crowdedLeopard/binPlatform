import { Registry, Counter, Gauge, Histogram } from 'prom-client';

// Create a new registry for all metrics
export const register = new Registry();

// Add default metrics (process CPU, memory, etc.)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });

// =====================================================================
// COUNTERS - Monotonically increasing values
// =====================================================================

/**
 * Total adapter acquisition attempts
 * Labels: council_id, status (success|failure|timeout), method (api|browser|scrape)
 */
export const acquisitionTotal = new Counter({
  name: 'adapter_acquisitions_total',
  help: 'Total adapter acquisition attempts',
  labelNames: ['council_id', 'status', 'method'],
  registers: [register],
});

/**
 * Total abuse blocks by type
 * Labels: type (rate_limit|ip_ban|api_key_invalid|pattern_match)
 */
export const abuseBlocksTotal = new Counter({
  name: 'abuse_blocks_total',
  help: 'Total abuse prevention blocks',
  labelNames: ['type'],
  registers: [register],
});

/**
 * Total schema drift events detected
 * Labels: council_id, drift_type (minor|major|breaking), severity (low|medium|high|critical)
 */
export const driftEventsTotal = new Counter({
  name: 'adapter_drift_total',
  help: 'Schema drift events detected',
  labelNames: ['council_id', 'drift_type', 'severity'],
  registers: [register],
});

/**
 * Breaking schema drift events (subset of drift_total)
 * Labels: council_id, method
 */
export const driftBreakingTotal = new Counter({
  name: 'adapter_drift_breaking_total',
  help: 'Breaking schema drift events that require immediate action',
  labelNames: ['council_id', 'method'],
  registers: [register],
});

/**
 * Synthetic check results
 * Labels: council_id, postcode, result (success|failure)
 */
export const syntheticCheckTotal = new Counter({
  name: 'synthetic_check_total',
  help: 'Total synthetic monitoring checks executed',
  labelNames: ['council_id', 'postcode', 'result'],
  registers: [register],
});

// =====================================================================
// GAUGES - Values that can go up or down
// =====================================================================

/**
 * Current adapter health status
 * Values: 1 = healthy, 0.5 = degraded, 0 = unavailable
 * Labels: council_id
 */
export const adapterHealthStatus = new Gauge({
  name: 'adapter_health_status',
  help: 'Current adapter health status (1=healthy, 0.5=degraded, 0=unavailable)',
  labelNames: ['council_id'],
  registers: [register],
});

/**
 * Current adapter confidence score (0.0 to 1.0)
 * Based on data validation, completeness, and consistency
 * Labels: council_id
 */
export const adapterConfidenceScore = new Gauge({
  name: 'adapter_confidence_score',
  help: 'Current confidence score for adapter data quality (0.0 to 1.0)',
  labelNames: ['council_id'],
  registers: [register],
});

/**
 * Synthetic check success indicator
 * Values: 1 = last check succeeded, 0 = last check failed
 * Labels: council_id, postcode
 */
export const syntheticCheckSuccess = new Gauge({
  name: 'synthetic_check_success',
  help: 'Last synthetic check result (1=success, 0=failure)',
  labelNames: ['council_id', 'postcode'],
  registers: [register],
});

/**
 * Redis connection status
 * Values: 1 = connected, 0 = disconnected
 */
export const redisUp = new Gauge({
  name: 'redis_up',
  help: 'Redis connection status (1=up, 0=down)',
  registers: [register],
});

/**
 * PostgreSQL connection status
 * Values: 1 = connected, 0 = disconnected
 */
export const pgUp = new Gauge({
  name: 'pg_up',
  help: 'PostgreSQL connection status (1=up, 0=down)',
  registers: [register],
});

/**
 * Current active API requests
 */
export const activeRequests = new Gauge({
  name: 'http_requests_active',
  help: 'Number of currently active HTTP requests',
  labelNames: ['method', 'route'],
  registers: [register],
});

// =====================================================================
// HISTOGRAMS - Distribution of values (latency, duration)
// =====================================================================

/**
 * Adapter acquisition duration in seconds
 * Labels: council_id, method (api|browser|scrape)
 * Buckets optimized for typical acquisition times (0.1s to 30s)
 */
export const acquisitionDuration = new Histogram({
  name: 'adapter_acquisition_duration_seconds',
  help: 'Adapter acquisition duration in seconds',
  labelNames: ['council_id', 'method'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register],
});

/**
 * HTTP request duration in seconds
 * Labels: method (GET|POST|etc), route, status_code
 * Buckets optimized for API response times
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

/**
 * Synthetic check duration in seconds
 * Labels: council_id, postcode
 */
export const syntheticCheckDuration = new Histogram({
  name: 'synthetic_check_duration_seconds',
  help: 'Synthetic monitoring check duration in seconds',
  labelNames: ['council_id', 'postcode'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Record an adapter acquisition attempt
 */
export function recordAcquisition(
  councilId: string,
  method: 'api' | 'browser' | 'scrape',
  status: 'success' | 'failure' | 'timeout',
  durationSeconds: number
) {
  acquisitionTotal.inc({ council_id: councilId, status, method });
  acquisitionDuration.observe({ council_id: councilId, method }, durationSeconds);
}

/**
 * Record a drift detection event
 */
export function recordDrift(
  councilId: string,
  driftType: 'minor' | 'major' | 'breaking',
  severity: 'low' | 'medium' | 'high' | 'critical',
  method: string
) {
  driftEventsTotal.inc({ council_id: councilId, drift_type: driftType, severity });
  
  if (driftType === 'breaking') {
    driftBreakingTotal.inc({ council_id: councilId, method });
  }
}

/**
 * Update adapter health status
 */
export function setAdapterHealth(
  councilId: string,
  status: 'healthy' | 'degraded' | 'unavailable'
) {
  const statusValue = status === 'healthy' ? 1 : status === 'degraded' ? 0.5 : 0;
  adapterHealthStatus.set({ council_id: councilId }, statusValue);
}

/**
 * Update adapter confidence score
 */
export function setAdapterConfidence(councilId: string, score: number) {
  // Clamp score between 0 and 1
  const clampedScore = Math.max(0, Math.min(1, score));
  adapterConfidenceScore.set({ council_id: councilId }, clampedScore);
}

/**
 * Record a synthetic check result
 */
export function recordSyntheticCheck(
  councilId: string,
  postcode: string,
  success: boolean,
  durationSeconds: number
) {
  const result = success ? 'success' : 'failure';
  syntheticCheckTotal.inc({ council_id: councilId, postcode, result });
  syntheticCheckSuccess.set({ council_id: councilId, postcode }, success ? 1 : 0);
  syntheticCheckDuration.observe({ council_id: councilId, postcode }, durationSeconds);
}

/**
 * Record an abuse block
 */
export function recordAbuseBlock(
  type: 'rate_limit' | 'ip_ban' | 'api_key_invalid' | 'pattern_match'
) {
  abuseBlocksTotal.inc({ type });
}

/**
 * Update database connection status
 */
export function setDatabaseStatus(dbType: 'redis' | 'postgres', isUp: boolean) {
  if (dbType === 'redis') {
    redisUp.set(isUp ? 1 : 0);
  } else {
    pgUp.set(isUp ? 1 : 0);
  }
}

/**
 * Track HTTP request
 * Returns a function to call when the request completes
 */
export function trackHttpRequest(method: string, route: string) {
  const start = Date.now();
  activeRequests.inc({ method, route });

  return (statusCode: number) => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration
    );
    activeRequests.dec({ method, route });
  };
}

/**
 * Get metrics in Prometheus text format
 * Used for the /metrics endpoint
 */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/**
 * Get metrics as JSON (for debugging)
 */
export async function getMetricsJSON() {
  return register.getMetricsAsJSON();
}

/**
 * Reset all metrics (used in tests)
 */
export function resetMetrics() {
  register.resetMetrics();
}

// =====================================================================
// LEGACY INTERFACE (for backwards compatibility)
// =====================================================================

export interface MetricsCollector {
  recordRequest(method: string, path: string, statusCode: number, duration: number): void;
  recordAdapterExecution(councilId: string, success: boolean, duration: number): void;
  recordCacheOperation(operation: 'hit' | 'miss', key: string): void;
  recordDatabaseQuery(query: string, duration: number): void;
}

// Implementation that bridges to new metrics
export const metrics: MetricsCollector = {
  recordRequest: (method: string, path: string, statusCode: number, duration: number) => {
    httpRequestDuration.observe(
      { method, route: path, status_code: statusCode.toString() },
      duration
    );
  },
  recordAdapterExecution: (councilId: string, success: boolean, duration: number) => {
    recordAcquisition(councilId, 'api', success ? 'success' : 'failure', duration);
  },
  recordCacheOperation: () => {
    // TODO: Implement cache metrics if needed
  },
  recordDatabaseQuery: () => {
    // TODO: Implement DB query metrics if needed
  }
};
