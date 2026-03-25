/**
 * Hampshire Bin Collection Data Platform
 * Security Events Storage
 *
 * Write-through store for security events that need to be queryable.
 * Events are persisted to PostgreSQL asynchronously (never block request path).
 *
 * @module storage/db/security-events
 */

import { logger } from '../../observability/logger.js';
import type { AuditEvent, AuditEventType, AuditSeverity } from '../../observability/audit.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SecurityEvent {
  id: string;
  eventType: AuditEventType;
  severity: AuditSeverity;
  councilId?: string;
  actorType: string;
  actorId?: string;
  actorIpAnon?: string;
  action: string;
  outcome: string;
  metadataJson: Record<string, unknown>;
  requestId?: string;
  createdAt: Date;
}

export interface SecurityEventFilter {
  severity?: AuditSeverity | AuditSeverity[];
  eventType?: AuditEventType | AuditEventType[];
  councilId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface SecurityEventPage {
  events: SecurityEvent[];
  total: number;
  hasMore: boolean;
}

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

// TODO: Import from central database connection pool
// For now, using stub interface
interface DatabaseClient {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

let dbClient: DatabaseClient | null = null;

export function setDatabaseClient(client: DatabaseClient): void {
  dbClient = client;
}

// =============================================================================
// PERSISTENCE
// =============================================================================

/**
 * Record a security event to the database.
 * Async write - never blocks request path.
 * Errors are logged but do not throw (best effort).
 */
export async function recordSecurityEvent(event: AuditEvent): Promise<void> {
  if (!dbClient) {
    logger.warn({
      eventId: event.eventId,
      eventType: event.eventType,
    }, 'Database client not initialized, security event not persisted');
    return;
  }
  
  try {
    const sql = `
      INSERT INTO security_events (
        id,
        event_type,
        severity,
        council_id,
        actor_type,
        actor_id,
        actor_ip_anon,
        action,
        outcome,
        metadata_json,
        request_id,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;
    
    const params = [
      event.eventId,
      event.eventType,
      event.severity,
      event.resource.councilId || null,
      event.actor.type,
      event.actor.id || null,
      event.actor.ip || null,
      event.action,
      event.outcome,
      JSON.stringify(event.metadata || {}),
      event.requestId || null,
      new Date(event.timestamp),
    ];
    
    await dbClient.query(sql, params);
    
    logger.debug({
      eventId: event.eventId,
      eventType: event.eventType,
    }, 'Security event persisted');
  } catch (error) {
    // Log error but do not throw - audit logging is best effort
    logger.error({
      error,
      eventId: event.eventId,
      eventType: event.eventType,
    }, 'Failed to persist security event');
  }
}

/**
 * Query security events with filters and pagination.
 */
export async function querySecurityEvents(
  filter: SecurityEventFilter,
): Promise<SecurityEventPage> {
  if (!dbClient) {
    throw new Error('Database client not initialized');
  }
  
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;
  
  // Build WHERE clause
  if (filter.severity) {
    if (Array.isArray(filter.severity)) {
      conditions.push(`severity = ANY($${paramIndex})`);
      params.push(filter.severity);
    } else {
      conditions.push(`severity = $${paramIndex}`);
      params.push(filter.severity);
    }
    paramIndex++;
  }
  
  if (filter.eventType) {
    if (Array.isArray(filter.eventType)) {
      conditions.push(`event_type = ANY($${paramIndex})`);
      params.push(filter.eventType);
    } else {
      conditions.push(`event_type = $${paramIndex}`);
      params.push(filter.eventType);
    }
    paramIndex++;
  }
  
  if (filter.councilId) {
    conditions.push(`council_id = $${paramIndex}`);
    params.push(filter.councilId);
    paramIndex++;
  }
  
  if (filter.from) {
    conditions.push(`created_at >= $${paramIndex}`);
    params.push(filter.from);
    paramIndex++;
  }
  
  if (filter.to) {
    conditions.push(`created_at <= $${paramIndex}`);
    params.push(filter.to);
    paramIndex++;
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Count total matching events
  const countSql = `SELECT COUNT(*) as total FROM security_events ${whereClause}`;
  const countResult = await dbClient.query(countSql, params);
  const total = parseInt((countResult.rows[0] as { total: string }).total, 10);
  
  // Fetch events with pagination
  const limit = Math.min(filter.limit || 100, 100); // Max 100
  const offset = filter.offset || 0;
  
  params.push(limit);
  const limitParam = paramIndex++;
  params.push(offset);
  const offsetParam = paramIndex;
  
  const sql = `
    SELECT
      id,
      event_type,
      severity,
      council_id,
      actor_type,
      actor_id,
      actor_ip_anon,
      action,
      outcome,
      metadata_json,
      request_id,
      created_at
    FROM security_events
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${limitParam}
    OFFSET $${offsetParam}
  `;
  
  const result = await dbClient.query(sql, params);
  
  const events: SecurityEvent[] = result.rows.map((row: unknown) => {
    const r = row as {
      id: string;
      event_type: AuditEventType;
      severity: AuditSeverity;
      council_id: string | null;
      actor_type: string;
      actor_id: string | null;
      actor_ip_anon: string | null;
      action: string;
      outcome: string;
      metadata_json: string;
      request_id: string | null;
      created_at: Date;
    };
    
    return {
      id: r.id,
      eventType: r.event_type,
      severity: r.severity,
      councilId: r.council_id || undefined,
      actorType: r.actor_type,
      actorId: r.actor_id || undefined,
      actorIpAnon: r.actor_ip_anon || undefined,
      action: r.action,
      outcome: r.outcome,
      metadataJson: typeof r.metadata_json === 'string'
        ? JSON.parse(r.metadata_json)
        : r.metadata_json,
      requestId: r.request_id || undefined,
      createdAt: r.created_at,
    };
  });
  
  return {
    events,
    total,
    hasMore: offset + events.length < total,
  };
}

/**
 * Get recent security events for a specific council.
 */
export async function getRecentEventsByCouncil(
  councilId: string,
  limit = 50,
): Promise<SecurityEvent[]> {
  const result = await querySecurityEvents({
    councilId,
    limit,
  });
  
  return result.events;
}

/**
 * Get critical security events in the last N hours.
 */
export async function getCriticalEventsRecent(hours = 24): Promise<SecurityEvent[]> {
  const from = new Date();
  from.setHours(from.getHours() - hours);
  
  const result = await querySecurityEvents({
    severity: 'critical',
    from,
    limit: 100,
  });
  
  return result.events;
}

/**
 * Get abuse events for a specific anonymised IP.
 */
export async function getAbuseEventsByIp(
  ipAnon: string,
  hours = 24,
): Promise<SecurityEvent[]> {
  if (!dbClient) {
    throw new Error('Database client not initialized');
  }
  
  const from = new Date();
  from.setHours(from.getHours() - hours);
  
  const sql = `
    SELECT
      id,
      event_type,
      severity,
      council_id,
      actor_type,
      actor_id,
      actor_ip_anon,
      action,
      outcome,
      metadata_json,
      request_id,
      created_at
    FROM security_events
    WHERE actor_ip_anon = $1
      AND created_at >= $2
      AND event_type LIKE 'abuse.%'
    ORDER BY created_at DESC
    LIMIT 100
  `;
  
  const result = await dbClient.query(sql, [ipAnon, from]);
  
  return result.rows.map((row: unknown) => {
    const r = row as {
      id: string;
      event_type: AuditEventType;
      severity: AuditSeverity;
      council_id: string | null;
      actor_type: string;
      actor_id: string | null;
      actor_ip_anon: string | null;
      action: string;
      outcome: string;
      metadata_json: string;
      request_id: string | null;
      created_at: Date;
    };
    
    return {
      id: r.id,
      eventType: r.event_type,
      severity: r.severity,
      councilId: r.council_id || undefined,
      actorType: r.actor_type,
      actorId: r.actor_id || undefined,
      actorIpAnon: r.actor_ip_anon || undefined,
      action: r.action,
      outcome: r.outcome,
      metadataJson: typeof r.metadata_json === 'string'
        ? JSON.parse(r.metadata_json)
        : r.metadata_json,
      requestId: r.request_id || undefined,
      createdAt: r.created_at,
    };
  });
}
