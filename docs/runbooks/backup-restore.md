# Backup and Restore Runbook

## Overview

This runbook documents backup strategies, procedures, and restore processes for the Hampshire Bin Platform.

---

## What needs backing up

### PostgreSQL database (CRITICAL)

**What:** Normalised bin collection data
- Properties table (UPRNs, addresses, council mappings)
- Collections table (bin collection schedules, dates, types)
- Adapter execution logs (metadata about acquisitions)
- Audit logs (API key usage, admin actions)

**Why critical:**
- Only source of normalised data
- Recreating from source would require re-running all adapters
- Contains client-specific property mappings

**Backup frequency:** Daily (automated)
**Retention:** 30 days rolling, plus monthly snapshots (12 months)

---

### Azure Blob Storage (MEDIUM)

**What:** Evidence artifacts from adapter acquisitions
- HTML snapshots of council web pages
- JSON responses from council APIs
- Screenshots of council interfaces (for browser-based adapters)

**Why medium priority:**
- Used for debugging adapter failures
- Supports compliance/audit requirements
- Immutable by design (never updated, only created/deleted)

**Backup frequency:** Continuous (geo-redundant storage)
**Retention:** 7 days auto-purge (evidence retention policy)

**Note:** Evidence is ephemeral by design. Data loss during storage outage is acceptable.

---

### Configuration (LOW)

**What:**
- Infrastructure-as-code (Terraform modules)
- Application configuration (environment variables, feature flags)
- CI/CD pipelines (GitHub Actions workflows)
- Adapter implementation code

**Why low priority:**
- Fully version-controlled in git
- No secrets in repository (secrets in Key Vault)
- Reproducible from git checkout

**Backup frequency:** Continuous (git commits)
**Retention:** Indefinite (git history)

---

## What DOES NOT need backing up

### Redis cache (EPHEMERAL)

**What:** Temporary cache of API responses and rate limit counters

**Why no backup:**
- Cache misses are handled gracefully (PostgreSQL fallback)
- Rate limit counters reset on Redis restart (acceptable)
- No persistent data

**Recovery:** Rebuild from config, warm from PostgreSQL

---

### Application logs (ARCHIVED)

**What:** Structured logs from API, workers, adapters

**Why no backup:**
- Sent to Application Insights (Azure-managed retention)
- Retention: 90 days in Application Insights
- Not required for service restoration

**Recovery:** Historical logs lost if outside retention window (acceptable)

---

## Backup procedures

### Automated PostgreSQL backup

**Cron job (runs daily at 02:00 UTC):**

```bash
#!/bin/bash
# /etc/cron.daily/pg-backup.sh
# Daily PostgreSQL backup with geo-redundant storage

set -euo pipefail

# Configuration
DB_HOST="pg-binday-production.postgres.database.azure.com"
DB_USER="binday"
DB_NAME="binday"
BACKUP_DIR="/var/backups/postgresql"
DATE=$(date +%Y%m%d)
BACKUP_FILE="${BACKUP_DIR}/backup-${DATE}.sql.gz"
BACKUP_ACCOUNT="stbindaybackups"
BACKUP_CONTAINER="db-backups"
RETENTION_DAYS=30

# Create backup directory if not exists
mkdir -p "${BACKUP_DIR}"

# Dump database (excluding sensitive columns)
export PGPASSWORD="${DB_PASSWORD}"
pg_dump -h "${DB_HOST}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  | gzip > "${BACKUP_FILE}"

# Verify backup file is not empty
if [ ! -s "${BACKUP_FILE}" ]; then
  echo "❌ ERROR: Backup file is empty"
  exit 1
fi

# Upload to Azure Storage (geo-redundant account)
az storage blob upload \
  --account-name "${BACKUP_ACCOUNT}" \
  --container-name "${BACKUP_CONTAINER}" \
  --name "backup-${DATE}.sql.gz" \
  --file "${BACKUP_FILE}" \
  --auth-mode login \
  --overwrite

# Verify upload
if ! az storage blob exists \
  --account-name "${BACKUP_ACCOUNT}" \
  --container-name "${BACKUP_CONTAINER}" \
  --name "backup-${DATE}.sql.gz" \
  --auth-mode login \
  --query exists \
  --output tsv | grep -q true; then
  echo "❌ ERROR: Backup upload failed"
  exit 1
fi

# Delete local file (save disk space)
rm "${BACKUP_FILE}"

# Prune old backups (retain 30 days)
CUTOFF_DATE=$(date -d "${RETENTION_DAYS} days ago" +%Y-%m-%d)
az storage blob list \
  --account-name "${BACKUP_ACCOUNT}" \
  --container-name "${BACKUP_CONTAINER}" \
  --prefix "backup-" \
  --query "[?properties.creationTime < '${CUTOFF_DATE}T00:00:00Z'].name" \
  --output tsv \
  | while read -r blob; do
      echo "Deleting old backup: ${blob}"
      az storage blob delete \
        --account-name "${BACKUP_ACCOUNT}" \
        --container-name "${BACKUP_CONTAINER}" \
        --name "${blob}" \
        --auth-mode login
    done

# Log success
echo "✅ Backup completed: backup-${DATE}.sql.gz"
echo "   Size: $(du -h ${BACKUP_FILE} | cut -f1)"
echo "   Uploaded to: ${BACKUP_ACCOUNT}/${BACKUP_CONTAINER}"

# Send monitoring metric (for Prometheus alerting)
curl -X POST http://localhost:3000/metrics/backup \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"success\",\"date\":\"${DATE}\",\"size_bytes\":$(stat -c%s ${BACKUP_FILE})}"
```

