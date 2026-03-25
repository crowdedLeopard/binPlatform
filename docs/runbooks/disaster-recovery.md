# Disaster Recovery Runbook

## RTO/RPO Targets

| Component | RPO | RTO | Notes |
|---|---|---|---|
| API service | N/A (stateless) | 5 minutes | Redeploy from image |
| PostgreSQL | 1 hour | 30 minutes | Point-in-time restore from Azure Backup |
| Redis | None (ephemeral cache) | 5 minutes | Rebuild from config |
| Evidence blobs | 24 hours | 1 hour | Geo-redundant storage |
| Adapter configuration | None (in code) | 10 minutes | Git checkout + redeploy |

## Failure Scenarios

### 1. API service failure

**Detection:**
- Health probe fails (`/health/ready` returns 503)
- Prometheus alert: `HighAPIErrorRate` or `APIServiceDown`
- Container orchestrator marks service unhealthy
- Elevated 5xx responses in Application Insights

**Recovery:**

```bash
# Step 1: Check container logs
docker logs <container_id> --tail 100

# Step 2: Check resource utilization
docker stats <container_id>

# Step 3: If OOM (Out of Memory)
# - Check memory limits in docker-compose.yml or Kubernetes manifests
# - Scale vertically: increase memory allocation
# - Restart: docker compose restart api

# Step 4: Restart service
docker compose restart api

# Step 5: If persistent failure, redeploy from last known-good image
docker pull <registry>/hampshire-bin-api:<last-good-tag>
docker compose up -d api

# Step 6: Verify recovery
curl http://localhost:3000/health/ready
# Expected: 200 OK with {"status":"ok","database":"up","redis":"up"}
```

**Post-incident:**
- Review logs in Application Insights for root cause
- Update runbook if new failure mode discovered
- Consider canary deployment for future releases

---

### 2. PostgreSQL failure

**Detection:**
- API returns 503 on data-dependent endpoints
- `/health/ready` reports database unavailable
- Prometheus alert: `DatabaseConnectionFailure`
- Azure Monitor: PostgreSQL Flexible Server unavailable

**Recovery:**

```bash
# Step 1: Check PostgreSQL status
# For Azure Flexible Server:
az postgres flexible-server show \
  --resource-group rg-binday-production-uks \
  --name pg-binday-production

# For self-hosted:
docker exec -it <postgres_container> pg_isready -U binday

# Step 2: Attempt connection
psql -h <host> -U binday -d binday -c 'SELECT 1'

# Step 3: If managed PaaS (Azure Flexible Server) — RECOMMENDED
# Restore from point-in-time backup (up to 7 days retention)
az postgres flexible-server restore \
  --resource-group rg-binday-production-uks \
  --name pg-binday-production-restored \
  --source-server pg-binday-production \
  --restore-time "2024-03-25T14:30:00Z"

# Update connection string to point to restored server
# Update DATABASE_URL in environment variables or Key Vault

# Step 4: If self-hosted, restore from pg_dump backup
gunzip -c backup-20240325.sql.gz | psql -h <host> -U binday -d binday

# Step 5: Run pending migrations
npm run db:migrate

# Step 6: Verify recovery
curl http://localhost:3000/health/ready
# Expected: 200 OK with database:"up"
```

**Post-incident:**
- Document time to restore (measure against 30min RTO)
- Review backup retention policy (ensure adequate coverage)
- Test restore in staging environment monthly

---

### 3. Redis failure

**Detection:**
- Enumeration detection disabled (no rate limit tracking)
- Cache miss rate increases to 100%
- `/health/ready` reports Redis unavailable
- Prometheus alert: `RedisConnectionFailure`

**Recovery:**

```bash
# Step 1: Redis is ephemeral cache — data loss is ACCEPTABLE
# No persistent data in Redis (only rate limit counters)

# Step 2: Restart Redis
docker compose restart redis

# Step 3: Wait for connections to re-establish (60 seconds)
sleep 60

# Step 4: Verify connectivity
redis-cli -h <host> -a <password> PING
# Expected: PONG

# Step 5: Cache will warm automatically from PostgreSQL
# No manual intervention required

# Step 6: Verify API recovery
curl http://localhost:3000/health/ready
# Expected: 200 OK with redis:"up"
```

**Special considerations:**
- Enumeration detection counters reset to zero after Redis restart
- Monitor API abuse logs for first 15 minutes post-recovery
- Rate limiting will rebuild as requests arrive
- No data loss impact on client-facing API responses

