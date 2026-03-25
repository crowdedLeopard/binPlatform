/**
 * Hampshire Bin Collection Data Platform
 * Security Audit Logging
 *
 * Provides structured audit trail for all privileged and security-relevant actions.
 * Audit events are immutable, tamper-evident, and shipped to SIEM.
 *
 * CRITICAL: Never log secrets, raw API keys, full addresses, or connection strings.
 *
 * @module observability/audit
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

export enum AuditEventType {
  // Authentication
  AUTH_SUCCESS = 'auth.success',
  AUTH_FAILURE = 'auth.failure',
  AUTH_INVALID_KEY = 'auth.invalid_key',
  
  // Adapter operations
  ADAPTER_DISABLED = 'adapter.disabled',
  ADAPTER_ENABLED = 'adapter.enabled',
  ADAPTER_HEALTH_CHECK = 'adapter.health_check',
  ADAPTER_ACQUISITION_START = 'adapter.acquisition.start',
  ADAPTER_ACQUISITION_SUCCESS = 'adapter.acquisition.success',
  ADAPTER_ACQUISITION_FAILURE = 'adapter.acquisition.failure',
  ADAPTER_BOT_BLOCKED = 'adapter.bot_blocked',
  
  // Abuse signals
  RATE_LIMIT_EXCEEDED = 'abuse.rate_limit_exceeded',
  ENUMERATION_DETECTED = 'abuse.enumeration_detected',
  MALFORMED_INPUT = 'abuse.malformed_input',
  SUSPICIOUS_INPUT = 'abuse.suspicious_input',
  
  // Admin actions
  ADMIN_ADAPTER_DISABLE = 'admin.adapter.disable',
  ADMIN_ADAPTER_ENABLE = 'admin.adapter.enable',
  ADMIN_API_KEY_CREATE = 'admin.api_key.create',
  ADMIN_API_KEY_REVOKE = 'admin.api_key.revoke',
  
  // Security events
  SECURITY_UPSTREAM_ANOMALY = 'security.upstream_anomaly',
  SECURITY_SCHEMA_MISMATCH = 'security.schema_mismatch',
  SECURITY_INJECTION_ATTEMPT = 'security.injection_attempt',
  
  // Retention and data lifecycle (Phase 3)
  DATA_PURGE_SCAN = 'retention.purge.scan',
  DATA_PURGE_START = 'retention.purge.start',
  DATA_PURGE_COMPLETE = 'retention.purge.complete',
  EVIDENCE_DELETE = 'evidence.delete',
  RETENTION_FAILURE = 'retention.failure',
  
  // Incident management (Phase 3)
  INCIDENT_CREATED = 'incident.created',
  INCIDENT_ACKNOWLEDGED = 'incident.acknowledged',
  INCIDENT_RESOLVED = 'incident.resolved',
}

export type AuditSeverity = 'info' | 'warning' | 'critical';

export type ActorType = 'api_client' | 'adapter' | 'admin' | 'system';

export type AuditOutcome = 'success' | 'failure' | 'blocked';

export interface Actor {
  type: ActorType;
  /** API key ID (hashed), never raw key */
  id?: string;
  /** IP address anonymised (last octet zeroed for IPv4) */
  ip?: string;
}

export interface Resource {
  type: string;
  id?: string;
  councilId?: string;
}

export interface AuditEvent {
  /** UUID for event */
  eventId: string;
  /** ISO 8601 UTC timestamp */
  timestamp: string;
  /** Event type enumeration */
  eventType: AuditEventType;
  /** Severity classification */
  severity: AuditSeverity;
  /** Actor (who) */
  actor: Actor;
  /** Resource (what) */
  resource: Resource;
  /** Action description (human-readable) */
  action: string;
  /** Outcome */
  outcome: AuditOutcome;
  /** Additional metadata (NO SECRETS) */
  metadata?: Record<string, unknown>;
  /** Request correlation ID */
  requestId?: string;
  /** Sequential event number (for tamper detection) */
  sequenceNumber?: number;
  /** HMAC signature (for tamper evidence) */
  signature?: string;
}

export interface SanitisedInput {
  postcode?: string;
  councilId?: string;
  /** Never log full addresses, only hash for correlation */
  addressHash?: string;
  correlationId: string;
}

export interface AcquisitionOutcome {
  success: boolean;
  durationMs: number;
  failureCategory?: string;
  cacheHit: boolean;
}

export interface SafeDetails {
  reason?: string;
  threshold?: number;
  count?: number;
  pattern?: string;
  tier?: string;
}

export interface SafeContext {
  councilId?: string;
  adapterId?: string;
  description: string;
  upstreamStatusCode?: number;
}

// =============================================================================
// IP ANONYMISATION
// =============================================================================

/**
 * Anonymise an IP address for privacy-compliant logging.
 * IPv4: Zero last octet (192.168.1.123 → 192.168.1.0)
 * IPv6: Zero last 80 bits (2001:db8::1 → 2001:db8::)
 */