**Installation:**

```bash
# Copy script to cron.daily
sudo cp scripts/pg-backup.sh /etc/cron.daily/
sudo chmod +x /etc/cron.daily/pg-backup.sh

# Test run (dry-run)
sudo /etc/cron.daily/pg-backup.sh

# Verify backup exists in Azure Storage
az storage blob list \
  --account-name stbindaybackups \
  --container-name db-backups \
  --output table
```

---

### Manual pre-deployment backup

**Before major deployments (schema changes, migrations, major releases):**

```bash
# Quick manual backup with descriptive name
DATE=$(date +%Y%m%d-%H%M%S)
DESCRIPTION="pre-deployment-v2.0.0"

pg_dump -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  --no-owner \
  --no-acl \
  | gzip > "${DESCRIPTION}-${DATE}.sql.gz"

# Upload to separate "manual-backups" container
az storage blob upload \
  --account-name stbindaybackups \
  --container-name manual-backups \
  --name "${DESCRIPTION}-${DATE}.sql.gz" \
  --file "${DESCRIPTION}-${DATE}.sql.gz" \
  --auth-mode login

# Verify upload
az storage blob exists \
  --account-name stbindaybackups \
  --container-name manual-backups \
  --name "${DESCRIPTION}-${DATE}.sql.gz" \
  --auth-mode login

echo "✅ Manual backup: ${DESCRIPTION}-${DATE}.sql.gz"
```

---

### Monthly snapshot (long-term retention)

**First day of each month (automated):**

```bash
# Take monthly snapshot for compliance/audit
# Retained for 12 months

DATE=$(date +%Y%m)
SNAPSHOT_NAME="monthly-snapshot-${DATE}"

# Use Azure Flexible Server snapshot feature
az postgres flexible-server backup create \
  --resource-group rg-binday-production-uks \
  --server-name pg-binday-production \
  --backup-name "${SNAPSHOT_NAME}"

# Tag for retention policy
az postgres flexible-server backup update \
  --resource-group rg-binday-production-uks \
  --server-name pg-binday-production \
  --backup-name "${SNAPSHOT_NAME}" \
  --retention-days 365

echo "✅ Monthly snapshot: ${SNAPSHOT_NAME} (retained 12 months)"
```

---

## Restore procedures

### Full restore from daily backup

**Scenario:** Complete database corruption or data loss

```bash
# Step 1: Choose backup to restore
az storage blob list \
  --account-name stbindaybackups \
  --container-name db-backups \
  --output table

# Step 2: Download backup
BACKUP_DATE="20240325"  # Choose date
az storage blob download \
  --account-name stbindaybackups \
  --container-name db-backups \
  --name "backup-${BACKUP_DATE}.sql.gz" \
  --file "restore-${BACKUP_DATE}.sql.gz" \
  --auth-mode login

# Step 3: Stop API to prevent writes during restore
docker compose stop api

# Step 4: Drop and recreate database (DESTRUCTIVE)
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d postgres \
  -c "DROP DATABASE IF EXISTS binday;"

psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d postgres \
  -c "CREATE DATABASE binday OWNER binday;"

# Step 5: Restore from backup
gunzip -c "restore-${BACKUP_DATE}.sql.gz" \
  | psql -h pg-binday-production.postgres.database.azure.com \
      -U binday \
      -d binday

# Step 6: Run any pending migrations
npm run db:migrate

# Step 7: Verify data integrity
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "SELECT COUNT(*) FROM properties;"

psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "SELECT COUNT(*) FROM collections WHERE next_collection_date >= CURRENT_DATE;"

# Step 8: Restart API
docker compose start api

# Step 9: Verify health
curl http://localhost:3000/health/ready

# Step 10: Run synthetic checks
npm run test:synthetic

# Cleanup
rm "restore-${BACKUP_DATE}.sql.gz"

echo "✅ Restore complete from backup-${BACKUP_DATE}.sql.gz"
```

