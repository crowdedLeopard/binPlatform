/**
 * Hampshire Bin Collection Data Platform
 * SIEM Forwarder
 *
 * Forwards critical security events to Azure Monitor Log Analytics.
 * Async, non-blocking, with batching and retry logic.
 * Never blocks the main request path.
 *
 * @module observability/siem-forwarder
 */

import crypto from 'crypto';
import { logger } from './logger.js';
import type { AuditEvent, AuditEventType } from './audit.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SiemForwarderConfig {
  /** Azure Log Analytics Workspace ID (from env: AZURE_LOG_ANALYTICS_WORKSPACE_ID) */
  azureLogAnalyticsWorkspaceId?: string;
  /** Azure Log Analytics Shared Key (from env: AZURE_LOG_ANALYTICS_KEY - secret) */
  azureLogAnalyticsSharedKey?: string;
  /** Webhook URL for immediate notifications (from env: SECURITY_WEBHOOK_URL) */
  webhookUrl?: string;
  /** Critical event types (forwarded immediately, no batching) */
  criticalEventTypes: Set<AuditEventType>;
  /** Batch window in milliseconds (default: 5000ms) */
  batchWindowMs: number;
  /** Max events per batch (default: 100) */
  maxBatchSize: number;
  /** Max retry attempts (default: 3) */
  maxRetries: number;
  /** Enable/disable SIEM forwarding (default: true) */
  enabled: boolean;
}

export interface AzureLogAnalyticsEvent {
  EventId: string;
  Timestamp: string;
  EventType: string;
  Severity: string;
  ActorType: string;
  ActorId?: string;
  SourceIp?: string;
  CouncilId?: string;
  Action: string;
  Outcome: string;
  RequestId?: string;
  Metadata?: string;
}

// =============================================================================
// CRITICAL EVENT TYPES
// =============================================================================

/** Critical event types that bypass batching and are forwarded immediately */
const CRITICAL_EVENTS = new Set<AuditEventType>([
  'abuse.enumeration_detected' as AuditEventType,
  'security.injection_attempt' as AuditEventType,
  'admin.adapter.disable' as AuditEventType,
  'retention.failure' as AuditEventType,
  'incident.created' as AuditEventType,
]);

// =============================================================================
// SIEM FORWARDER
// =============================================================================

export class SiemForwarder {
  private config: SiemForwarderConfig;
  private batchBuffer: AuditEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private forwarding = false;

  constructor(config?: Partial<SiemForwarderConfig>) {
    this.config = {
      azureLogAnalyticsWorkspaceId: process.env.AZURE_LOG_ANALYTICS_WORKSPACE_ID,
      azureLogAnalyticsSharedKey: process.env.AZURE_LOG_ANALYTICS_KEY,
      webhookUrl: process.env.SECURITY_WEBHOOK_URL,
      criticalEventTypes: CRITICAL_EVENTS,
      batchWindowMs: 5000, // 5 seconds
      maxBatchSize: 100,
      maxRetries: 3,
      enabled: process.env.SIEM_FORWARDER_ENABLED !== 'false',
      ...config,
    };

    // Warning if SIEM is not configured
    if (this.config.enabled && !this.config.azureLogAnalyticsWorkspaceId) {
      logger.warn('SIEM forwarder enabled but AZURE_LOG_ANALYTICS_WORKSPACE_ID not set');
    }

    // Start batch timer
    if (this.config.enabled) {
      this.startBatchTimer();
    }
  }

