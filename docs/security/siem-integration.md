# SIEM Integration Guide — Hampshire Bin Platform

**Version:** 1.0  
**Owner:** Security Engineering (Amos)  
**Date:** 2026-03-25  
**Classification:** Internal  

---

## Overview

The Hampshire Bin Platform forwards security events to Azure Monitor Log Analytics for centralized security monitoring and alerting. This document describes the SIEM integration architecture, setup, and operations.

---

## Architecture

```
┌─────────────────┐
│  Audit Logger   │
│ (audit.ts)      │
└────────┬────────┘
         │
         │ Audit Events
         ▼
┌─────────────────┐
│ SIEM Forwarder  │  ← Batching (5s window, max 100 events)
│ (siem-forwarder)│  ← Async (never blocks request path)
└────────┬────────┘  ← Retry logic (3 attempts, exp backoff)
         │
         ├─────────────────────────┬────────────────────┐
         │                         │                    │
         ▼                         ▼                    ▼
┌──────────────────┐    ┌────────────────┐   ┌─────────────────┐
│ Azure Monitor    │    │ Webhook        │   │ Security Event  │
│ Log Analytics    │    │ (Slack/Teams/  │   │ Database        │
│                  │    │  PagerDuty)    │   │ (PostgreSQL)    │
└────────┬─────────┘    └────────────────┘   └─────────────────┘
         │
         │ KQL Queries
         ▼
┌──────────────────┐
│ Alert Rules      │ ← 8 security alert rules
│ (siem-alerts.tf) │ ← KQL-based correlation
└────────┬─────────┘
         │
         │ Triggers
         ▼
┌──────────────────┐
│ Action Groups    │ ← Email, webhook, SMS
│                  │ ← On-call escalation
└──────────────────┘
```

**Key Design Principles:**
- **Async processing:** Never blocks request path
- **Batching:** Standard events batched (5s window), critical events forwarded immediately
- **Retry logic:** 3 attempts with exponential backoff (2s, 4s, 8s)
- **Graceful degradation:** If SIEM unavailable, logs locally and continues
- **Multi-target:** Forwards to Log Analytics + webhook (Slack/Teams) + database

---

## Setup

### 1. Azure Monitor Log Analytics Workspace

Create a Log Analytics workspace:

```bash
az monitor log-analytics workspace create \
  --resource-group rg-binplatform-prod \
  --workspace-name law-binplatform-prod \
  --location uksouth \
  --sku PerGB2018 \
  --retention-days 365
```

Get workspace ID and shared key:

```bash
# Workspace ID
az monitor log-analytics workspace show \
  --resource-group rg-binplatform-prod \
  --workspace-name law-binplatform-prod \
  --query customerId -o tsv

# Shared key (primary)
az monitor log-analytics workspace get-shared-keys \
  --resource-group rg-binplatform-prod \
  --workspace-name law-binplatform-prod \
  --query primarySharedKey -o tsv
```

### 2. Environment Variables

Set the following environment variables:

```bash
# Azure Log Analytics (REQUIRED)
export AZURE_LOG_ANALYTICS_WORKSPACE_ID="abc12345-..."
export AZURE_LOG_ANALYTICS_KEY="base64encodedkey..."

# Optional: Webhook for immediate notifications
export SECURITY_WEBHOOK_URL="https://hooks.slack.com/services/..."
export SECURITY_WEBHOOK_TYPE="slack"  # or "teams", "pagerduty", "generic"
export SECURITY_WEBHOOK_MIN_SEVERITY="high"  # or "critical", "medium", "low"

# Optional: PagerDuty integration
export PAGERDUTY_ROUTING_KEY="your-integration-key"

# Optional: Admin dashboard URL (for links in alerts)
export ADMIN_DASHBOARD_URL="https://admin.binplatform.example.com"

# Optional: Disable SIEM forwarding (testing)
export SIEM_FORWARDER_ENABLED="true"  # set to "false" to disable
```

### 3. Deploy Terraform

Deploy the SIEM alert rules:

```bash
cd infra/terraform/environments/prod
terraform apply -target=module.monitoring
```

This creates:
- 8 Azure Monitor Scheduled Query Rules
- Alert action groups (email, webhook)
- Diagnostic settings

### 4. Configure Webhook (Optional)

#### Slack

1. Create an incoming webhook: https://api.slack.com/messaging/webhooks
2. Set `SECURITY_WEBHOOK_URL` to the webhook URL
3. Set `SECURITY_WEBHOOK_TYPE=slack`

