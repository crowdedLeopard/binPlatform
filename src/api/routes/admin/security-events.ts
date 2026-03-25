/**
 * Hampshire Bin Collection Data Platform
 * Admin Security Events Endpoints
 *
 * Query handlers for security event retrieval.
 * To be integrated into Holden's admin routes.
 *
 * @module api/routes/admin/security-events
 */

import type { Context } from 'hono';
import {
  querySecurityEvents,
  getCriticalEventsRecent,
  getRecentEventsByCouncil,
  getAbuseEventsByIp,
  type SecurityEventFilter,
} from '../../../storage/db/security-events.js';
import { AuditEventType, type AuditSeverity, anonymiseIp } from '../../../observability/audit.js';
import { logger } from '../../../observability/logger.js';

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate and parse severity parameter.
 */
function parseSeverity(value: string | undefined): AuditSeverity | AuditSeverity[] | undefined {
  if (!value) return undefined;
  
  const severities = value.split(',').map(s => s.trim()) as AuditSeverity[];
  const valid = severities.filter(s => ['info', 'warning', 'critical'].includes(s));
  
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return valid;
}

/**
 * Validate and parse event type parameter.
 */
function parseEventType(value: string | undefined): AuditEventType | AuditEventType[] | undefined {
  if (!value) return undefined;
  
  const types = value.split(',').map(t => t.trim()) as AuditEventType[];
  const validTypes = Object.values(AuditEventType);
  const valid = types.filter(t => validTypes.includes(t));
  
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return valid;
}

/**
 * Validate and parse date parameter.
 */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return undefined;
  }
  
  return date;
}

/**
 * Validate and parse integer parameter.
 */
function parseIntParam(value: string | undefined, defaultValue: number, max: number): number {
  if (!value) return defaultValue;
  
  const parsed = Number.parseInt(value, 10);
  if (isNaN(parsed) || parsed < 0) return defaultValue;
  
  return Math.min(parsed, max);
}

// =============================================================================
// HANDLERS
// =============================================================================

/**
 * GET /v1/admin/security/events
 * 
 * Query security events with filters and pagination.
 * 
 * Query params:
 * - severity: Filter by severity (info, warning, critical) - comma-separated
 * - event_type: Filter by event type - comma-separated
 * - council_id: Filter by council ID
 * - from: Start date (ISO 8601)
 * - to: End date (ISO 8601)
 * - limit: Max results (default 50, max 100)
 * - offset: Pagination offset (default 0)
 * 
 * Auth: admin role required
 * 
 * Returns: Paginated list of SecurityEvent
 */
