/**
 * Hampshire Bin Collection Data Platform
 * Council Registry API Routes
 * 
 * GET /v1/councils - List all Hampshire councils
 * GET /v1/councils/:councilId - Get council details
 * GET /v1/councils/:councilId/health - Get council adapter health
 */

import { Hono } from 'hono';
import type { CouncilAdapter } from '../../adapters/base/adapter.interface';
import { councilNotFound, adapterUnavailable, internalError } from '../errors';
import { getAuthContext } from '../middleware/auth';

const COUNCIL_LIST_CACHE_TTL = 300; // 5 minutes
const HEALTH_CHECK_CACHE_TTL = 30; // 30 seconds

export function createCouncilRoutes(adapters: Map<string, CouncilAdapter>) {
  const app = new Hono();

  /**
   * GET /v1/councils
   * List all Hampshire councils with status.
   */
  app.get('/', async (c) => {
    try {
      const councils = [];

      for (const [councilId, adapter] of adapters.entries()) {
        const capabilities = await adapter.discoverCapabilities();
        const health = await adapter.verifyHealth();
        
        councils.push({
          id: councilId,
          name: capabilities.councilName,
          status: health.status,
          lookup_method: capabilities.primaryLookupMethod,
          last_health_check: health.checkedAt,
          is_production_ready: capabilities.isProductionReady,
        });
      }

      return c.json({
        councils,
        total: councils.length,
      });
    } catch (error) {
      const auth = getAuthContext(c);
      throw internalError(auth.requestId);
    }
  });

  /**
   * GET /v1/councils/:councilId
   * Get detailed information about a specific council.
   */
  app.get('/:councilId', async (c) => {
    const councilId = c.req.param('councilId');
    const adapter = adapters.get(councilId);

    if (!adapter) {
      const auth = getAuthContext(c);
      throw councilNotFound(councilId, auth.requestId);
    }

    try {
      const capabilities = await adapter.discoverCapabilities();
      const health = await adapter.verifyHealth();
      const securityProfile = await adapter.securityProfile();

      // Public response (admin-only fields stripped)
      return c.json({
        id: councilId,
        name: capabilities.councilName,
        website: capabilities.councilWebsite,
        status: health.status,
        capabilities: {
          supports_address_lookup: capabilities.supportsAddressLookup,
          supports_collection_services: capabilities.supportsCollectionServices,
          supports_collection_events: capabilities.supportsCollectionEvents,
          provides_uprn: capabilities.providesUprn,
          max_event_range_days: capabilities.maxEventRangeDays,
          supported_service_types: capabilities.supportedServiceTypes,
        },
        lookup_method: capabilities.primaryLookupMethod,
        limitations: capabilities.limitations,
        is_production_ready: capabilities.isProductionReady,
        last_updated: capabilities.adapterLastUpdated,
        health: {
          status: health.status,
          last_success: health.lastSuccessAt,
          success_rate_24h: health.successRate24h,
          avg_response_time_ms: health.avgResponseTimeMs24h,
        },
      });
    } catch (error) {
      const auth = getAuthContext(c);
      throw adapterUnavailable(councilId, auth.requestId);
    }
  });

  /**
   * GET /v1/councils/:councilId/health
   * Get health status of council adapter.
   */
  app.get('/:councilId/health', async (c) => {
    const councilId = c.req.param('councilId');
    const adapter = adapters.get(councilId);

    if (!adapter) {
      const auth = getAuthContext(c);
      throw councilNotFound(councilId, auth.requestId);
    }

    try {
      const health = await adapter.verifyHealth();

      // Public health response - no internal error details
      return c.json({
        council_id: councilId,
        status: health.status,
        latency_ms: health.avgResponseTimeMs24h,
        last_checked: health.checkedAt,
        upstream_reachable: health.upstreamReachable,
        success_rate_24h: health.successRate24h,
        ...(health.status !== 'healthy' && {
          degradation_reason: 'Council service experiencing issues',
        }),
      });
    } catch (error) {
      const auth = getAuthContext(c);
      throw adapterUnavailable(councilId, auth.requestId);
    }
  });

  return app;
}
