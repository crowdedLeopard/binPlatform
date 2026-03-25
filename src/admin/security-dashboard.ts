/**
 * Hampshire Bin Collection Data Platform
 * Security Event Admin Dashboard
 *
 * Comprehensive security admin data layer for monitoring and incident response.
 * Provides summary views, event filtering, abuse pattern detection, and anomaly tracking.
 *
 * @module admin/security-dashboard
 */

import { logger } from '../observability/logger.js';
import type { AuditSeverity, AuditEventType } from '../observability/audit.js';
import type { SecurityEvent, SecurityEventFilter } from '../storage/db/security-events.js';
import { querySecurityEvents, getCriticalEventsRecent } from '../storage/db/security-events.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SecuritySummary {
  criticalEventsLast24h: number;
  openIncidents: number;
  adaptersWithAnomalies: number;
  abuseBlocksToday: number;
  authFailuresToday: number;
  injectionAttemptsToday: number;
  enumerationBlocksToday: number;
  retentionPurgesDue: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface AbusePattern {
  pattern: string;
  description: string;
  occurrences: number;
  uniqueIps: number;
  firstSeen: Date;
  lastSeen: Date;
  severity: AuditSeverity;
  affectedCouncils: string[];
}

export interface AdapterAnomaly {
  councilId: string;
  anomalyType: string;
  description: string;
  occurrences: number;
  firstDetected: Date;
  lastDetected: Date;
  severity: AuditSeverity;
  isResolved: boolean;
}

export interface Incident {
  id: string;
  createdAt: Date;
  type: IncidentType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  councilId?: string;
  triggerEventId: string;
  status: 'open' | 'acknowledged' | 'resolved';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  notes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export type IncidentType =
  | 'adapter_blocked_repeated'
  | 'enumeration_threshold_hit'
  | 'critical_security_event'
  | 'retention_failure'
  | 'audit_hmac_failure'
  | 'upstream_anomaly'
  | 'injection_attack'
  | 'auth_breach';

export interface AdminActor {
  id: string;
  email?: string;
  name?: string;
}

// =============================================================================
// DATABASE CLIENT
// =============================================================================

interface DatabaseClient {
  query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }>;
}

let dbClient: DatabaseClient | null = null;

export function setDatabaseClient(client: DatabaseClient): void {
  dbClient = client;
}

// =============================================================================
// SECURITY DASHBOARD
// =============================================================================

export class SecurityDashboard {
  /**
   * Get summary for admin home page.
   */
  async getSummary(): Promise<SecuritySummary> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Critical events in last 24 hours
    const criticalEvents = await getCriticalEventsRecent(24);

    // Open incidents count
    const incidentsResult = await dbClient.query(
      `SELECT COUNT(*) as count FROM incidents WHERE status IN ('open', 'acknowledged')`,
      []
    );
    const openIncidents = parseInt((incidentsResult.rows[0] as { count: string }).count, 10);

    // Adapters with anomalies
    const anomaliesResult = await dbClient.query(
      `SELECT COUNT(DISTINCT council_id) as count
       FROM security_events
       WHERE event_type LIKE 'security.%'
         AND created_at >= $1
         AND severity IN ('warning', 'critical')`,
      [last24h]
    );
    const adaptersWithAnomalies = parseInt((anomaliesResult.rows[0] as { count: string }).count, 10);

    // Abuse blocks today
    const abuseResult = await dbClient.query(
      `SELECT 
         COUNT(*) FILTER (WHERE event_type LIKE 'abuse.%') as abuse_blocks,
         COUNT(*) FILTER (WHERE event_type LIKE 'auth.failure%') as auth_failures,
         COUNT(*) FILTER (WHERE event_type = 'security.injection_attempt') as injection_attempts,
         COUNT(*) FILTER (WHERE event_type = 'abuse.enumeration_detected') as enumeration_blocks
       FROM security_events
       WHERE created_at >= $1`,
      [today]
    );
    const stats = abuseResult.rows[0] as {
      abuse_blocks: string;
      auth_failures: string;
      injection_attempts: string;
      enumeration_blocks: string;
    };

    // Retention purges due (stub - would query retention system)
    const retentionPurgesDue = 0; // TODO: Integrate with retention scanner

