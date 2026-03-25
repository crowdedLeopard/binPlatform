/**
 * Hampshire Bin Collection Data Platform
 * Admin API Routes
 * 
 * Authenticated admin endpoints for adapter management and monitoring.
 * All endpoints require admin role and are internal-only (VPN/bastion access).
 * 
 * GET /v1/admin/adapters - List all adapters with sensitive details
 * POST /v1/admin/adapters/:councilId/disable - Disable adapter (kill switch)
 * POST /v1/admin/adapters/:councilId/enable - Enable adapter
 * 
 * Phase 3 endpoints:
 * GET /v1/admin/dashboard - Dashboard summary statistics
 * GET /v1/admin/adapters/health - Adapter health summary
 * GET /v1/admin/drift-alerts - Recent drift events
 * POST /v1/admin/drift-alerts/:alertId/acknowledge - Mark drift alert as reviewed
 * GET /v1/admin/retention/stats - Evidence retention statistics
 * POST /v1/admin/retention/purge-expired - Trigger evidence purge (async)
 */

import { Hono } from 'hono';
import type { CouncilAdapter } from '../../adapters/base/adapter.interface';
import { councilNotFound, internalError } from '../errors';
import { getAuthContext } from '../middleware/auth';
import {
  getDashboardStats,
  getRecentAcquisitions,
  getConfidenceDistribution,
} from '../../admin/dashboard';
import {
  getAdapterHealthSummary,
  getAdapterHealthDetail,
} from '../../admin/adapter-health';
import {
  getEvidenceRetentionStats,
  getExpiredEvidence,
  markEvidenceForDeletion,
  purgeExpiredEvidence,
} from '../../admin/retention';

