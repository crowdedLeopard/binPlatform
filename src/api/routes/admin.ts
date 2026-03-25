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
 */

import { Hono } from 'hono';
import type { CouncilAdapter } from '../../adapters/base/adapter.interface';
import { councilNotFound, internalError } from '../errors';
import { getAuthContext } from '../middleware/auth';

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
