/**
 * Hampshire Bin Collection Data Platform
 * Security Webhook Forwarder
 *
 * Simple webhook forwarder for real-time security alerts.
 * Supports Slack, MS Teams, and PagerDuty.
 * Only forwards CRITICAL events (no noise).
 *
 * @module observability/security-webhook
 */

import { logger } from './logger.js';

// =============================================================================
// TYPES
// =============================================================================

export type WebhookType = 'slack' | 'teams' | 'pagerduty' | 'generic';
export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SecurityAlert {
  severity: AlertSeverity;
  eventType: string;
  summary: string;
  councilId?: string;
  sourceIp?: string;
  timestamp: string;
  dashboardUrl: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookConfig {
  webhookUrl?: string;
  webhookType: WebhookType;
  minSeverity: AlertSeverity;
  enabled: boolean;
}

// =============================================================================
// SEVERITY ORDERING
// =============================================================================

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function shouldForwardBySeverity(severity: AlertSeverity, minSeverity: AlertSeverity): boolean {
  return SEVERITY_ORDER[severity] >= SEVERITY_ORDER[minSeverity];
}

// =============================================================================
// WEBHOOK FORWARDER
// =============================================================================

export class SecurityWebhookForwarder {
  private config: WebhookConfig;

  constructor(config?: Partial<WebhookConfig>) {
    this.config = {
      webhookUrl: process.env.SECURITY_WEBHOOK_URL,
      webhookType: (process.env.SECURITY_WEBHOOK_TYPE as WebhookType) || 'generic',
      minSeverity: (process.env.SECURITY_WEBHOOK_MIN_SEVERITY as AlertSeverity) || 'high',
      enabled: process.env.SECURITY_WEBHOOK_ENABLED !== 'false',
      ...config,
    };
  }

  /**
   * Forward security alert to webhook.
   */
  async forward(alert: SecurityAlert): Promise<void> {
    if (!this.config.enabled || !this.config.webhookUrl) {
      return;
    }

    // Check severity threshold
    if (!shouldForwardBySeverity(alert.severity, this.config.minSeverity)) {
      logger.debug('Alert below minimum severity threshold', {
        alertSeverity: alert.severity,
        minSeverity: this.config.minSeverity,
      });
      return;
    }

    try {
      const payload = this.buildPayload(alert);

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
      }

      logger.info('Security alert forwarded to webhook', {
        severity: alert.severity,
        eventType: alert.eventType,
        webhookType: this.config.webhookType,
      });
    } catch (error) {
      logger.error('Failed to forward security alert to webhook', {
        error,
        eventType: alert.eventType,
        webhookType: this.config.webhookType,
      });
    }
  }

  /**
   * Build webhook payload based on type.
   */
  private buildPayload(alert: SecurityAlert): unknown {
    switch (this.config.webhookType) {
      case 'slack':
        return this.buildSlackPayload(alert);
      case 'teams':
        return this.buildTeamsPayload(alert);
      case 'pagerduty':
        return this.buildPagerDutyPayload(alert);
      default:
        return this.buildGenericPayload(alert);
    }
  }

  /**
   * Build Slack incoming webhook payload.
   */
  private buildSlackPayload(alert: SecurityAlert): unknown {
    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    return {
      text: `${emoji} Security Alert: ${alert.summary}`,
      attachments: [
        {
          color,
          fields: [
            { title: 'Event Type', value: alert.eventType, short: true },
            { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
            { title: 'Council', value: alert.councilId || 'N/A', short: true },
            { title: 'Source IP', value: alert.sourceIp || 'N/A', short: true },
            { title: 'Summary', value: alert.summary, short: false },
          ],
          footer: 'Hampshire Bin Platform Security',
          ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
          actions: [
            {
              type: 'button',
              text: 'View Dashboard',
              url: alert.dashboardUrl,
            },
          ],
        },
      ],
    };
  }

  /**
   * Build MS Teams adaptive card payload.
   */
  private buildTeamsPayload(alert: SecurityAlert): unknown {
    const color = this.getSeverityColorHex(alert.severity);

    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: `Security Alert: ${alert.summary}`,
      themeColor: color,
      title: `🚨 Security Alert: ${alert.summary}`,
      sections: [
        {
          activityTitle: 'Hampshire Bin Platform',
          activitySubtitle: new Date(alert.timestamp).toLocaleString(),
          facts: [
            { name: 'Event Type', value: alert.eventType },
            { name: 'Severity', value: alert.severity.toUpperCase() },
            { name: 'Council', value: alert.councilId || 'N/A' },
            { name: 'Source IP', value: alert.sourceIp || 'N/A' },
          ],
        },
      ],
      potentialAction: [
        {
          '@type': 'OpenUri',
          name: 'View Security Dashboard',
          targets: [{ os: 'default', uri: alert.dashboardUrl }],
        },
      ],
    };
  }

  /**
   * Build PagerDuty Events API v2 payload.
   */
  private buildPagerDutyPayload(alert: SecurityAlert): unknown {
    const routingKey = process.env.PAGERDUTY_ROUTING_KEY;
    const pdSeverity = this.mapToPagerDutySeverity(alert.severity);

    return {
      routing_key: routingKey,
      event_action: 'trigger',
      dedup_key: alert.requestId || `security-${Date.now()}`,
      payload: {
        summary: `[${alert.severity.toUpperCase()}] ${alert.summary}`,
        severity: pdSeverity,
        source: 'Hampshire Bin Platform',
        timestamp: alert.timestamp,
        custom_details: {
          event_type: alert.eventType,
          council_id: alert.councilId,
          source_ip: alert.sourceIp,
          request_id: alert.requestId,
          metadata: alert.metadata,
        },
      },
      links: [
        {
          href: alert.dashboardUrl,
          text: 'Security Dashboard',
        },
      ],
    };
  }

  /**
   * Build generic webhook payload.
   */
  private buildGenericPayload(alert: SecurityAlert): unknown {
    return {
      alert_type: 'security',
      severity: alert.severity,
      event_type: alert.eventType,
      summary: alert.summary,
      council_id: alert.councilId,
      source_ip: alert.sourceIp,
      timestamp: alert.timestamp,
      dashboard_url: alert.dashboardUrl,
      request_id: alert.requestId,
      metadata: alert.metadata,
    };
  }

  /**
   * Get Slack attachment color by severity.
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return 'danger'; // Red
      case 'high':
        return 'warning'; // Orange
      case 'medium':
        return '#0066cc'; // Blue
      case 'low':
        return 'good'; // Green
      default:
        return '#808080'; // Gray
    }
  }

  /**
   * Get hex color by severity (for Teams).
   */
  private getSeverityColorHex(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return 'FF0000'; // Red
      case 'high':
        return 'FFA500'; // Orange
      case 'medium':
        return '0066CC'; // Blue
      case 'low':
        return '00AA00'; // Green
      default:
        return '808080'; // Gray
    }
  }

  /**
   * Get emoji by severity.
   */
  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return 'ℹ️';
      case 'low':
        return '✅';
      default:
        return '📊';
    }
  }

  /**
   * Map to PagerDuty severity.
   */
  private mapToPagerDutySeverity(severity: AlertSeverity): 'critical' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'error';
      case 'medium':
        return 'warning';
      case 'low':
        return 'info';
      default:
        return 'info';
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const securityWebhook = new SecurityWebhookForwarder();