  /**
   * Forward an audit event to SIEM.
   * Critical events are forwarded immediately.
   * Standard events are batched.
   */
  async forward(event: AuditEvent): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Critical events bypass batching
    if (this.config.criticalEventTypes.has(event.eventType)) {
      await this.forwardImmediate([event]);
      
      // Also send to webhook if configured
      if (this.config.webhookUrl) {
        await this.forwardToWebhook(event);
      }
    } else {
      // Standard events are batched
      this.addToBatch(event);
    }
  }

  /**
   * Add event to batch buffer.
   */
  private addToBatch(event: AuditEvent): void {
    this.batchBuffer.push(event);

    // Flush if batch is full
    if (this.batchBuffer.length >= this.config.maxBatchSize) {
      this.flushBatch();
    }
  }

  /**
   * Start batch timer.
   */
  private startBatchTimer(): void {
    this.batchTimer = setInterval(() => {
      this.flushBatch();
    }, this.config.batchWindowMs);
  }

  /**
   * Flush batch buffer to SIEM.
   */
  private async flushBatch(): Promise<void> {
    if (this.batchBuffer.length === 0 || this.forwarding) {
      return;
    }

    const batch = [...this.batchBuffer];
    this.batchBuffer = [];

    await this.forwardImmediate(batch);
  }

  /**
   * Forward events immediately (no batching).
   */
  private async forwardImmediate(events: AuditEvent[]): Promise<void> {
    if (!this.config.azureLogAnalyticsWorkspaceId || !this.config.azureLogAnalyticsSharedKey) {
      logger.debug({ eventCount: events.length }, 'SIEM not configured, skipping forward');
      return;
    }

    this.forwarding = true;

    try {
      await this.sendToAzureLogAnalytics(events);
      logger.debug({ eventCount: events.length }, 'Forwarded events to SIEM');
    } catch (error) {
      logger.error({
        error,
        eventCount: events.length,
        eventIds: events.map(e => e.eventId),
      }, 'Failed to forward events to SIEM');

      // Retry logic
      await this.retryForward(events, 1);
    } finally {
      this.forwarding = false;
    }
  }

  /**
   * Retry forwarding with exponential backoff.
   */
  private async retryForward(events: AuditEvent[], attempt: number): Promise<void> {
    if (attempt > this.config.maxRetries) {
      logger.error({
        eventCount: events.length,
        attempts: attempt,
      }, 'SIEM forward retry exhausted');
      return;
    }

    const backoffMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    try {
      await this.sendToAzureLogAnalytics(events);
      logger.info({ attempt, eventCount: events.length }, 'SIEM forward retry succeeded');
    } catch (error) {
      logger.warn({ attempt, error }, 'SIEM forward retry failed');
      await this.retryForward(events, attempt + 1);
    }
  }

  /**
   * Send events to Azure Log Analytics using HTTP Data Collector API.
   */
  private async sendToAzureLogAnalytics(events: AuditEvent[]): Promise<void> {
    const workspaceId = this.config.azureLogAnalyticsWorkspaceId!;
    const sharedKey = this.config.azureLogAnalyticsSharedKey!;

    // Transform events to Azure Log Analytics format
    const azureEvents: AzureLogAnalyticsEvent[] = events.map(event => ({
      EventId: event.eventId,
      Timestamp: event.timestamp,
      EventType: event.eventType,
      Severity: event.severity,
      ActorType: event.actor.type,
      ActorId: event.actor.id,
      SourceIp: event.actor.ip,
      CouncilId: event.resource.councilId,
      Action: event.action,
      Outcome: event.outcome,
      RequestId: event.requestId,
      Metadata: event.metadata ? JSON.stringify(event.metadata) : undefined,
    }));

    const body = JSON.stringify(azureEvents);
    const contentLength = Buffer.byteLength(body, 'utf8');

    // Build authorization header
    const dateString = new Date().toUTCString();
    const signature = this.buildAzureLogAnalyticsSignature(
      workspaceId,
      sharedKey,
      dateString,
      contentLength,
    );

    // Send to Azure Log Analytics
    const url = `https://${workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Log-Type': 'BinPlatformSecurityEvents',
        'Authorization': signature,
        'x-ms-date': dateString,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure Log Analytics API error: ${response.status} ${errorText}`);
    }
  }

  /**
   * Build HMAC-SHA256 signature for Azure Log Analytics API.
   */
  private buildAzureLogAnalyticsSignature(
    workspaceId: string,
    sharedKey: string,
    dateString: string,
    contentLength: number,
  ): string {
    const stringToSign = [
      'POST',
      contentLength.toString(),
      'application/json',
      `x-ms-date:${dateString}`,
      '/api/logs',
    ].join('\n');

    const hmac = crypto.createHmac('sha256', Buffer.from(sharedKey, 'base64'));
    hmac.update(stringToSign, 'utf8');
    const signature = hmac.digest('base64');

    return `SharedKey ${workspaceId}:${signature}`;
  }

  /**
   * Forward critical event to webhook (Slack/Teams/PagerDuty).
   */
  private async forwardToWebhook(event: AuditEvent): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    try {
      const webhookType = process.env.SECURITY_WEBHOOK_TYPE || 'generic';
      const payload = this.buildWebhookPayload(event, webhookType);

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.status}`);
      }

      logger.debug({
        eventType: event.eventType,
        webhookType,
      }, 'Security alert sent to webhook');
    } catch (error) {
      logger.error({ error, eventId: event.eventId }, 'Failed to send webhook alert');
    }
  }

  /**
   * Build webhook payload based on type.
   */
  private buildWebhookPayload(event: AuditEvent, type: string): unknown {
    const dashboardUrl = process.env.ADMIN_DASHBOARD_URL || 'https://admin.binplatform.example.com';
    const severity = this.mapSeverity(event.severity);

    if (type === 'slack') {
      return {
        text: `🚨 Security Alert: ${event.action}`,
        attachments: [
          {
            color: severity === 'critical' ? 'danger' : 'warning',
            fields: [
              { title: 'Event Type', value: event.eventType, short: true },
              { title: 'Severity', value: event.severity.toUpperCase(), short: true },
              { title: 'Council', value: event.resource.councilId || 'N/A', short: true },
              { title: 'Source IP', value: event.actor.ip || 'N/A', short: true },
              { title: 'Action', value: event.action, short: false },
              { title: 'Outcome', value: event.outcome, short: true },
            ],
            footer: 'Hampshire Bin Platform Security',
            ts: Math.floor(new Date(event.timestamp).getTime() / 1000),
            actions: [
              {
                type: 'button',
                text: 'View Dashboard',
                url: `${dashboardUrl}/security`,
              },
            ],
          },
        ],
      };
    }

    if (type === 'teams') {
      return {
        '@type': 'MessageCard',
        '@context': 'https://schema.org/extensions',
        summary: `Security Alert: ${event.action}`,
        themeColor: severity === 'critical' ? 'FF0000' : 'FFA500',
        title: `🚨 Security Alert: ${event.action}`,
        sections: [
          {
            facts: [
              { name: 'Event Type', value: event.eventType },
              { name: 'Severity', value: event.severity.toUpperCase() },
              { name: 'Council', value: event.resource.councilId || 'N/A' },
              { name: 'Source IP', value: event.actor.ip || 'N/A' },
              { name: 'Outcome', value: event.outcome },
              { name: 'Timestamp', value: event.timestamp },
            ],
          },
        ],
        potentialAction: [
          {
            '@type': 'OpenUri',
            name: 'View Dashboard',
            targets: [{ os: 'default', uri: `${dashboardUrl}/security` }],
          },
        ],
      };
    }

    if (type === 'pagerduty') {
      return {
        routing_key: process.env.PAGERDUTY_ROUTING_KEY,
        event_action: 'trigger',
        payload: {
          summary: `Security Alert: ${event.action}`,
          severity,
          source: 'Hampshire Bin Platform',
          custom_details: {
            event_type: event.eventType,
            council_id: event.resource.councilId,
            source_ip: event.actor.ip,
            outcome: event.outcome,
            request_id: event.requestId,
          },
        },
      };
    }

    // Generic webhook payload
    return {
      alert_type: 'security_event',
      severity,
      event_type: event.eventType,
      action: event.action,
      council_id: event.resource.councilId,
      source_ip: event.actor.ip,
      outcome: event.outcome,
      timestamp: event.timestamp,
      dashboard_url: `${dashboardUrl}/security`,
    };
  }

  /**
   * Map severity to PagerDuty/webhook format.
   */
  private mapSeverity(severity: string): 'critical' | 'error' | 'warning' | 'info' {
    if (severity === 'critical') return 'critical';
    if (severity === 'warning') return 'warning';
    return 'info';
  }

  /**
   * Gracefully shutdown forwarder (flush batch).
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down SIEM forwarder');

    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }

    await this.flushBatch();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const siemForwarder = new SiemForwarder();

/**
 * Hook into audit logger to forward events to SIEM.
 * Call this during application startup.
 */
export function initializeSiemForwarding(): void {
  logger.info({
    enabled: siemForwarder['config'].enabled,
    hasWorkspaceId: !!siemForwarder['config'].azureLogAnalyticsWorkspaceId,
    hasWebhook: !!siemForwarder['config'].webhookUrl,
  }, 'SIEM forwarder initialized');
}