---

### 4. Azure Blob Storage failure

**Detection:**
- Evidence upload failures in logs
- Acquisition attempts fail with storage errors
- Application Insights: Elevated `BlobStorageError` events
- Azure Monitor: Storage account unavailable

**Recovery:**

```bash
# Step 1: Check Azure Storage status
az storage account show \
  --name stbindayproduction \
  --resource-group rg-binday-production-uks

# Step 2: Evidence storage is NON-CRITICAL to data serving
# - Acquisitions continue to function
# - Evidence upload failures are logged but don't block API response
# - Evidence uploaded during outage is LOST (acceptable per retention policy)

# Step 3: If prolonged outage, temporarily disable evidence collection
# Set environment variable:
export EVIDENCE_COLLECTION_ENABLED=false
docker compose restart api

# Step 4: Recovery is automatic when Azure Storage becomes available
# Monitor Azure Storage status page: https://status.azure.com

# Step 5: Re-enable evidence collection when storage is restored
export EVIDENCE_COLLECTION_ENABLED=true
docker compose restart api
```

**Post-incident:**
- Evidence lost during outage is not recoverable (by design)
- Review retention policy: evidence auto-purged after 7 days
- Consider multi-region storage for high availability (cost tradeoff)

---

### 5. Complete environment loss

**Scenario:** Total infrastructure failure (region outage, accidental deletion, catastrophic failure)

**Recovery from scratch:**

```bash
# Time estimate: 45 minutes for complete rebuild

# Step 1: Clone repository
git clone https://github.com/crowdedLeopard/binPlatform
cd binPlatform

# Step 2: Provision infrastructure
cd infra/terraform/environments/production
terraform init
terraform apply -auto-approve
# Estimated: 15 minutes

# Step 3: Configure secrets in Azure Key Vault
# - DATABASE_URL (from Terraform output)
# - REDIS_URL (from Terraform output)
# - AZURE_STORAGE_CONNECTION_STRING (from Terraform output)
# - API_KEY_SALT (generate new: bcrypt.genSaltSync(12))
# - ADMIN_API_KEY_HASH (generate new: bcrypt.hashSync(password, 12))

az keyvault secret set \
  --vault-name kv-binday-production \
  --name DATABASE-URL \
  --value "postgresql://..."

# Step 4: Deploy application
cd ../../../../deploy
docker compose pull
docker compose up -d
# Estimated: 5 minutes

# Step 5: Run database migrations
docker exec -it <api_container> npm run db:migrate
# Estimated: 2 minutes

# Step 6: Verify health
curl http://localhost:3000/health/ready
curl http://localhost:3000/metrics

# Step 7: Run synthetic checks
npm run test:synthetic

# Step 8: Notify clients of restoration
# - Update status page
# - Email notification to registered API consumers
```

**Post-incident:**
- Full post-mortem required
- Update DR runbook with lessons learned
- Review infrastructure-as-code coverage (ensure 100% reproducibility)
- Test full rebuild quarterly

---

## Backup Procedures

### PostgreSQL backup

**Automated daily backup (add to cron):**

```bash
#!/bin/bash
# /etc/cron.daily/pg-backup.sh

set -euo pipefail

DATE=$(date +%Y%m%d)
BACKUP_FILE="backup-${DATE}.sql.gz"
RETENTION_DAYS=30

# Dump database
pg_dump -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  --no-owner \
  --no-acl \
  | gzip > "${BACKUP_FILE}"

# Upload to separate Azure Storage account (geo-redundant)
az storage blob upload \
  --account-name stbindaybackups \
  --container-name db-backups \
  --name "${BACKUP_FILE}" \
  --file "${BACKUP_FILE}" \
  --auth-mode login

# Delete local file
rm "${BACKUP_FILE}"

# Prune old backups (retain 30 days)
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y%m%d)
az storage blob list \
  --account-name stbindaybackups \
  --container-name db-backups \
  --query "[?properties.creationTime < '${CUTOFF_DATE}'].name" \
  --output tsv \
  | xargs -I {} az storage blob delete \
      --account-name stbindaybackups \
      --container-name db-backups \
      --name {}

echo "✅ Backup completed: ${BACKUP_FILE}"
```

**Manual backup (for pre-deployment safety):**

```bash
# Quick manual backup before major deployment
pg_dump -h <host> -U binday -d binday \
  | gzip > pre-deployment-$(date +%Y%m%d-%H%M%S).sql.gz
```