#### MS Teams

1. Add "Incoming Webhook" connector to a Teams channel
2. Set `SECURITY_WEBHOOK_URL` to the webhook URL
3. Set `SECURITY_WEBHOOK_TYPE=teams`

#### PagerDuty

1. Create a PagerDuty integration (Events API v2)
2. Set `PAGERDUTY_ROUTING_KEY` to the integration key
3. Set `SECURITY_WEBHOOK_TYPE=pagerduty`

---

## Log Schema

### BinPlatformSecurityEvents (Custom Table)

Azure Monitor custom log table created by the SIEM forwarder.

| Field | Type | Description |
|---|---|---|
| **EventId** | string | UUID for event |
| **Timestamp** | datetime | Event time (UTC, ISO 8601) |
| **EventType** | string | Audit event type (e.g., `auth.failure`) |
| **Severity** | string | `critical`, `warning`, or `info` |
| **ActorType** | string | `api_client`, `adapter`, `admin`, `system` |
| **ActorId** | string | API key ID (hashed), never raw key |
| **SourceIp** | string | Anonymised IP (last octet zeroed for IPv4) |
| **CouncilId** | string | Affected council (if applicable) |
| **Action** | string | Human-readable action description |
| **Outcome** | string | `success`, `failure`, or `blocked` |
| **RequestId** | string | Correlation ID (trace requests) |
| **Metadata** | string | JSON-encoded additional data (NO SECRETS) |

### Privacy Compliance

- **IP anonymisation:** IPv4 last octet zeroed (192.168.1.123 → 192.168.1.0)
- **No secrets:** API keys hashed, no connection strings, no full addresses
- **No PII:** Postcode only, never full address or personal data

---

## Alert Rules

### 1. Repeated Authentication Failures

**Trigger:** >10 auth failures from same IP in 5 minutes  
**Severity:** Warning  
**Action:** Email ops team

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType == "auth.failure"
| summarize FailureCount = count() by bin(TimeGenerated, 5m), SourceIp
| where FailureCount > 10
```

**Response:** Investigate IP, consider temporary IP block.

---

### 2. SQL Injection Attempts

**Trigger:** ANY injection attempt (SQL, XSS, path traversal)  
**Severity:** Error (immediate alert)  
**Action:** Email + Slack notification

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType == "security.injection_attempt"
| summarize InjectionAttempts = count() by bin(TimeGenerated, 5m), SourceIp, tostring(Metadata)
```

**Response:** Review logs, confirm injection detection accuracy, block IP if persistent.

---

### 3. Audit Tamper Detection

**Trigger:** ANY audit tampering detection (HMAC failure, sequence gap)  
**Severity:** Critical (page on-call)  
**Action:** Email + Slack + PagerDuty

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType contains "audit" and EventType contains "tamper"
| summarize TamperAttempts = count() by bin(TimeGenerated, 5m)
```

**Response:** Initiate incident response, forensic investigation, contain breach.

---

### 4. Enumeration Attack

**Trigger:** >3 enumeration hard blocks in 1 hour  
**Severity:** Error  
**Action:** Email + Slack

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType == "abuse.enumeration_detected"
| where Outcome == "blocked"
| summarize HardBlocks = count() by bin(TimeGenerated, 1h), SourceIp
| where HardBlocks > 3
```

**Response:** Review enumeration patterns, consider adding IP to permanent block list.

---

### 5. Adapter Kill Switch Activated

**Trigger:** ANY adapter disabled via kill switch  
**Severity:** Error  
**Action:** Email + Slack

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType == "admin.adapter.disable"
| where Severity == "critical"
| summarize DisableEvents = count() by bin(TimeGenerated, 5m), CouncilId, ActorId
```

**Response:** Confirm kill switch activation was intentional, investigate adapter failure.

---

### 6. Data Retention Failures

**Trigger:** ANY data retention purge failure  
**Severity:** Critical  
**Action:** Email + Slack + PagerDuty

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType == "retention.failure"
| summarize FailureCount = count() by bin(TimeGenerated, 6h)
| where FailureCount > 0
```

**Response:** Investigate retention worker, check storage quotas, manual purge if needed.

---

### 7. Security Event Spike

