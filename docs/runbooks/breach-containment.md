# Breach Containment Guide — Hampshire Bin Platform

**Version:** 1.0  
**Owner:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Classification:** Restricted  

---

## Purpose

This guide provides step-by-step procedures for containing a data breach, preserving evidence, and initiating recovery. Use this in conjunction with the Security Incident Response Playbook.

---

## Breach Scope Identification

### Step 1: Determine What Data May Have Been Exposed

**Review Audit Logs:**
```sql
-- Connect to production database (read-only replica preferred)
psql $DATABASE_URL_READ_REPLICA

-- Check for unusual data access patterns
SELECT 
  event_type,
  actor_type,
  COUNT(*) as event_count,
  MIN(timestamp) as first_seen,
  MAX(timestamp) as last_seen
FROM audit_log
WHERE timestamp > NOW() - INTERVAL '7 days'
GROUP BY event_type, actor_type
HAVING COUNT(*) > 1000
ORDER BY event_count DESC;
```

**Review Security Events:**
```sql
-- Check for critical security events
SELECT *
FROM security_events
WHERE severity = 'critical'
AND created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### Step 2: Classify Data at Risk

**Data Classification Matrix** (from `docs/threat-model/data-classification.md`):

| Data Type | Classification | Retention | Exposure Risk |
|---|---|---|---|
| API keys (client keys) | Sensitive | Until revoked | High - full platform access |
| Internal service credentials | Restricted | Permanent (rotated) | Critical - infrastructure compromise |
| Database credentials | Restricted | Permanent (rotated) | Critical - data exfiltration |
| Property UPRNs | Sensitive | 365 days | Medium - property enumeration |
| Address data | Sensitive | 90 days | Medium - PII exposure |
| Collection schedules | Public | 365 days | Low - public information |
| Raw HTML evidence | Internal | 90 days | Medium - may contain PII |
| Audit logs | Internal | 730 days | Medium - operational intelligence |

### Step 3: Estimate Breach Window

**Determine When Unauthorized Access Began:**
```sql
-- Find earliest suspicious activity
SELECT MIN(timestamp) as breach_start
FROM audit_log
WHERE (
  actor_id = '<compromised-api-key-id>'
  OR actor_ip IN (SELECT DISTINCT ip FROM blocked_ips WHERE reason = 'breach')
);

-- Find when access ended (kill switch activation, key revocation)
SELECT MAX(timestamp) as breach_end
FROM audit_log
WHERE event_type IN ('adapter.disabled', 'admin.api_key.revoke');
```

### Step 4: Count Affected Records

**Estimate Number of Records Accessed:**
```sql
-- For API key compromise: Count API requests
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  COUNT(*) as requests
FROM audit_log
WHERE actor_id = '<compromised-api-key-id>'
AND timestamp BETWEEN '<breach_start>' AND '<breach_end>'
GROUP BY hour
ORDER BY hour;

-- For database compromise: Check table row counts
SELECT 
  'addresses' as table_name, COUNT(*) as row_count FROM addresses
UNION ALL
SELECT 'collections', COUNT(*) FROM collections
UNION ALL
SELECT 'uprns', COUNT(*) FROM uprns;
```

---

## Evidence Preservation

### Step 1: Snapshot All Logs

**Before any remediation actions, preserve evidence:**

```bash
#!/bin/bash
# evidence-preservation.sh

INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"
EVIDENCE_DIR="/tmp/incident-evidence-$INCIDENT_ID"

mkdir -p "$EVIDENCE_DIR"

# 1. Export audit logs (last 7 days)
psql $DATABASE_URL -c "
  COPY (
    SELECT * FROM audit_log 
    WHERE timestamp > NOW() - INTERVAL '7 days'
    ORDER BY timestamp ASC
  ) TO STDOUT CSV HEADER
" > "$EVIDENCE_DIR/audit_log.csv"