export async function getSecurityEvents(c: Context): Promise<Response> {
  try {
    // Parse query parameters
    const severity = parseSeverity(c.req.query('severity'));
    const eventType = parseEventType(c.req.query('event_type'));
    const councilId = c.req.query('council_id');
    const from = parseDate(c.req.query('from'));
    const to = parseDate(c.req.query('to'));
    const limit = parseIntParam(c.req.query('limit'), 50, 100);
    const offset = parseIntParam(c.req.query('offset'), 0, 10000);
    
    // Build filter
    const filter: SecurityEventFilter = {
      severity,
      eventType,
      councilId,
      from,
      to,
      limit,
      offset,
    };
    
    // Query events
    const result = await querySecurityEvents(filter);
    
    logger.info({
      filter,
      resultCount: result.events.length,
      total: result.total,
    }, 'Security events queried');
    
    return c.json({
      success: true,
      events: result.events,
      pagination: {
        total: result.total,
        limit,
        offset,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to query security events');
    
    return c.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve security events',
      },
      500,
    );
  }
}

/**
 * GET /v1/admin/security/events/critical
 * 
 * Get critical security events in the last N hours.
 * 
 * Query params:
 * - hours: Lookback period in hours (default 24, max 168)
 * 
 * Auth: admin role required
 */
export async function getCriticalEvents(c: Context): Promise<Response> {
  try {
    const hours = parseIntParam(c.req.query('hours'), 24, 168);
    
    const events = await getCriticalEventsRecent(hours);
    
    logger.info({
      hours,
      eventCount: events.length,
    }, 'Critical events retrieved');
    
    return c.json({
      success: true,
      events,
      lookbackHours: hours,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve critical events');
    
    return c.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve critical events',
      },
      500,
    );
  }
}

/**
 * GET /v1/admin/security/events/council/:councilId
 * 
 * Get recent security events for a specific council.
 * 
 * Path params:
 * - councilId: Council identifier
 * 
 * Query params:
 * - limit: Max results (default 50, max 100)
 * 
 * Auth: admin role required
 */
export async function getCouncilEvents(c: Context): Promise<Response> {
  try {
    const councilId = c.req.param('councilId');
    if (!councilId) {
      return c.json(
        {
          error: 'INVALID_INPUT',
          message: 'Council ID is required',
        },
        400,
      );
    }
    
    const limit = parseIntParam(c.req.query('limit'), 50, 100);
    
    const events = await getRecentEventsByCouncil(councilId, limit);
    
    logger.info({
      councilId,
      eventCount: events.length,
    }, 'Council events retrieved');
    
    return c.json({
      success: true,
      councilId,
      events,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve council events');
    
    return c.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve council events',
      },
      500,
    );
  }
}

/**
 * GET /v1/admin/security/events/ip/:ip
 * 
 * Get abuse events for a specific IP address.
 * IP will be anonymised before lookup.
 * 
 * Path params:
 * - ip: IP address (will be anonymised)
 * 
 * Query params:
 * - hours: Lookback period in hours (default 24, max 168)
 * 
 * Auth: admin role required
 */
export async function getIpAbuseEvents(c: Context): Promise<Response> {
  try {
    const ip = c.req.param('ip');
    if (!ip) {
      return c.json(
        {
          error: 'INVALID_INPUT',
          message: 'IP address is required',
        },
        400,
      );
    }
    
    // Anonymise IP for lookup
    const ipAnon = anonymiseIp(ip);
    
    const hours = parseIntParam(c.req.query('hours'), 24, 168);
    
    const events = await getAbuseEventsByIp(ipAnon, hours);
    
    logger.info({
      ipAnon, // Never log raw IP
      eventCount: events.length,
      hours,
    }, 'IP abuse events retrieved');
    
    return c.json({
      success: true,
      ipAnonymised: ipAnon,
      events,
      lookbackHours: hours,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve IP abuse events');
    
    return c.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve IP abuse events',
      },
      500,
    );
  }
}

/**
 * GET /v1/admin/security/stats
 * 
 * Get aggregated security statistics.
 * 
 * Query params:
 * - hours: Lookback period in hours (default 24, max 168)
 * 
 * Auth: admin role required
 */
export async function getSecurityStats(c: Context): Promise<Response> {
  try {
    const hours = parseIntParam(c.req.query('hours'), 24, 168);
    
    const from = new Date();
    from.setHours(from.getHours() - hours);
    
    // Get events by severity
    const [critical, warning, info] = await Promise.all([
      querySecurityEvents({ severity: 'critical', from, limit: 1000 }),
      querySecurityEvents({ severity: 'warning', from, limit: 1000 }),
      querySecurityEvents({ severity: 'info', from, limit: 1000 }),
    ]);
    
    // Get abuse events
    const abuseFilter: SecurityEventFilter = {
      from,
      limit: 1000,
    };
    const allEvents = await querySecurityEvents(abuseFilter);
    const abuseEvents = allEvents.events.filter(e =>
      e.eventType.startsWith('abuse.'),
    );
    
    logger.info({
      hours,
      criticalCount: critical.total,
      warningCount: warning.total,
      infoCount: info.total,
      abuseCount: abuseEvents.length,
    }, 'Security stats retrieved');
    
    return c.json({
      success: true,
      lookbackHours: hours,
      stats: {
        total: critical.total + warning.total + info.total,
        bySeverity: {
          critical: critical.total,
          warning: warning.total,
          info: info.total,
        },
        abuse: {
          total: abuseEvents.length,
          rateLimitExceeded: abuseEvents.filter(e => e.eventType === AuditEventType.RATE_LIMIT_EXCEEDED).length,
          enumerationDetected: abuseEvents.filter(e => e.eventType === AuditEventType.ENUMERATION_DETECTED).length,
          malformedInput: abuseEvents.filter(e => e.eventType === AuditEventType.MALFORMED_INPUT).length,
          suspiciousInput: abuseEvents.filter(e => e.eventType === AuditEventType.SUSPICIOUS_INPUT).length,
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to retrieve security stats');
    
    return c.json(
      {
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve security stats',
      },
      500,
    );
  }
}

// =============================================================================
// ROUTE REGISTRATION
// =============================================================================

/**
 * Register security event routes.
 * To be called by Holden when setting up admin routes.
 * 
 * Example usage in admin routes:
 * ```typescript
 * import { registerSecurityEventRoutes } from './admin/security-events';
 * 
 * const adminApp = new Hono();
 * adminApp.use('*', requireAdminAuth); // Auth middleware
 * registerSecurityEventRoutes(adminApp);
 * ```
 */
export function registerSecurityEventRoutes(app: any): void {
  // Main query endpoint
  app.get('/v1/admin/security/events', getSecurityEvents);
  
  // Critical events
  app.get('/v1/admin/security/events/critical', getCriticalEvents);
  
  // Council-specific events
  app.get('/v1/admin/security/events/council/:councilId', getCouncilEvents);
  
  // IP-specific abuse events
  app.get('/v1/admin/security/events/ip/:ip', getIpAbuseEvents);
  
  // Aggregated stats
  app.get('/v1/admin/security/stats', getSecurityStats);
}