export function anonymiseIp(ip: string): string {
  // IPv4
  if (ip.includes('.') && !ip.includes(':')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
  }
  
  // IPv6
  if (ip.includes(':')) {
    // Simple approach: keep first 48 bits (3 groups), zero rest
    const parts = ip.split(':');
    if (parts.length >= 3) {
      return `${parts[0]}:${parts[1]}:${parts[2]}::`;
    }
  }
  
  // Unknown format, return as-is (should not happen)
  return ip;
}

/**
 * Hash an address for correlation without storing PII.
 * Uses HMAC with a pepper from environment.
 */
export function hashAddress(address: string): string {
  const pepper = process.env.ADDRESS_HASH_PEPPER || 'default-pepper-CHANGE-IN-PROD';
  const hmac = crypto.createHmac('sha256', pepper);
  hmac.update(address.toLowerCase().trim());
  return hmac.digest('hex').substring(0, 16);
}

/**
 * Hash an API key ID for audit logging.
 * Uses SHA-256 to prevent reverse lookup.
 */
export function hashApiKeyId(apiKeyId: string): string {
  return crypto.createHash('sha256').update(apiKeyId).digest('hex').substring(0, 16);
}

// =============================================================================
// AUDIT LOGGER
// =============================================================================

class AuditLogger {
  private sequenceNumber = 0;
  private hmacSecret: string;
  
  constructor() {
    this.hmacSecret = process.env.AUDIT_HMAC_SECRET || 'default-secret-CHANGE-IN-PROD';
    
    // Warning if using default secrets
    if (this.hmacSecret === 'default-secret-CHANGE-IN-PROD' && process.env.NODE_ENV === 'production') {
      logger.warn('AUDIT_HMAC_SECRET not set, using default (INSECURE)');
    }
  }
  
  /**
   * Sign an audit event for tamper detection.
   */
  private signEvent(event: Omit<AuditEvent, 'signature'>): string {
    const payload = JSON.stringify({
      eventId: event.eventId,
      timestamp: event.timestamp,
      eventType: event.eventType,
      sequenceNumber: event.sequenceNumber,
    });
    
    const hmac = crypto.createHmac('sha256', this.hmacSecret);
    hmac.update(payload);
    return hmac.digest('hex');
  }
  
  /**
   * Log an audit event.
   */
  log(event: Omit<AuditEvent, 'eventId' | 'timestamp' | 'sequenceNumber' | 'signature'>): void {
    const fullEvent: AuditEvent = {
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      sequenceNumber: ++this.sequenceNumber,
      ...event,
    };
    
    // Sign the event
    fullEvent.signature = this.signEvent(fullEvent);
    
    // Log to structured audit stream
    logger.info({
      audit: true,
      ...fullEvent,
    }, `AUDIT: ${event.action}`);
    
    // Ship to SIEM (async, non-blocking)
    this.shipToSiem(fullEvent).catch(err => {
      logger.debug({ error: err }, 'SIEM shipping failed');
    });
  }
  
  /**
   * Log adapter acquisition attempt.
   */
  logAdapterAcquisition(
    councilId: string,
    input: SanitisedInput,
    outcome: AcquisitionOutcome,
    actorIp?: string,
  ): void {
    this.log({
      eventType: outcome.success
        ? AuditEventType.ADAPTER_ACQUISITION_SUCCESS
        : AuditEventType.ADAPTER_ACQUISITION_FAILURE,
      severity: outcome.success ? 'info' : 'warning',
      actor: {
        type: 'adapter',
        id: councilId,
        ip: actorIp ? anonymiseIp(actorIp) : undefined,
      },
      resource: {
        type: 'adapter',
        councilId,
      },
      action: `adapter.acquisition.${outcome.success ? 'success' : 'failure'}`,
      outcome: outcome.success ? 'success' : 'failure',
      metadata: {
        durationMs: outcome.durationMs,
        failureCategory: outcome.failureCategory,
        cacheHit: outcome.cacheHit,
        postcode: input.postcode,
        addressHash: input.addressHash,
        correlationId: input.correlationId,
      },
      requestId: input.correlationId,
    });
  }
  
  /**
   * Log admin action.
   */
  logAdminAction(
    action: string,
    actor: Actor,
    target: Resource,
    outcome: AuditOutcome = 'success',
    metadata?: Record<string, unknown>,
  ): void {
    // Determine event type
    let eventType: AuditEventType;
    if (action.includes('disable')) {
      eventType = AuditEventType.ADMIN_ADAPTER_DISABLE;
    } else if (action.includes('enable')) {
      eventType = AuditEventType.ADMIN_ADAPTER_ENABLE;
    } else if (action.includes('create') && target.type === 'api_key') {
      eventType = AuditEventType.ADMIN_API_KEY_CREATE;
    } else if (action.includes('revoke') && target.type === 'api_key') {
      eventType = AuditEventType.ADMIN_API_KEY_REVOKE;
    } else {
      eventType = AuditEventType.ADMIN_ADAPTER_ENABLE; // fallback
    }
    
    this.log({
      eventType,
      severity: 'warning', // All admin actions are at least warning
      actor: {
        ...actor,
        ip: actor.ip ? anonymiseIp(actor.ip) : undefined,
      },
      resource: target,
      action,
      outcome,
      metadata,
    });
  }
  