export function createAdminRoutes(adapters: Map<string, CouncilAdapter>, database?: any) {
  const app = new Hono();

  /**
   * GET /v1/admin/adapters
   * List all adapters with sensitive operational details.
   */
  app.get('/adapters', async (c) => {
    const auth = getAuthContext(c);

    try {
      const adapterList = [];

      for (const [councilId, adapter] of adapters.entries()) {
        const capabilities = await adapter.discoverCapabilities();
        const health = await adapter.verifyHealth();
        const securityProfile = await adapter.securityProfile();

        // Check kill switch state
        const killSwitchActive = await getKillSwitchState(database, councilId);

        adapterList.push({
          council_id: councilId,
          name: capabilities.councilName,
          status: health.status,
          kill_switch_active: killSwitchActive,
          health: {
            last_success: health.lastSuccessAt,
            last_failure: health.lastFailureAt,
            last_failure_category: health.lastFailureCategory,
            last_failure_message: health.lastFailureMessage,
            success_rate_24h: health.successRate24h,
            avg_response_time_ms: health.avgResponseTimeMs24h,
            acquisition_count_24h: health.acquisitionCount24h,
            upstream_reachable: health.upstreamReachable,
            schema_drift_detected: health.schemaDriftDetected,
          },
          security: {
            risk_level: securityProfile.riskLevel,
            requires_browser_automation: securityProfile.requiresBrowserAutomation,
            external_domains: securityProfile.externalDomains,
            last_security_review: securityProfile.lastSecurityReview,
          },
          capabilities: {
            lookup_method: capabilities.primaryLookupMethod,
            rate_limit_rpm: capabilities.rateLimitRpm,
            is_production_ready: capabilities.isProductionReady,
            adapter_last_updated: capabilities.adapterLastUpdated,
          },
        });
      }

      return c.json({
        adapters: adapterList,
        total: adapterList.length,
        metadata: {
          request_id: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  /**
   * POST /v1/admin/adapters/:councilId/disable
   * Set kill switch to disable adapter.
   */
  app.post('/adapters/:councilId/disable', async (c) => {
    const councilId = c.req.param('councilId');
    const auth = getAuthContext(c);
    const adapter = adapters.get(councilId);

    if (!adapter) {
      throw councilNotFound(councilId, auth.requestId);
    }

    try {
      // Set kill switch in database
      await setKillSwitch(database, councilId, true, auth.apiKeyId);

      // Log to audit trail
      await logAuditEvent(database, {
        event_type: 'adapter_disabled',
        council_id: councilId,
        actor: auth.apiKeyId,
        timestamp: new Date().toISOString(),
        details: { reason: 'Manual disable via admin API' },
      });

      return c.json({
        council_id: councilId,
        kill_switch_active: true,
        disabled_at: new Date().toISOString(),
        disabled_by: auth.apiKeyId,
        metadata: {
          request_id: auth.requestId,
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  /**
   * POST /v1/admin/adapters/:councilId/enable
   * Clear kill switch to enable adapter.
   */
  app.post('/adapters/:councilId/enable', async (c) => {
    const councilId = c.req.param('councilId');
    const auth = getAuthContext(c);
    const adapter = adapters.get(councilId);

    if (!adapter) {
      throw councilNotFound(councilId, auth.requestId);
    }

    try {
      // Clear kill switch in database
      await setKillSwitch(database, councilId, false, auth.apiKeyId);

      // Log to audit trail
      await logAuditEvent(database, {
        event_type: 'adapter_enabled',
        council_id: councilId,
        actor: auth.apiKeyId,
        timestamp: new Date().toISOString(),
        details: { reason: 'Manual enable via admin API' },
      });

      return c.json({
        council_id: councilId,
        kill_switch_active: false,
        enabled_at: new Date().toISOString(),
        enabled_by: auth.apiKeyId,
        metadata: {
          request_id: auth.requestId,
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  // ========================================================================
  // PHASE 3: Dashboard & Health Endpoints
  // ========================================================================

  /**
   * GET /v1/admin/dashboard
   * Dashboard summary statistics.
   */
  app.get('/dashboard', async (c) => {
    const auth = getAuthContext(c);

    try {
      const stats = await getDashboardStats();

      return c.json({
        stats,
        metadata: {
          request_id: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  /**
   * GET /v1/admin/adapters/health
   * Adapter health summary for all councils.
   */
  app.get('/adapters/health', async (c) => {
    const auth = getAuthContext(c);

    try {
      const healthSummaries = await getAdapterHealthSummary();

      return c.json({
        adapters: healthSummaries,
        total: healthSummaries.length,
        metadata: {
          request_id: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  /**
   * GET /v1/admin/drift-alerts
   * Recent drift events across all councils.
   */
  app.get('/drift-alerts', async (c) => {
    const auth = getAuthContext(c);

    try {
      // TODO: Implement getDriftAlerts() in admin module
      const alerts = await getDriftAlerts(database);

      return c.json({
        alerts,
        total: alerts.length,
        metadata: {
          request_id: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  /**
   * POST /v1/admin/drift-alerts/:alertId/acknowledge
   * Mark drift alert as reviewed.
   */
  app.post('/drift-alerts/:alertId/acknowledge', async (c) => {
    const alertId = c.req.param('alertId');
    const auth = getAuthContext(c);

    try {
      // TODO: Implement acknowledgeDriftAlert() in admin module
      await acknowledgeDriftAlert(database, alertId, auth.apiKeyId);

      // Log to audit trail
      await logAuditEvent(database, {
        event_type: 'drift_alert_acknowledged',
        alert_id: alertId,
        actor: auth.apiKeyId,
        timestamp: new Date().toISOString(),
      });

      return c.json({
        alert_id: alertId,
        acknowledged: true,
        acknowledged_at: new Date().toISOString(),
        acknowledged_by: auth.apiKeyId,
        metadata: {
          request_id: auth.requestId,
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  // ========================================================================
  // PHASE 3: Evidence Retention Endpoints
  // ========================================================================

  /**
   * GET /v1/admin/retention/stats
   * Evidence retention statistics.
   */
  app.get('/retention/stats', async (c) => {
    const auth = getAuthContext(c);

    try {
      const stats = await getEvidenceRetentionStats();

      return c.json({
        stats,
        metadata: {
          request_id: auth.requestId,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  /**
   * POST /v1/admin/retention/purge-expired
   * Trigger purge of evidence older than retention window.
   * Returns job ID for async operation.
   */
  app.post('/retention/purge-expired', async (c) => {
    const auth = getAuthContext(c);

    try {
      // TODO: Queue async purge job via BullMQ
      const jobId = await queuePurgeJob(database, auth.apiKeyId);

      // Log to audit trail
      await logAuditEvent(database, {
        event_type: 'evidence_purge_initiated',
        job_id: jobId,
        actor: auth.apiKeyId,
        timestamp: new Date().toISOString(),
      });

      return c.json({
        job_id: jobId,
        status: 'queued',
        initiated_at: new Date().toISOString(),
        initiated_by: auth.apiKeyId,
        metadata: {
          request_id: auth.requestId,
        },
      });
    } catch (error) {
      throw internalError(auth.requestId);
    }
  });

  return app;
}

// Helper functions (TODO: implement database queries)

async function getKillSwitchState(database: any, councilId: string): Promise<boolean> {
  // TODO: Query database for kill_switch_active flag
  return false;
}

async function setKillSwitch(
  database: any,
  councilId: string,
  active: boolean,
  actor: string
): Promise<void> {
  // TODO: Update database kill_switch_active flag
}

async function logAuditEvent(database: any, event: Record<string, unknown>): Promise<void> {
  // TODO: Insert into audit_events table
  console.log('AUDIT:', event);
}

async function getDriftAlerts(database: any): Promise<any[]> {
  // TODO: Query drift_alerts table
  // SELECT * FROM drift_alerts
  // WHERE acknowledged = FALSE
  // ORDER BY detected_at DESC
  // LIMIT 50
  return [];
}

async function acknowledgeDriftAlert(
  database: any,
  alertId: string,
  actor: string
): Promise<void> {
  // TODO: Update drift_alerts table
  // UPDATE drift_alerts
  // SET acknowledged = TRUE,
  //     acknowledged_at = NOW(),
  //     acknowledged_by = $2
  // WHERE alert_id = $1
}

async function queuePurgeJob(database: any, actor: string): Promise<string> {
  // TODO: Queue BullMQ job for evidence purge
  // const job = await evidencePurgeQueue.add('purge', {
  //   initiated_by: actor,
  //   retention_days: 90,
  // });
  // return job.id;
  return 'job-' + Date.now();
}