**Estimated time:** 15-30 minutes (depending on database size)

---

### Point-in-time restore (Azure Flexible Server)

**Scenario:** Accidental data deletion or corruption (known time)

```bash
# Azure Flexible Server supports point-in-time restore (up to 7 days)

# Step 1: Identify restore point
RESTORE_TIME="2024-03-25T14:30:00Z"  # ISO 8601 format

# Step 2: Create restored server (non-destructive)
az postgres flexible-server restore \
  --resource-group rg-binday-production-uks \
  --name pg-binday-production-restored \
  --source-server pg-binday-production \
  --restore-time "${RESTORE_TIME}"

# Step 3: Wait for restore to complete (5-15 minutes)
az postgres flexible-server show \
  --resource-group rg-binday-production-uks \
  --name pg-binday-production-restored \
  --query state \
  --output tsv

# Step 4: Update application connection string
# Option A: Update Key Vault secret
az keyvault secret set \
  --vault-name kv-binday-production \
  --name DATABASE-URL \
  --value "postgresql://binday:PASSWORD@pg-binday-production-restored.postgres.database.azure.com:5432/binday"

# Option B: Update docker-compose.yml environment variable
export DATABASE_URL="postgresql://binday:PASSWORD@pg-binday-production-restored.postgres.database.azure.com:5432/binday"

# Step 5: Restart API with new connection string
docker compose restart api

# Step 6: Verify health
curl http://localhost:3000/health/ready

# Step 7: Run synthetic checks
npm run test:synthetic

# Step 8: Once verified, promote restored server to production
# (Rename servers or update DNS)

echo "✅ Point-in-time restore complete to ${RESTORE_TIME}"
```

---

### Selective table restore

**Scenario:** Single table corrupted, rest of database intact

```bash
# Restore only specific table(s) from backup

BACKUP_DATE="20240325"
TABLE_NAME="collections"

# Step 1: Download backup
az storage blob download \
  --account-name stbindaybackups \
  --container-name db-backups \
  --name "backup-${BACKUP_DATE}.sql.gz" \
  --file "restore-${BACKUP_DATE}.sql.gz" \
  --auth-mode login

# Step 2: Extract schema and data for specific table
gunzip -c "restore-${BACKUP_DATE}.sql.gz" \
  | pg_restore --table="${TABLE_NAME}" \
  > "${TABLE_NAME}-restore.sql"

# Step 3: Drop and recreate table (DESTRUCTIVE for this table only)
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "DROP TABLE IF EXISTS ${TABLE_NAME} CASCADE;"

# Step 4: Restore table
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -f "${TABLE_NAME}-restore.sql"

# Step 5: Verify table integrity
psql -h pg-binday-production.postgres.database.azure.com \
  -U binday \
  -d binday \
  -c "SELECT COUNT(*) FROM ${TABLE_NAME};"

# Cleanup
rm "restore-${BACKUP_DATE}.sql.gz" "${TABLE_NAME}-restore.sql"

echo "✅ Table ${TABLE_NAME} restored from backup-${BACKUP_DATE}.sql.gz"
```

---

## Testing restore procedures

### Quarterly restore drill

**Schedule:** First Monday of every quarter (Jan, Apr, Jul, Oct)

**Procedure:**