**Trigger:** >20 critical/warning events in 10 minutes  
**Severity:** Warning  
**Action:** Email ops team

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where Severity in ("critical", "warning")
| summarize EventCount = count() by bin(TimeGenerated, 10m)
| where EventCount > 20
```

**Response:** Review event patterns, check for coordinated attack or system anomaly.

---

### 8. Incident Auto-Creation Rate

**Trigger:** >5 incidents created in 1 hour  
**Severity:** Warning  
**Action:** Email ops team

**KQL Query:**
```kql
BinPlatformSecurityEvents
| where EventType == "incident.created"
| summarize IncidentCount = count() by bin(TimeGenerated, 1h)
| where IncidentCount > 5
```

**Response:** Review incident auto-creation logic, tune thresholds if needed.

---

## Testing

### Manual Test Alert

Trigger a test security event (requires admin API key):

```bash
curl -X POST https://api.binplatform.example.com/v1/admin/security/test-alert \
  -H "X-API-Key: hbp_live_adminkey..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "test",
    "severity": "low"
  }'
```

Expected behavior:
1. Event logged to stdout
2. Event persisted to PostgreSQL `security_events` table
3. Event forwarded to Azure Log Analytics (appears in 1-5 minutes)
4. If severity >= min threshold, webhook triggered (Slack/Teams)

### Verify Log Analytics

Query recent security events:

```kql
BinPlatformSecurityEvents
| where TimeGenerated > ago(1h)
| order by TimeGenerated desc
| take 100
```

### Verify Alerts

Check alert rule status:

```bash
az monitor scheduled-query list \
  --resource-group rg-binplatform-prod \
  --query "[].{Name:name, Enabled:enabled, Severity:severity}" \
  -o table
```

Manually trigger an alert (send 11+ auth failures):

```bash
for i in {1..12}; do
  curl -X GET https://api.binplatform.example.com/v1/health \
    -H "X-API-Key: invalid-key-$i"
  sleep 1