    return {
      criticalEventsLast24h: criticalEvents.length,
      openIncidents,
      adaptersWithAnomalies,
      abuseBlocksToday: parseInt(stats.abuse_blocks, 10),
      authFailuresToday: parseInt(stats.auth_failures, 10),
      injectionAttemptsToday: parseInt(stats.injection_attempts, 10),
      enumerationBlocksToday: parseInt(stats.enumeration_blocks, 10),
      retentionPurgesDue,
    };
  }

  /**
   * Get recent events with filtering.
   */
  async getEvents(filter: SecurityEventFilter): Promise<PaginatedResult<SecurityEvent>> {
    const result = await querySecurityEvents(filter);

    const page = Math.floor((filter.offset || 0) / (filter.limit || 100)) + 1;
    const pageSize = filter.limit || 100;

    return {
      items: result.events,
      total: result.total,
      page,
      pageSize,
      hasMore: result.hasMore,
    };
  }

  /**
   * Get abuse patterns for human review.
   */
  async getAbusePatterns(hours = 24): Promise<AbusePattern[]> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const since = new Date();
    since.setHours(since.getHours() - hours);

    const sql = `
      SELECT
        event_type as pattern,
        COUNT(*) as occurrences,
        COUNT(DISTINCT actor_ip_anon) as unique_ips,
        MIN(created_at) as first_seen,
        MAX(created_at) as last_seen,
        MAX(severity) as severity,
        ARRAY_AGG(DISTINCT council_id) FILTER (WHERE council_id IS NOT NULL) as affected_councils
      FROM security_events
      WHERE event_type LIKE 'abuse.%'
        AND created_at >= $1
      GROUP BY event_type
      ORDER BY occurrences DESC
      LIMIT 20
    `;

    const result = await dbClient.query(sql, [since]);

    return result.rows.map((row: unknown) => {
      const r = row as {
        pattern: string;
        occurrences: string;
        unique_ips: string;
        first_seen: Date;
        last_seen: Date;
        severity: AuditSeverity;
        affected_councils: string[];
      };

      return {
        pattern: r.pattern,
        description: this.describeAbusePattern(r.pattern),
        occurrences: parseInt(r.occurrences, 10),
        uniqueIps: parseInt(r.unique_ips, 10),
        firstSeen: r.first_seen,
        lastSeen: r.last_seen,
        severity: r.severity,
        affectedCouncils: r.affected_councils || [],
      };
    });
  }

  /**
   * Get adapter security health and anomalies.
   */
  async getAdapterAnomalies(hours = 24): Promise<AdapterAnomaly[]> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const since = new Date();
    since.setHours(since.getHours() - hours);

    const sql = `
      SELECT
        council_id,
        event_type as anomaly_type,
        COUNT(*) as occurrences,
        MIN(created_at) as first_detected,
        MAX(created_at) as last_detected,
        MAX(severity) as severity
      FROM security_events
      WHERE event_type LIKE 'security.%'
        AND council_id IS NOT NULL
        AND created_at >= $1
      GROUP BY council_id, event_type
      ORDER BY occurrences DESC
      LIMIT 50
    `;

    const result = await dbClient.query(sql, [since]);

    return result.rows.map((row: unknown) => {
      const r = row as {
        council_id: string;
        anomaly_type: string;
        occurrences: string;
        first_detected: Date;
        last_detected: Date;
        severity: AuditSeverity;
      };

      return {
        councilId: r.council_id,
        anomalyType: r.anomaly_type,
        description: this.describeAnomaly(r.anomaly_type),
        occurrences: parseInt(r.occurrences, 10),
        firstDetected: r.first_detected,
        lastDetected: r.last_detected,
        severity: r.severity,
        isResolved: false, // TODO: Check if resolved
      };
    });
  }

  /**
   * Get open incidents.
   */
  async getOpenIncidents(): Promise<Incident[]> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const sql = `
      SELECT
        id,
        created_at,
        incident_type,
        severity,
        council_id,
        trigger_event_id,
        status,
        acknowledged_by,
        acknowledged_at,
        notes,
        resolved_at,
        resolved_by
      FROM incidents
      WHERE status IN ('open', 'acknowledged')
      ORDER BY
        CASE severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          WHEN 'low' THEN 4
        END,
        created_at DESC
      LIMIT 100
    `;

    const result = await dbClient.query(sql, []);

    return result.rows.map((row: unknown) => {
      const r = row as {
        id: string;
        created_at: Date;
        incident_type: IncidentType;
        severity: 'low' | 'medium' | 'high' | 'critical';
        council_id: string | null;
        trigger_event_id: string;
        status: 'open' | 'acknowledged' | 'resolved';
        acknowledged_by: string | null;
        acknowledged_at: Date | null;
        notes: string | null;
        resolved_at: Date | null;
        resolved_by: string | null;
      };

      return {
        id: r.id,
        createdAt: r.created_at,
        type: r.incident_type,
        severity: r.severity,
        councilId: r.council_id || undefined,
        triggerEventId: r.trigger_event_id,
        status: r.status,
        acknowledgedBy: r.acknowledged_by || undefined,
        acknowledgedAt: r.acknowledged_at || undefined,
        notes: r.notes || undefined,
        resolvedAt: r.resolved_at || undefined,
        resolvedBy: r.resolved_by || undefined,
      };
    });
  }

  /**
   * Acknowledge an incident.
   */
  async acknowledgeIncident(
    id: string,
    by: AdminActor,
    notes: string
  ): Promise<void> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const sql = `
      UPDATE incidents
      SET status = 'acknowledged',
          acknowledged_by = $1,
          acknowledged_at = NOW(),
          notes = $2
      WHERE id = $3
        AND status = 'open'
      RETURNING id
    `;

    const result = await dbClient.query(sql, [by.id, notes, id]);

    if (result.rows.length === 0) {
      throw new Error(`Incident ${id} not found or already acknowledged`);
    }

    logger.info('Incident acknowledged', {
      incidentId: id,
      acknowledgedBy: by.id,
      notes,
    });
  }

  /**
   * Describe abuse pattern in human-readable form.
   */
  private describeAbusePattern(eventType: string): string {
    const descriptions: Record<string, string> = {
      'abuse.rate_limit_exceeded': 'Rate limit exceeded (likely bot or scraper)',
      'abuse.enumeration_detected': 'Address enumeration pattern detected',
      'abuse.malformed_input': 'Malformed input submitted (possible fuzzing)',
      'abuse.suspicious_input': 'Suspicious input patterns (injection attempt)',
    };

    return descriptions[eventType] || eventType;
  }

  /**
   * Describe anomaly in human-readable form.
   */
  private describeAnomaly(eventType: string): string {
    const descriptions: Record<string, string> = {
      'security.upstream_anomaly': 'Upstream council website returned unexpected content',
      'security.schema_mismatch': 'Extracted data does not match expected schema',
      'security.injection_attempt': 'SQL/XSS injection attempt detected',
    };

    return descriptions[eventType] || eventType;
  }
}

/**
 * Singleton instance.
 */
export const securityDashboard = new SecurityDashboard();
