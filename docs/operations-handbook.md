# Operations Handbook

## Overview

This handbook provides day-to-day operational procedures for the Hampshire Bin Platform production environment.

**Audience:** DevOps engineers, on-call support, site reliability engineers

**Related documentation:**
- [Disaster Recovery Runbook](runbooks/disaster-recovery.md)
- [Backup & Restore Runbook](runbooks/backup-restore.md)
- [Drift Response Runbook](runbooks/drift-response.md)
- [Synthetic Monitoring Guide](runbooks/synthetic-monitoring.md)

---

## Daily checks

**Duration:** 10 minutes  
**Responsible:** On-call engineer  
**Schedule:** Every morning before 10:00 UTC

### 1. Review adapter health dashboard

```bash
# Open Grafana dashboard
open https://grafana.binplatform.example.com/d/adapter-health

# Check for any red indicators:
# - Adapter health status (all should be "healthy")
# - Confidence scores (all should be >0.8)
# - Breaking drift counter (should be 0)
```

**Action if issues found:**
- Red health status → Check adapter logs, follow [Drift Response Runbook](runbooks/drift-response.md)
- Low confidence (<0.8) → Review recent adapter executions, check for council website changes
- Breaking drift (>0) → IMMEDIATE: Enable kill switch, page engineering team

---

### 2. Check security event count

```bash
# Query Application Insights for security events
az monitor app-insights query \
  --app app-insights-binday-production \
  --analytics-query "
    traces
    | where timestamp > ago(24h)
    | where severityLevel >= 3
    | where customDimensions.event_type in ('auth_failure', 'rate_limit_exceeded', 'enumeration_detected')
    | summarize count() by event_type
  " \
  --output table
```

**Expected:** Near zero (< 5 per day)

**Action if elevated (>50 per day):**
- Review source IPs (potential abuse)
- Check rate limiting configuration
- Review API key usage (compromised keys)
- Consider temporary IP blocking

---

### 3. Verify synthetic checks all green

```bash
# Query Prometheus for failed synthetic checks
curl -s http://prometheus.binplatform.example.com/api/v1/query \
  --data-urlencode 'query=synthetic_check_success{council_id!=""} == 0' \
  | jq -r '.data.result[] | "\(.metric.council_id): FAILED"'
```

**Expected:** No output (all checks passing)

**Action if failures:**
- 1 council failing → Check adapter logs, may be council website issue
- Multiple councils failing → Check API health, potential platform issue
- All councils failing → Check synthetic monitor worker status

---

### 4. Check confidence scores haven't degraded

```bash
# Query Prometheus for low confidence scores
curl -s http://prometheus.binplatform.example.com/api/v1/query \
  --data-urlencode 'query=adapter_confidence_score < 0.8' \
  | jq -r '.data.result[] | "\(.metric.council_id): \(.value[1])"'
```

**Expected:** No output (all scores ≥0.8)

**Action if degraded:**
- Confidence 0.5-0.79 → Review adapter, may need selector updates
- Confidence <0.5 → Enable kill switch, investigate immediately

---

## Weekly checks

**Duration:** 30 minutes  
**Responsible:** DevOps team rotation  
**Schedule:** Every Monday morning

### 1. Review drift alerts

```bash
# Check Alertmanager for drift alerts in past 7 days
curl -s http://alertmanager.binplatform.example.com/api/v2/alerts \
  | jq -r '.[] | select(.labels.alertname | contains("Drift")) | "\(.labels.council_id): \(.labels.alertname) - \(.annotations.summary)"'
```

**Action items:**
- Document each drift event in `docs/drift-log.md`
- Review adapter code for brittle selectors
- Communicate with council if website changes frequent

---

### 2. Check evidence retention stats

```bash
# Query evidence blob storage
az storage blob list \
  --account-name stbindayproduction \
  --container-name evidence \
  --query "length([?properties.creationTime < '$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)'])" \
  --output tsv
```

**Expected:** 0 (all blobs <7 days old, auto-purged)

**Action if stale blobs exist:**
- Check lifecycle policy is applied
- Manually purge old evidence: `npm run admin:purge-evidence`

---

### 3. Review failed acquisition rate per adapter

```bash
# Query Application Insights for acquisition failures
az monitor app-insights query \
  --app app-insights-binday-production \
  --analytics-query "
    customEvents
    | where timestamp > ago(7d)
    | where name == 'acquisition_attempt'
    | extend council_id = tostring(customDimensions.council_id)
    | extend success = tobool(customDimensions.success)
    | summarize 
        total = count(),
        failures = countif(success == false),
        failure_rate = round(100.0 * countif(success == false) / count(), 2)
      by council_id
    | where failure_rate > 5.0
    | order by failure_rate desc
  " \
  --output table
```

**Expected:** All failure rates <5%