### Configuration backup

**All configuration is in git (no separate backup needed):**
- Infrastructure: `infra/terraform/` (committed to git)
- Application config: `src/config/`, `.env.example` (committed to git)
- Secrets: Azure Key Vault (Azure-managed backup with soft delete)

**Key Vault backup:**
```bash
# Azure Key Vault has built-in soft delete (90-day retention)
# Manual backup not required, but for compliance:

az keyvault secret backup \
  --vault-name kv-binday-production \
  --name DATABASE-URL \
  --file database-url.backup

# Store in separate secure location (encrypted, access-controlled)
```

**No additional backup needed for:**
- Docker images (stored in Azure Container Registry with retention policy)
- CI/CD configuration (stored in GitHub, version controlled)
- Monitoring dashboards (provisioned via Terraform, code-based)

---

## Testing and Validation

### Quarterly restore drill

**Purpose:** Validate backup procedures and measure RTO/RPO

**Procedure:**

```bash
# Run in staging environment (never production)

# 1. Create point-in-time restore of production database
az postgres flexible-server restore \
  --resource-group rg-binday-staging-uks \
  --name pg-binday-drill \
  --source-server pg-binday-production \
  --restore-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 2. Deploy application to staging
cd infra/terraform/environments/staging
terraform apply -auto-approve

# 3. Run health checks
curl https://staging.binplatform.example.com/health/ready

# 4. Run synthetic checks
npm run test:synthetic

# 5. Measure time to recovery
# Document: Time from restore initiation to healthy API

# 6. Clean up drill resources
terraform destroy -auto-approve
```

**Success criteria:**
- RTO met: API fully operational within 30 minutes
- RPO met: Data loss < 1 hour
- All health checks pass
- Synthetic checks pass for all adapters

**Schedule:** First Monday of every quarter (Jan, Apr, Jul, Oct)

---

## Escalation

### Severity levels

| Severity | Impact | Response time | Escalation |
|---|---|---|---|
| P0 - Critical | Complete service outage | Immediate | Page on-call engineer |
| P1 - High | Degraded service (>50% failure rate) | 15 minutes | Email on-call + manager |
| P2 - Medium | Single adapter failure | 1 hour | Email team distribution list |
| P3 - Low | Evidence collection failure | 4 hours | Ticket in backlog |

### Contact escalation

1. **On-call engineer** (24/7): PagerDuty rotation
2. **DevOps lead**: crowdedLeopard (email + Teams)
3. **Engineering manager**: [TBD]
4. **CTO**: [TBD] (P0 incidents only)

### Communication channels

- **Incident declaration**: `/incident declare` in #incidents Slack channel
- **Status updates**: Every 30 minutes during P0/P1 incidents
- **Client notifications**: Email to registered API consumers (via status page)
- **Post-mortem**: Required for all P0/P1 incidents (within 3 business days)

---

## Post-incident review template

```markdown
# Post-incident review: [Incident name]

**Date:** YYYY-MM-DD
**Severity:** P0/P1/P2/P3
**Duration:** [Start time] to [End time] (total: X hours)
**Impact:** [Description of service impact]

## Timeline

- HH:MM - Incident detected
- HH:MM - On-call engineer paged
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Service restored
- HH:MM - Incident closed

## Root cause

[Detailed description of what caused the incident]

## Resolution

[What was done to resolve the incident]

## Prevention

[Action items to prevent recurrence]

- [ ] Update monitoring to detect earlier
- [ ] Add automated remediation
- [ ] Update documentation
- [ ] Infrastructure change required

## Lessons learned

[What went well, what could be improved]
```

---

## Appendix: Emergency contacts

| Role | Name | Email | Phone | Backup |
|---|---|---|---|---|
| On-call (Primary) | PagerDuty rotation | - | - | - |
| DevOps Lead | crowdedLeopard | [email] | [phone] | - |
| Database Admin | [TBD] | [email] | [phone] | - |
| Cloud Architect | [TBD] | [email] | [phone] | - |

## Appendix: Azure resource URLs

- **Azure Portal**: https://portal.azure.com
- **Production resource group**: `rg-binday-production-uks`
- **Database**: `pg-binday-production.postgres.database.azure.com`
- **Storage**: `stbindayproduction.blob.core.windows.net`
- **Key Vault**: `kv-binday-production.vault.azure.net`
- **Container Registry**: `acrbindayproduction.azurecr.io`
