/**
 * Hampshire Bin Collection Data Platform
 * Incident Management
 *
 * Lightweight incident tracking tied to security events.
 * Incidents are created automatically when trigger conditions are met.
 *
 * @module admin/incidents
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../observability/logger.js';
import { auditLogger } from '../observability/audit.js';

// =============================================================================
// TYPES
// =============================================================================

export type IncidentType =
  | 'adapter_blocked_repeated'
  | 'enumeration_threshold_hit'
  | 'critical_security_event'
  | 'retention_failure'
  | 'audit_hmac_failure'
  | 'upstream_anomaly'
  | 'injection_attack'
  | 'auth_breach';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'open' | 'acknowledged' | 'resolved';

export interface Incident {
  id: string;
  createdAt: Date;
  type: IncidentType;
  severity: IncidentSeverity;
  councilId?: string;
  triggerEventId: string;
  status: IncidentStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  notes?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionNotes?: string;
}

export interface CreateIncidentInput {
  type: IncidentType;
  severity: IncidentSeverity;
  councilId?: string;
  triggerEventId: string;
  description?: string;
}

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
// INCIDENT MANAGEMENT
// =============================================================================

export class IncidentManager {
  /**
   * Create a new incident.
   * Called automatically when trigger conditions are met.
   */
  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const id = `incident-${Date.now()}-${uuidv4().substring(0, 8)}`;
    const createdAt = new Date();

    const sql = `
      INSERT INTO incidents (
        id,
        created_at,
        incident_type,
        severity,
        council_id,
        trigger_event_id,
        status,
        notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const params = [
      id,
      createdAt,
      input.type,
      input.severity,
      input.councilId || null,
      input.triggerEventId,
      'open',
      input.description || null,
    ];

    const result = await dbClient.query(sql, params);
    const row = result.rows[0] as {
      id: string;
      created_at: Date;
      incident_type: IncidentType;
      severity: IncidentSeverity;
      council_id: string | null;
      trigger_event_id: string;
      status: IncidentStatus;
      notes: string | null;
    };

    const incident: Incident = {
      id: row.id,
      createdAt: row.created_at,
      type: row.incident_type,
      severity: row.severity,
      councilId: row.council_id || undefined,
      triggerEventId: row.trigger_event_id,
      status: row.status,
      notes: row.notes || undefined,
    };

    // Audit log
    auditLogger.log({
      eventType: 'admin.adapter.enable' as any, // TODO: Add INCIDENT_CREATED event type
      severity: input.severity === 'critical' || input.severity === 'high' ? 'critical' : 'warning',
      actor: { type: 'system' },
      resource: {
        type: 'incident',
        id,
        councilId: input.councilId,
      },
      action: 'incident.created',
      outcome: 'success',
      metadata: {
        incidentType: input.type,
        severity: input.severity,
        triggerEventId: input.triggerEventId,
      },
    });

    logger.info({
      incidentId: id,
      type: input.type,
      severity: input.severity,
      councilId: input.councilId,
    }, 'Incident created');

    return incident;
  }

  /**
   * Acknowledge an incident.
   */
  async acknowledgeIncident(
    incidentId: string,
    actor: AdminActor,
    notes?: string
  ): Promise<Incident> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const sql = `
      UPDATE incidents
      SET status = 'acknowledged',
          acknowledged_by = $1,
          acknowledged_at = $2,
          notes = COALESCE($3, notes)
      WHERE id = $4
        AND status = 'open'
      RETURNING *
    `;

    const params = [
      actor.id,
      new Date(),
      notes || null,
      incidentId,
    ];

    const result = await dbClient.query(sql, params);

    if (result.rows.length === 0) {
      throw new Error(`Incident ${incidentId} not found or already acknowledged`);
    }

    const row = result.rows[0] as {
      id: string;
      created_at: Date;
      incident_type: IncidentType;
      severity: IncidentSeverity;
      council_id: string | null;
      trigger_event_id: string;
      status: IncidentStatus;
      acknowledged_by: string | null;
      acknowledged_at: Date | null;
      notes: string | null;
    };

    const incident: Incident = {
      id: row.id,
      createdAt: row.created_at,
      type: row.incident_type,
      severity: row.severity,
      councilId: row.council_id || undefined,
      triggerEventId: row.trigger_event_id,
      status: row.status,
      acknowledgedBy: row.acknowledged_by || undefined,
      acknowledgedAt: row.acknowledged_at || undefined,
      notes: row.notes || undefined,
    };

    // Audit log
    auditLogger.log({
      eventType: 'admin.adapter.enable' as any, // TODO: Add INCIDENT_ACKNOWLEDGED event type
      severity: 'info',
      actor: { type: 'admin', id: actor.id },
      resource: {
        type: 'incident',
        id: incidentId,
      },
      action: 'incident.acknowledged',
      outcome: 'success',
      metadata: {
        acknowledgedBy: actor.id,
        notes,
      },
    });

    logger.info({
      incidentId,
      acknowledgedBy: actor.id,
      notes,
    }, 'Incident acknowledged');

    return incident;
  }

  /**
   * Resolve an incident.
   */
  async resolveIncident(
    incidentId: string,
    actor: AdminActor,
    resolutionNotes: string
  ): Promise<Incident> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const sql = `
      UPDATE incidents
      SET status = 'resolved',
          resolved_by = $1,
          resolved_at = $2,
          resolution_notes = $3
      WHERE id = $4
        AND status IN ('open', 'acknowledged')
      RETURNING *
    `;

    const params = [
      actor.id,
      new Date(),
      resolutionNotes,
      incidentId,
    ];

    const result = await dbClient.query(sql, params);

    if (result.rows.length === 0) {
      throw new Error(`Incident ${incidentId} not found or already resolved`);
    }

    const row = result.rows[0] as {
      id: string;
      created_at: Date;
      incident_type: IncidentType;
      severity: IncidentSeverity;
      council_id: string | null;
      trigger_event_id: string;
      status: IncidentStatus;
      acknowledged_by: string | null;
      acknowledged_at: Date | null;
      notes: string | null;
      resolved_by: string | null;
      resolved_at: Date | null;
      resolution_notes: string | null;
    };

    const incident: Incident = {
      id: row.id,
      createdAt: row.created_at,
      type: row.incident_type,
      severity: row.severity,
      councilId: row.council_id || undefined,
      triggerEventId: row.trigger_event_id,
      status: row.status,
      acknowledgedBy: row.acknowledged_by || undefined,
      acknowledgedAt: row.acknowledged_at || undefined,
      notes: row.notes || undefined,
      resolvedBy: row.resolved_by || undefined,
      resolvedAt: row.resolved_at || undefined,
      resolutionNotes: row.resolution_notes || undefined,
    };

    // Audit log
    auditLogger.log({
      eventType: 'admin.adapter.enable' as any, // TODO: Add INCIDENT_RESOLVED event type
      severity: 'info',
      actor: { type: 'admin', id: actor.id },
      resource: {
        type: 'incident',
        id: incidentId,
      },
      action: 'incident.resolved',
      outcome: 'success',
      metadata: {
        resolvedBy: actor.id,
        resolutionNotes,
      },
    });

    logger.info({
      incidentId,
      resolvedBy: actor.id,
      resolutionNotes,
    }, 'Incident resolved');

    return incident;
  }

  /**
   * Get incident by ID.
   */
  async getIncident(incidentId: string): Promise<Incident | null> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const sql = `
      SELECT * FROM incidents WHERE id = $1
    `;

    const result = await dbClient.query(sql, [incidentId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as {
      id: string;
      created_at: Date;
      incident_type: IncidentType;
      severity: IncidentSeverity;
      council_id: string | null;
      trigger_event_id: string;
      status: IncidentStatus;
      acknowledged_by: string | null;
      acknowledged_at: Date | null;
      notes: string | null;
      resolved_by: string | null;
      resolved_at: Date | null;
      resolution_notes: string | null;
    };

    return {
      id: row.id,
      createdAt: row.created_at,
      type: row.incident_type,
      severity: row.severity,
      councilId: row.council_id || undefined,
      triggerEventId: row.trigger_event_id,
      status: row.status,
      acknowledgedBy: row.acknowledged_by || undefined,
      acknowledgedAt: row.acknowledged_at || undefined,
      notes: row.notes || undefined,
      resolvedBy: row.resolved_by || undefined,
      resolvedAt: row.resolved_at || undefined,
      resolutionNotes: row.resolution_notes || undefined,
    };
  }

  /**
   * Check if an incident should be created for an adapter being blocked.
   * Creates incident if adapter blocked 3+ times in 1 hour.
   */
  async checkAdapterBlockPattern(councilId: string, eventId: string): Promise<void> {
    if (!dbClient) {
      throw new Error('Database client not initialized');
    }

    const oneHourAgo = new Date();
    oneHourAgo.setHours(oneHourAgo.getHours() - 1);

    const sql = `
      SELECT COUNT(*) as count
      FROM security_events
      WHERE council_id = $1
        AND event_type = 'adapter.bot_blocked'
        AND created_at >= $2
    `;

    const result = await dbClient.query(sql, [councilId, oneHourAgo]);
    const blockCount = parseInt((result.rows[0] as { count: string }).count, 10);

    if (blockCount >= 3) {
      await this.createIncident({
        type: 'adapter_blocked_repeated',
        severity: 'high',
        councilId,
        triggerEventId: eventId,
        description: `Adapter blocked ${blockCount} times in last hour (possible attack)`,
      });
    }
  }
}

/**
 * Singleton instance.
 */
export const incidentManager = new IncidentManager();