# 2. Export security events
psql $DATABASE_URL -c "
  COPY (
    SELECT * FROM security_events 
    WHERE created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at ASC
  ) TO STDOUT CSV HEADER
" > "$EVIDENCE_DIR/security_events.csv"

# 3. Export API service logs
kubectl logs deployment/api-service --since=7d --all-containers=true \
  > "$EVIDENCE_DIR/api-service-logs.txt"

# 4. Export adapter worker logs
kubectl logs deployment/adapter-worker --since=7d --all-containers=true \
  > "$EVIDENCE_DIR/adapter-worker-logs.txt"

# 5. Export infrastructure logs (if available)
# az monitor activity-log list --start-time $(date -u -d '7 days ago' '+%Y-%m-%dT%H:%M:%SZ') \
#   --output json > "$EVIDENCE_DIR/azure-activity-log.json"

# 6. Create evidence manifest
cat > "$EVIDENCE_DIR/MANIFEST.md" << EOF
# Incident Evidence Manifest

**Incident ID:** $INCIDENT_ID
**Collected:** $(date -u '+%Y-%m-%d %H:%M:%S UTC')
**Collected By:** $(whoami)

## Files

- audit_log.csv: Platform audit trail (7 days)
- security_events.csv: Security event log (7 days)
- api-service-logs.txt: API service stdout/stderr (7 days)
- adapter-worker-logs.txt: Adapter worker stdout/stderr (7 days)

## Checksums