**Action if elevated (>5%):**
- Failure rate 5-10% → Monitor for trend, may be transient
- Failure rate >10% → Investigate adapter, check council website availability
- Failure rate >50% → Enable kill switch, urgent investigation required

---

### 4. Check dependency scan results

```bash
# Review GitHub Security alerts
gh api /repos/crowdedLeopard/binPlatform/dependabot/alerts \
  --jq '.[] | select(.state == "open") | "\(.security_advisory.severity): \(.security_advisory.summary)"'
```

**Action items:**
- Critical severity → Patch within 24 hours
- High severity → Patch within 7 days
- Medium/low severity → Add to backlog

---

## Monthly checks

**Duration:** 2 hours  
**Responsible:** DevOps lead  
**Schedule:** First Monday of the month

### 1. Rotate API keys for all clients

```bash
# Generate rotation report
npm run admin:api-key-report

# For each client:
curl -X POST https://api.binplatform.example.com/v1/admin/keys/{key_id}/rotate \
  -H "X-API-Key: hbp_live_admin..." \
  | jq -r '.new_key'

# Email new key to client
# Subject: "[Action Required] API Key Rotation - Hampshire Bin Platform"
# Body template: docs/templates/api-key-rotation-email.md
```

**Checklist:**
- [ ] Generate new key for each client
- [ ] Email new key to client contact
- [ ] Schedule old key deprecation (30 days)
- [ ] Monitor for clients still using old keys
- [ ] Revoke old keys after grace period

---

### 2. Review and update egress allowlist

```bash
# Review current allowlist
cat infra/terraform/modules/networking/egress-allowlist.tf

# Check for new council domains (website migrations, third-party delegates)
# Test each domain is still active:
for domain in $(grep -oP 'destination_addresses\s*=\s*\["\K[^"]+' infra/terraform/modules/networking/egress-allowlist.tf); do
  if curl -s --head --max-time 5 "https://${domain}" > /dev/null; then
    echo "✅ ${domain}"
  else
    echo "❌ ${domain} - UNREACHABLE"
  fi
done
```

**Action if domain unreachable:**
- Check with council for website migration
- Update allowlist with new domain
- Deploy Terraform changes
- Test adapter against new domain

---

### 3. Test one IR drill scenario

**Incident response drill (rotate through scenarios):**

**Month 1:** API service failure
```bash
# Simulate API failure
docker compose stop api

# Time how long to detect and recover
# Document in: docs/ir-drill-log.md

# Expected:
# - Detection: <5 minutes (Prometheus alert)
# - Recovery: <10 minutes (restart service)
```

**Month 2:** Database connection loss
```bash
# Simulate database failure
docker compose stop postgres

# Verify API returns 503 gracefully
# Test recovery procedure from disaster-recovery.md
```

**Month 3:** Redis cache failure
```bash
# Simulate Redis failure
docker compose stop redis

# Verify API degrades gracefully (slower responses, no crashes)
# Test recovery procedure
```

---

### 4. Review and prune audit logs

```bash
# Check audit log size
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "SELECT 
        pg_size_pretty(pg_total_relation_size('audit_logs')) AS size,
        COUNT(*) AS row_count,
        MIN(created_at) AS oldest,
        MAX(created_at) AS newest
      FROM audit_logs;"

# Prune logs older than 90 days
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';"
```

**Expected:** <100MB table size, <1M rows

**Action if oversized:**
- Export to cold storage (Azure Blob)
- Archive logs older than 90 days
- Consider partitioning strategy

---

## Common operations

### Disable an adapter

**When to use:**
- Council website breaking change detected
- High failure rate (>50%)
- Security issue with council website
- Council requests suspension

**Procedure:**

```bash
# Step 1: Set kill switch environment variable
export ADAPTER_KILL_SWITCH_EASTLEIGH=true

# Step 2: Update .env file (persistent)
echo "ADAPTER_KILL_SWITCH_EASTLEIGH=true" >> .env

# Step 3: Restart API to apply change
docker compose restart api

# Step 4: Verify adapter is disabled
curl http://localhost:3000/v1/councils/eastleigh/health
# Expected: {"status":"disabled","reason":"kill_switch_enabled"}

# Step 5: Notify clients
# - Update status page
# - Email API consumers using this council
```

**Re-enable adapter:**

```bash
# After fix is deployed
export ADAPTER_KILL_SWITCH_EASTLEIGH=false
sed -i 's/ADAPTER_KILL_SWITCH_EASTLEIGH=true/ADAPTER_KILL_SWITCH_EASTLEIGH=false/' .env
docker compose restart api

# Verify re-enabled
curl http://localhost:3000/v1/councils/eastleigh/health
# Expected: {"status":"healthy"}
```

---

### Rotate an API key

**When to use:**
- Monthly key rotation (security best practice)
- Suspected key compromise
- Client offboarding (revoke immediately)