done
```

Expected: Email + Slack notification within 5 minutes.

---

## Querying Events in Log Analytics

### Recent Critical Events

```kql
BinPlatformSecurityEvents
| where Severity == "critical"
| where TimeGenerated > ago(24h)
| order by TimeGenerated desc
```

### Auth Failure Patterns

```kql
BinPlatformSecurityEvents
| where EventType == "auth.failure"
| summarize count() by bin(TimeGenerated, 1h), SourceIp
| render timechart
```

### Abuse Events by Council

```kql
BinPlatformSecurityEvents
| where EventType startswith "abuse."
| summarize AbuseCoun = count() by CouncilId, EventType
| order by AbuseCount desc
```

### Security Event Timeline

```kql
BinPlatformSecurityEvents
| where TimeGenerated > ago(7d)
| summarize count() by bin(TimeGenerated, 1h), Severity
| render timechart
```

### Top 10 Source IPs (Auth Failures)

```kql
BinPlatformSecurityEvents
| where EventType == "auth.failure"
| where TimeGenerated > ago(24h)
| summarize FailureCount = count() by SourceIp
| top 10 by FailureCount desc
```

---

## Performance Characteristics

### Batching Behavior

| Event Type | Batching | Max Latency | Retry |
|---|---|---|---|
| Critical events | No (immediate forward) | <1 second | Yes (3x) |
| Standard events | Yes (5s window, 100 max) | 5 seconds | Yes (3x) |

### Resource Usage

- **Memory:** ~5 MB per 10,000 events in batch buffer
- **Network:** ~1 KB per event (JSON payload)
- **CPU:** Negligible (<0.1% at 1000 events/sec)

### Azure Log Analytics Limits

- **Ingestion rate:** 500 MB/min per workspace (platform uses ~1 MB/day)
- **Retention:** 365 days (configurable, up to 730 days)
- **Query rate:** 200 requests/min (platform uses ~10/min)

---

## Troubleshooting

### Events Not Appearing in Log Analytics

1. **Check SIEM forwarder config:**
   ```bash
   # In application logs
   grep "SIEM forwarder initialized" /var/log/app.log
   ```

2. **Verify workspace ID and key:**
   ```bash
   echo $AZURE_LOG_ANALYTICS_WORKSPACE_ID
   echo $AZURE_LOG_ANALYTICS_KEY | wc -c  # Should be ~90 chars
   ```

3. **Check network connectivity:**
   ```bash
   curl -v https://${AZURE_LOG_ANALYTICS_WORKSPACE_ID}.ods.opinsights.azure.com
   ```

4. **Review application logs for SIEM errors:**
   ```bash
   grep "Failed to forward events to SIEM" /var/log/app.log
   ```

### Alerts Not Firing

1. **Verify alert rule is enabled:**
   ```bash
   az monitor scheduled-query show \
     --resource-group rg-binplatform-prod \
     --name binplatform-injection-attempts-prod \
     --query enabled
   ```

2. **Check evaluation frequency and window:**
   ```bash
   az monitor scheduled-query show \
     --resource-group rg-binplatform-prod \
     --name binplatform-injection-attempts-prod \
     --query "{Frequency:evaluationFrequency, Window:windowDuration}"
   ```

3. **Test KQL query manually in Log Analytics:**
   - Portal → Log Analytics → Logs → Paste query → Run

4. **Review action group configuration:**
   ```bash
   az monitor action-group show \
     --resource-group rg-binplatform-prod \
     --name binplatform-ops-alerts-prod
   ```

### Webhook Not Receiving Alerts

1. **Verify webhook URL is accessible:**
   ```bash
   curl -X POST $SECURITY_WEBHOOK_URL \
     -H "Content-Type: application/json" \
     -d '{"text": "Test message"}'
   ```

2. **Check webhook type matches configuration:**
   ```bash
   echo $SECURITY_WEBHOOK_TYPE  # Should be "slack", "teams", or "pagerduty"
   ```

3. **Review application logs for webhook errors:**
   ```bash
   grep "Failed to send webhook alert" /var/log/app.log
   ```

---

## Security Considerations

### Access Control

- **Log Analytics Workspace:** Limit access to security team only
- **Shared Key Rotation:** Rotate every 90 days, automate with Key Vault
- **Webhook URLs:** Treat as secrets, rotate if exposed

### Data Retention

- **Security events:** 365 days (compliance requirement)
- **Audit logs:** 730 days (2 years)
- **Archived to Azure Blob:** After 90 days (cool tier)

### Compliance

- **GDPR:** IP anonymisation, no PII in logs
- **ISO 27001:** Centralized logging, tamper evidence
- **SOC 2:** Audit trails, access control, retention

---

## Monitoring the SIEM

### Health Metrics

Track SIEM forwarder health:

```kql
BinPlatformSecurityEvents
| summarize EventCount = count() by bin(TimeGenerated, 1h)
| render timechart
```

**Expected:** Consistent event rate (10-100 events/hour in production).

**Alert if:** Event rate drops to 0 for >2 hours (SIEM forwarder failure).

### Forwarding Latency

Measure end-to-end latency:

```kql
BinPlatformSecurityEvents
| extend IngestionLatency = ingestion_time() - todatetime(Timestamp)
| summarize avg(IngestionLatency), max(IngestionLatency) by bin(TimeGenerated, 1h)
```

**Expected:** <10 seconds average latency.

**Alert if:** >60 seconds average latency (network issues).

---

## Runbook: SIEM Alert Response

### Critical Alert Received

1. **Acknowledge alert** (PagerDuty/Opsgenie/email)
2. **Review event in Log Analytics:**
   - Copy EventId from alert
   - Query: `BinPlatformSecurityEvents | where EventId == "..."`
3. **Check security dashboard:** https://admin.binplatform.example.com/security
4. **Follow incident response playbook:** `docs/runbooks/security-incident-response.md`
5. **Create incident** (if not auto-created): `POST /v1/admin/incidents`
6. **Investigate and contain** (see breach containment guide)
7. **Resolve incident** after remediation
8. **Post-mortem** within 48 hours

---

## Maintenance

### Quarterly Review

- Review alert thresholds (tune based on false positive rate)
- Update KQL queries if event schema changes
- Rotate Azure Log Analytics shared key
- Audit SIEM access logs
- Test alert escalation path (on-call rotation)

### Annual Review

- Conduct SIEM penetration test
- Review retention policies
- Update incident response playbook
- Train new team members on SIEM operations

---

## References

- Azure Monitor HTTP Data Collector API: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/data-collector-api
- Kusto Query Language (KQL): https://learn.microsoft.com/en-us/azure/data-explorer/kusto/query/
- Slack Incoming Webhooks: https://api.slack.com/messaging/webhooks
- MS Teams Incoming Webhooks: https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook
- PagerDuty Events API v2: https://developer.pagerduty.com/docs/ZG9jOjExMDI5NTgw-events-api-v2

---

**Document Maintained By:** Amos (Security Engineering)  
**Last Updated:** 2026-03-25  
**Next Review:** 2026-06-25 (Quarterly)