$(sha256sum "$EVIDENCE_DIR"/*.{csv,txt,json} 2>/dev/null)

## Chain of Custody

- Collected: $(date -u '+%Y-%m-%d %H:%M:%S UTC') by $(whoami)
- Stored: $EVIDENCE_DIR
- Transferred to: [TO BE FILLED BY INCIDENT COMMANDER]
EOF

# 7. Create immutable archive
tar -czf "/tmp/incident-evidence-$INCIDENT_ID.tar.gz" -C /tmp "incident-evidence-$INCIDENT_ID"

# 8. Upload to immutable storage (WORM)
az storage blob upload \
  --account-name $INCIDENT_STORAGE_ACCOUNT \
  --container incident-evidence \
  --file "/tmp/incident-evidence-$INCIDENT_ID.tar.gz" \
  --name "$INCIDENT_ID.tar.gz" \
  --immutability-policy Locked \
  --immutability-period-in-days 2555  # 7 years

echo "Evidence preserved: /tmp/incident-evidence-$INCIDENT_ID.tar.gz"
echo "Uploaded to immutable storage: $INCIDENT_ID.tar.gz"
```

### Step 2: Preserve Database State

**Create database snapshot:**
```bash
# PostgreSQL: Create point-in-time backup
az postgres flexible-server backup create \
  --resource-group $RESOURCE_GROUP \
  --name $DB_SERVER_NAME \
  --backup-name "incident-$INCIDENT_ID-$(date +%Y%m%d)"

# Verify backup
az postgres flexible-server backup show \
  --resource-group $RESOURCE_GROUP \
  --server-name $DB_SERVER_NAME \
  --name "incident-$INCIDENT_ID-$(date +%Y%m%d)"
```

### Step 3: Preserve Evidence Storage

**Snapshot blob storage:**
```bash
# Create blob container snapshot
az storage container snapshot \
  --account-name $STORAGE_ACCOUNT \
  --name evidence \
  --metadata incident_id="$INCIDENT_ID" created="$(date -u)"

# List snapshots
az storage blob list \
  --account-name $STORAGE_ACCOUNT \
  --container evidence \
  --include s \
  --query "[?snapshot!=null]"
```

---

## Credential Revocation and Rotation

### Step 1: Revoke All API Keys

**Immediate revocation:**
```sql
-- Revoke all active API keys
UPDATE api_keys 
SET 
  enabled = false,
  revoked_at = NOW(),
  revoked_by = 'security-incident-$INCIDENT_ID',
  revoked_reason = 'Data breach - all keys revoked as precaution'
WHERE enabled = true;

-- Verify
SELECT COUNT(*) FROM api_keys WHERE enabled = true;
-- Expected: 0
```

**Track revoked keys:**
```sql
-- Create revocation record for audit
INSERT INTO api_key_revocations (incident_id, revoked_count, revoked_at)
SELECT 
  '$INCIDENT_ID',
  COUNT(*),
  NOW()
FROM api_keys
WHERE revoked_at = NOW();
```

### Step 2: Rotate Database Credentials

**Generate new password and update Key Vault:**
```bash
# Generate new database password (32 char, alphanumeric + special)
NEW_DB_PASSWORD=$(openssl rand -base64 32 | tr -d '=/+' | cut -c1-32)

# Update Azure Key Vault
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name DATABASE-PASSWORD \
  --value "$NEW_DB_PASSWORD" \
  --tags incident_id="$INCIDENT_ID" rotated="$(date -u)"

# Update database user password
psql $DATABASE_URL -c "ALTER USER binday_app WITH PASSWORD '$NEW_DB_PASSWORD';"

# Test new password
PGPASSWORD="$NEW_DB_PASSWORD" psql -h $DB_HOST -U binday_app -d binday -c "SELECT 1;"

# Clear password from memory
unset NEW_DB_PASSWORD
```

### Step 3: Rotate Redis Credentials

```bash
# Generate new Redis password
NEW_REDIS_PASSWORD=$(openssl rand -base64 32)

# Update Key Vault
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name REDIS-PASSWORD \
  --value "$NEW_REDIS_PASSWORD"

# Update Redis instance
az redis update \
  --name $REDIS_NAME \
  --resource-group $RESOURCE_GROUP \
  --redis-configuration authKey="$NEW_REDIS_PASSWORD"

unset NEW_REDIS_PASSWORD
```

### Step 4: Rotate Audit HMAC Secret

```bash
# Generate new HMAC secret
NEW_HMAC_SECRET=$(openssl rand -hex 32)

# Update Key Vault
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name AUDIT-HMAC-SECRET \
  --value "$NEW_HMAC_SECRET" \
  --tags incident_id="$INCIDENT_ID" note="Pre-breach signatures invalid after rotation"

# Note: Old HMAC secret must be retained for validating pre-rotation audit logs
az keyvault secret set \
  --vault-name $VAULT_NAME \
  --name AUDIT-HMAC-SECRET-PRE-$INCIDENT_ID \
  --value "$OLD_HMAC_SECRET"

unset NEW_HMAC_SECRET OLD_HMAC_SECRET
```

### Step 5: Rotate All Service Secrets

**Checklist:**
- [ ] Database password
- [ ] Redis password
- [ ] Audit HMAC secret
- [ ] Address hash pepper
- [ ] JWT signing key (when implemented)
- [ ] Azure Storage connection strings (if using)
- [ ] Any third-party API keys

---

## Communication

### Step 1: Internal Notification

**Template:**
```
TO: all-engineering@company.com
SUBJECT: URGENT: Data Breach - All Hands Response

A data breach has been confirmed on the Hampshire Bin Platform.

IMMEDIATE ACTIONS REQUIRED:
- Do NOT deploy any code changes without incident commander approval
- Do NOT access production databases without logging access
- Do report any suspicious activity immediately

INCIDENT STATUS:
- Platform: OFFLINE (kill switches activated)
- API Keys: REVOKED (all users will need new keys)
- Credentials: ROTATED (all service secrets changed)
- Data at Risk: [DESCRIBE]

INCIDENT COMMANDER: [NAME]
INCIDENT CHANNEL: #incident-$INCIDENT_ID
INCIDENT CALL: [BRIDGE LINK]

Next update in 1 hour.
```

### Step 2: Customer Notification Template

**For API customers:**
```
Subject: Security Incident - Action Required

Dear [Customer Name],

We are writing to inform you of a security incident affecting the Hampshire Bin Platform.

WHAT HAPPENED:
On [DATE], we detected unauthorized access to our platform. We immediately took the platform offline and initiated our incident response procedures.

WHAT DATA WAS AFFECTED:
Based on our investigation, the following data types may have been accessed:
- Bin collection schedules for [COUNCILS]
- Property addresses in [POSTCODES]
- [OTHER DATA TYPES]

ACTIONS WE HAVE TAKEN:
✓ Platform taken offline immediately
✓ All API keys revoked
✓ All system credentials rotated
✓ Forensic investigation initiated
✓ Incident reported to relevant authorities

ACTIONS YOU MUST TAKE:
1. Generate a new API key (instructions below)
2. Review your application logs for suspicious activity
3. Monitor your systems for any unusual behavior
4. Update your systems with the new API key

HOW TO GET A NEW API KEY:
[Instructions]

TIMELINE:
- Incident detected: [DATE TIME UTC]
- Platform secured: [DATE TIME UTC]
- Expected restoration: [DATE TIME UTC]

We sincerely apologize for this incident. If you have questions, contact security@company.com.

[Signature]
```

### Step 3: Regulatory Notification (GDPR)

**If personal data exposed:**
```
NOTIFICATION TO: [DATA PROTECTION AUTHORITY]

Subject: Data Breach Notification (GDPR Article 33)

1. CONTROLLER DETAILS
   - Name: [Company Name]
   - Contact: [DPO Email/Phone]
   - Registration: [ICO Registration Number]

2. BREACH DESCRIPTION
   - Nature: Unauthorized access to bin collection platform
   - Date Detected: [DATE]
   - Date Occurred (estimated): [DATE]

3. CATEGORIES AND NUMBERS OF DATA SUBJECTS
   - Affected individuals: [NUMBER] (estimated)
   - Data subjects: UK residents using bin collection service

4. CATEGORIES AND NUMBERS OF RECORDS
   - Property addresses: [NUMBER]
   - Bin collection schedules: [NUMBER]
   - UPRNs: [NUMBER]

5. LIKELY CONSEQUENCES
   - Privacy risk: Medium (addresses are semi-public)
   - Identity theft risk: Low (no financial data exposed)
   - Physical security risk: Low (bin collection schedules)

6. MEASURES TAKEN
   - Platform secured immediately
   - Credentials rotated
   - External forensics engaged
   - Customers notified

7. CONTACT POINT
   - DPO: [Name, Email, Phone]
```

---

## Post-Breach Review Checklist

**30 Days After Incident:**

- [ ] **Forensic Report Completed**
  - Root cause identified
  - Attack timeline documented
  - Data exposure quantified
  - Attacker identified (if possible)

- [ ] **All Secrets Rotated**
  - Database credentials
  - Redis credentials
  - API keys (new keys issued to customers)
  - HMAC secrets
  - Service account keys

- [ ] **System Integrity Verified**
  - Container images scanned (no malware)
  - Database integrity checked (no unauthorized changes)
  - Evidence storage validated (content hashes match)
  - Audit log signatures verified (pre-rotation logs)

- [ ] **Controls Enhanced**
  - Vulnerability patched
  - Detection gaps addressed
  - New controls implemented
  - Runbooks updated

- [ ] **Compliance Requirements Met**
  - Regulatory notifications filed (if required)
  - Customer notifications sent
  - Breach register updated
  - Legal review completed

- [ ] **Lessons Learned Documented**
  - Post-incident review completed
  - Action items assigned
  - Runbooks updated
  - Team trained on new procedures

---

## Sign-Off

**Breach Containment Procedures:** DOCUMENTED  
**Requires:** Incident response training + drill before production  

**Security Engineer:** Amos  
**Date:** 2026-03-25  

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial breach containment guide |