**Procedure:**

```bash
# Step 1: Generate new key
curl -X POST http://localhost:3000/v1/admin/keys/{key_id}/rotate \
  -H "X-API-Key: hbp_live_admin..." \
  -H "Content-Type: application/json" \
  -d '{"grace_period_days": 30}' \
  | jq -r '.new_key'

# Example response:
# {
#   "old_key_id": "key_abc123",
#   "new_key": "hbp_live_xyz789...",
#   "new_key_id": "key_xyz789",
#   "grace_period_ends": "2024-04-25T00:00:00Z"
# }

# Step 2: Email new key to client
# Subject: API Key Rotation - Action Required
# Body:
#   Your API key has been rotated for security.
#   New key: hbp_live_xyz789...
#   Old key expires: 2024-04-25
#   Please update your integration by this date.

# Step 3: Monitor usage of old key
curl http://localhost:3000/v1/admin/keys/{old_key_id}/usage \
  -H "X-API-Key: hbp_live_admin..."

# Step 4: After grace period, revoke old key
curl -X DELETE http://localhost:3000/v1/admin/keys/{old_key_id} \
  -H "X-API-Key: hbp_live_admin..."
```

---

### Force evidence purge

**When to use:**
- Storage costs elevated
- Compliance requirement (immediate deletion)
- Evidence retention policy change

**Procedure:**

```bash
# Step 1: Preview what will be purged
curl -X GET http://localhost:3000/v1/admin/retention/preview \
  -H "X-API-Key: hbp_live_admin..." \
  | jq '.blobs_to_purge | length'

# Step 2: Execute purge (blobs older than 7 days)
curl -X POST http://localhost:3000/v1/admin/retention/purge-expired \
  -H "X-API-Key: hbp_live_admin..." \
  | jq .

# Example response:
# {
#   "purged_count": 1247,
#   "freed_bytes": 52428800,
#   "purge_duration_ms": 3420
# }

# Step 3: Verify storage size reduced
az storage blob list \
  --account-name stbindayproduction \
  --container-name evidence \
  --query "length([])" \
  --output tsv
```

---

### Scale API horizontally

**When to use:**
- High request load (>1000 req/min)
- Response latency elevated (p95 >500ms)
- Planned traffic spike (new client onboarding)

**Procedure:**

```bash
# Docker Compose (local/single-host)
docker compose up -d --scale api=3

# Kubernetes (production)
kubectl scale deployment hampshire-bin-api --replicas=3

# Azure Container Apps (production)
az containerapp update \
  --name hampshire-bin-api \
  --resource-group rg-binday-production-uks \
  --min-replicas 3 \
  --max-replicas 10

# Verify scaling
kubectl get pods -l app=hampshire-bin-api
# Expected: 3 pods in Running state

# Monitor load distribution
curl http://prometheus.binplatform.example.com/api/v1/query \
  --data-urlencode 'query=rate(http_requests_total[5m]) by (pod)'
```

---

### Investigate slow API response

**Symptoms:**
- Client reports slow responses
- Prometheus p95 latency >500ms
- Application Insights shows elevated duration

**Diagnosis:**

```bash
# Step 1: Check current p95 latency by endpoint
curl -s http://prometheus.binplatform.example.com/api/v1/query \
  --data-urlencode 'query=histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (route)' \
  | jq -r '.data.result[] | "\(.metric.route): \(.value[1])s"'

# Step 2: Check database query performance
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "SELECT 
        query,
        calls,
        mean_exec_time,
        max_exec_time
      FROM pg_stat_statements 
      ORDER BY mean_exec_time DESC 
      LIMIT 10;"

# Step 3: Check Redis latency
redis-cli -h redis.binplatform.example.com --latency-history

# Step 4: Check for slow adapters
az monitor app-insights query \
  --app app-insights-binday-production \
  --analytics-query "
    dependencies
    | where timestamp > ago(1h)
    | where name contains 'adapter'
    | summarize avg(duration), max(duration) by name
    | order by avg_duration desc
  " \
  --output table
```

**Common fixes:**
- Slow database queries → Add indexes, optimize queries
- Redis latency → Check Redis memory usage, consider scaling
- Slow adapter → Review adapter implementation, check council website performance

---

### Review and investigate security alert

**Alert types:**
- `RateLimitExceeded` → Potential abuse or misconfigured client
- `AuthenticationFailure` → Potential brute force attack
- `EnumerationDetected` → Potential data scraping attempt

**Investigation procedure:**