```bash
# ALWAYS run in staging environment (NEVER production)

# Step 1: Start timer (measure RTO)
START_TIME=$(date +%s)

# Step 2: Download latest production backup
LATEST_BACKUP=$(az storage blob list \
  --account-name stbindaybackups \
  --container-name db-backups \
  --query "sort_by([].{name:name, created:properties.creationTime}, &created)[-1].name" \
  --output tsv)

az storage blob download \
  --account-name stbindaybackups \
  --container-name db-backups \
  --name "${LATEST_BACKUP}" \
  --file "restore-drill.sql.gz" \
  --auth-mode login

# Step 3: Restore to staging database
gunzip -c restore-drill.sql.gz \
  | psql -h pg-binday-staging.postgres.database.azure.com \
      -U binday \
      -d binday

# Step 4: Run migrations
npm run db:migrate

# Step 5: Start staging API
docker compose -f docker-compose.staging.yml up -d

# Step 6: Run health checks
curl https://staging.binplatform.example.com/health/ready

# Step 7: Run synthetic checks
npm run test:synthetic -- --env staging

# Step 8: Measure RTO
END_TIME=$(date +%s)
RTO=$((END_TIME - START_TIME))
echo "⏱️  RTO: ${RTO} seconds ($((RTO / 60)) minutes)"

# Step 9: Record results
echo "Restore drill: ${LATEST_BACKUP}" >> docs/restore-drill-log.md
echo "  Date: $(date)" >> docs/restore-drill-log.md
echo "  RTO: $((RTO / 60)) minutes" >> docs/restore-drill-log.md
echo "  Status: ✅ Success" >> docs/restore-drill-log.md
echo "" >> docs/restore-drill-log.md

# Cleanup
rm restore-drill.sql.gz

echo "✅ Restore drill complete - RTO: $((RTO / 60)) minutes"
```

**Success criteria:**
- Restore completes without errors
- All tables present with expected row counts
- Health checks pass
- Synthetic checks pass
- RTO < 30 minutes

**Failure handling:**
If restore drill fails:
1. Document failure in restore-drill-log.md
2. Open incident ticket
3. Review and update backup procedures
4. Re-run drill within 7 days

---

## Monitoring and alerting

### Backup monitoring

**Prometheus metrics:**

```yaml
# Backup success/failure tracking
backup_last_success_timestamp_seconds{job="postgresql"}

# Backup file size (detect truncated backups)
backup_size_bytes{job="postgresql"}

# Backup duration
backup_duration_seconds{job="postgresql"}
```

**Alerting rules:**

```yaml
# Alert if backup hasn't run in 26 hours (daily backup missed)
- alert: BackupMissing
  expr: time() - backup_last_success_timestamp_seconds{job="postgresql"} > 93600
  for: 1h
  annotations:
    summary: "PostgreSQL backup has not run in 26 hours"
    
# Alert if backup file is suspiciously small (< 1MB)
- alert: BackupTruncated
  expr: backup_size_bytes{job="postgresql"} < 1048576
  annotations:
    summary: "PostgreSQL backup file is unusually small (< 1MB)"
```

### Restore monitoring

**Manual verification after each restore:**

```bash
# Run integrity checks
psql -h <host> -U binday -d binday << EOF
-- Check all tables have data
SELECT 
  schemaname, 
  tablename, 
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = tablename) AS columns
FROM pg_tables 
WHERE schemaname = 'public';

-- Check for recent data
SELECT 
  'properties' AS table_name, 
  COUNT(*) AS row_count, 
  MAX(updated_at) AS latest_update 
FROM properties
UNION ALL
SELECT 
  'collections' AS table_name, 
  COUNT(*) AS row_count, 
  MAX(updated_at) AS latest_update 
FROM collections;
EOF
```

---

## Retention policies

### Daily backups
- **Retention:** 30 days rolling
- **Storage tier:** Hot (fast restore)
- **Geo-redundancy:** RA-GRS (read-access geo-redundant)

### Monthly snapshots
- **Retention:** 12 months
- **Storage tier:** Cool (cost-effective)
- **Geo-redundancy:** GRS (geo-redundant)

### Manual backups
- **Retention:** Until manually deleted (tag: `manual-backup`)
- **Storage tier:** Hot
- **Geo-redundancy:** RA-GRS

### Evidence blobs
- **Retention:** 7 days auto-purge (lifecycle policy)
- **Storage tier:** Hot
- **Geo-redundancy:** LRS (locally redundant)

---

## Disaster recovery integration

This runbook integrates with the [Disaster Recovery Runbook](disaster-recovery.md):

- **PostgreSQL failure:** Use point-in-time restore (30min RTO)
- **Complete environment loss:** Use daily backup + Terraform rebuild (45min RTO)
- **Accidental deletion:** Use selective table restore (15min RTO)

---

## Appendix: Backup checklist

**Weekly verification:**
- [ ] Last 7 daily backups exist in Azure Storage
- [ ] Backup file sizes are consistent (no truncation)
- [ ] Backup monitoring alerts are firing correctly

**Monthly verification:**
- [ ] Monthly snapshot created and tagged
- [ ] Old daily backups pruned (>30 days deleted)
- [ ] Backup storage costs reviewed

**Quarterly verification:**
- [ ] Restore drill completed successfully
- [ ] RTO/RPO documented and within targets
- [ ] Backup procedures updated if needed