  /**
   * Log abuse detection.
   */
  logAbuse(
    type: 'rate_limit' | 'enumeration' | 'malformed' | 'suspicious',
    actor: Actor,
    details: SafeDetails,
  ): void {
    const eventTypeMap = {
      rate_limit: AuditEventType.RATE_LIMIT_EXCEEDED,
      enumeration: AuditEventType.ENUMERATION_DETECTED,
      malformed: AuditEventType.MALFORMED_INPUT,
      suspicious: AuditEventType.SUSPICIOUS_INPUT,
    };
    
    this.log({
      eventType: eventTypeMap[type],
      severity: type === 'enumeration' ? 'critical' : 'warning',
      actor: {
        ...actor,
        ip: actor.ip ? anonymiseIp(actor.ip) : undefined,
      },
      resource: {
        type: 'abuse_detection',
      },
      action: `abuse.${type}`,
      outcome: 'blocked',
      metadata: details as Record<string, unknown>,
    });
  }
  
  /**
   * Log security event.
   */
  logSecurityEvent(
    type: 'upstream_anomaly' | 'schema_mismatch' | 'injection_attempt',
    severity: AuditSeverity,
    context: SafeContext,
  ): void {
    const eventTypeMap = {
      upstream_anomaly: AuditEventType.SECURITY_UPSTREAM_ANOMALY,
      schema_mismatch: AuditEventType.SECURITY_SCHEMA_MISMATCH,
      injection_attempt: AuditEventType.SECURITY_INJECTION_ATTEMPT,
    };
    
    this.log({
      eventType: eventTypeMap[type],
      severity,
      actor: {
        type: 'system',
      },
      resource: {
        type: 'security',
        councilId: context.councilId,
        id: context.adapterId,
      },
      action: `security.${type}`,
      outcome: severity === 'critical' ? 'blocked' : 'failure',
      metadata: {
        description: context.description,
        upstreamStatusCode: context.upstreamStatusCode,
      },
    });
  }
  
  /**
   * Log authentication event.
   */
  logAuth(
    success: boolean,
    apiKeyIdHash: string,
    ip: string,
    reason?: string,
  ): void {
    this.log({
      eventType: success ? AuditEventType.AUTH_SUCCESS : AuditEventType.AUTH_FAILURE,
      severity: success ? 'info' : 'warning',
      actor: {
        type: 'api_client',
        id: apiKeyIdHash,
        ip: anonymiseIp(ip),
      },
      resource: {
        type: 'api_key',
        id: apiKeyIdHash,
      },
      action: `auth.${success ? 'success' : 'failure'}`,
      outcome: success ? 'success' : 'failure',
      metadata: reason ? { reason } : undefined,
    });
  }
  
  /**
   * Log adapter health check.
   */
  logHealthCheck(
    councilId: string,
    healthy: boolean,
    details?: Record<string, unknown>,
  ): void {
    this.log({
      eventType: AuditEventType.ADAPTER_HEALTH_CHECK,
      severity: 'info',
      actor: {
        type: 'system',
      },
      resource: {
        type: 'adapter',
        councilId,
      },
      action: 'adapter.health_check',
      outcome: healthy ? 'success' : 'failure',
      metadata: details,
    });
  }
  
  /**
   * Log adapter kill switch activation.
   */
  logAdapterKillSwitch(
    councilId: string,
    enabled: boolean,
    actorId: string,
    reason: string,
  ): void {
    this.log({
      eventType: enabled ? AuditEventType.ADAPTER_DISABLED : AuditEventType.ADAPTER_ENABLED,
      severity: enabled ? 'critical' : 'warning',
      actor: {
        type: 'admin',
        id: actorId,
      },
      resource: {
        type: 'adapter',
        councilId,
      },
      action: enabled ? 'adapter.disabled' : 'adapter.enabled',
      outcome: 'success',
      metadata: {
        reason,
      },
    });
  }
  
  /**
   * Ship audit event to SIEM.
   * Async, non-blocking transport to Azure Monitor Log Analytics.
   */
  private async shipToSiem(event: AuditEvent): Promise<void> {
    // Dynamic import to avoid circular dependencies
    // SIEM forwarder is initialized separately during app startup
    try {
      const { siemForwarder } = await import('./siem-forwarder.js');
      await siemForwarder.forward(event);
    } catch (error) {
      // Log error but never throw - audit logging is best effort
      logger.debug({ error }, 'SIEM forwarding not available or failed');
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const auditLogger = new AuditLogger();