```bash
# Step 1: Get alert details
curl http://alertmanager.binplatform.example.com/api/v2/alerts \
  | jq -r '.[] | select(.labels.alertname == "RateLimitExceeded")'

# Step 2: Query Application Insights for source IPs
az monitor app-insights query \
  --app app-insights-binday-production \
  --analytics-query "
    requests
    | where timestamp > ago(1h)
    | where customDimensions.rate_limited == 'true'
    | summarize count() by client_ip = client_IP
    | order by count_ desc
  " \
  --output table

# Step 3: Check API key usage for abusive client
az monitor app-insights query \
  --app app-insights-binday-production \
  --analytics-query "
    requests
    | where timestamp > ago(1h)
    | where client_IP == '203.0.113.45'
    | extend api_key_id = tostring(customDimensions.api_key_id)
    | summarize count() by api_key_id
  " \
  --output table

# Step 4: Temporary IP block (if malicious)
# Add to NSG deny rule
az network nsg rule create \
  --resource-group rg-binday-production-uks \
  --nsg-name nsg-api \
  --name block-abuse-ip \
  --priority 100 \
  --source-address-prefixes 203.0.113.45 \
  --destination-port-ranges 443 \
  --access Deny \
  --protocol Tcp

# Step 5: Revoke API key if compromised
curl -X DELETE http://localhost:3000/v1/admin/keys/{api_key_id} \
  -H "X-API-Key: hbp_live_admin..."

# Step 6: Document in security-incidents.md
```

---

## Monitoring quick reference

### Key Grafana dashboards

- **Adapter Health Overview**: https://grafana.binplatform.example.com/d/adapter-health
- **API Performance**: https://grafana.binplatform.example.com/d/api-performance
- **Infrastructure Metrics**: https://grafana.binplatform.example.com/d/infrastructure

### Key Prometheus queries

```promql
# Current adapter health status (0 = down, 1 = up)
adapter_health_status{council_id="eastleigh"}

# API request rate (requests per second)
rate(http_requests_total[5m])

# API p95 latency by endpoint
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) by (route)

# Database connection pool usage
pg_pool_active_connections / pg_pool_max_connections

# Redis memory usage
redis_memory_used_bytes / redis_memory_max_bytes
```

### Key Application Insights queries

```kql
// API error rate (last hour)
requests
| where timestamp > ago(1h)
| summarize 
    total = count(),
    errors = countif(success == false),
    error_rate = round(100.0 * countif(success == false) / count(), 2)

// Slowest API endpoints
requests
| where timestamp > ago(1h)
| summarize avg(duration), max(duration) by name
| order by avg_duration desc
| take 10

// Failed adapter acquisitions
customEvents
| where timestamp > ago(1h)
| where name == "acquisition_attempt"
| where customDimensions.success == false
| project timestamp, council_id = customDimensions.council_id, error = customDimensions.error
```

---

## Escalation paths

### Incident severity levels

| Severity | Example | Response time | Escalation |
|---|---|---|---|
| **P0** | Complete outage | Immediate | Page on-call, notify manager |
| **P1** | >50% failure rate | 15 minutes | Email on-call, notify manager |
| **P2** | Single adapter failure | 1 hour | Email team |
| **P3** | Evidence collection issue | 4 hours | Ticket in backlog |

### On-call rotation

**PagerDuty schedule:** https://binplatform.pagerduty.com/schedules

**Primary on-call:** Rotate weekly (Monday 09:00 UTC)  
**Secondary on-call:** DevOps lead (escalation only)

---

## Quick links

- **Production API**: https://api.binplatform.example.com
- **Grafana**: https://grafana.binplatform.example.com
- **Prometheus**: https://prometheus.binplatform.example.com
- **Alertmanager**: https://alertmanager.binplatform.example.com
- **Azure Portal**: https://portal.azure.com → `rg-binday-production-uks`
- **GitHub Repository**: https://github.com/crowdedLeopard/binPlatform
- **GitHub Actions**: https://github.com/crowdedLeopard/binPlatform/actions
- **Status Page**: https://status.binplatform.example.com

---

## Appendix: Environment variables reference

**Critical environment variables:**

```bash
# Database
DATABASE_URL=postgresql://binday:***@pg-binday-production.postgres.database.azure.com:5432/binday
DATABASE_SSL=true
DATABASE_MAX_CONNECTIONS=20

# Redis
REDIS_URL=redis://:***@redis.binplatform.example.com:6379
REDIS_TLS=true

# Azure Storage
AZURE_STORAGE_CONNECTION_STRING=***
AZURE_STORAGE_CONTAINER_NAME=evidence

# Security
API_KEY_SALT=*** (bcrypt salt, cost 12)
ADMIN_API_KEY_HASH=*** (bcrypt hash)

# Feature flags
EVIDENCE_COLLECTION_ENABLED=true
ENUMERATION_DETECTION_ENABLED=true

# Kill switches (one per council)
ADAPTER_KILL_SWITCH_EASTLEIGH=false
# ... (see .env.example for full list)

# Monitoring
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
LOG_LEVEL=info
```

**All environment variables documented in:** `.env.example`
