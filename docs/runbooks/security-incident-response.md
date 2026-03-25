# Security Incident Response Playbook — Hampshire Bin Platform

**Version:** 1.0  
**Owner:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Classification:** Restricted  
**Distribution:** Internal team only  

---

## Quick Reference

**Emergency Contacts:**
- Security Engineer (Amos): [ON-CALL-NUMBER]
- Platform Lead (Holden): [ON-CALL-NUMBER]
- Infrastructure Lead (Drummer): [ON-CALL-NUMBER]
- Incident Commander: Rotate weekly

**Critical Actions:**
- **P0 Incident:** Activate within 15 minutes
- **Kill Switches:** `ADAPTER_KILL_SWITCH_{COUNCIL}=true`
- **API Shutdown:** Stop API service immediately
- **Isolate:** Disconnect compromised components from network

---

## Severity Classification

| Severity | Criteria | Response Time | Escalation |
|---|---|---|---|
| **P0 — Critical** | Data breach, active exploitation, credential compromise, total platform outage | **15 minutes** | CEO, Legal, All hands |
| **P1 — High** | Suspected compromise, abuse at scale, auth bypass, partial outage | **1 hour** | CTO, Engineering leads |
| **P2 — Medium** | Anomalous patterns, failed attack attempts, degraded performance | **4 hours** | Engineering team |
| **P3 — Low** | Policy violations, config drift, minor security findings | **Next business day** | Security team |

---

## P0: Data Breach / Active Exploitation

### Detection Signals

- Alert: "SECURITY_INJECTION_ATTEMPT rate > 100/min"
- Alert: "Unauthorized database access detected"
- Alert: "Evidence storage bucket accessed from unknown IP"
- Alert: "Multiple adapter failures simultaneously"
- Notification from external security researcher
- Regulatory notification requirement triggered

### Immediate Actions (Within 15 Minutes)

1. **ACTIVATE KILL SWITCHES**
   ```bash
   # Set all adapter kill switches
   export ADAPTER_KILL_SWITCH_EASTLEIGH=true
   export ADAPTER_KILL_SWITCH_RUSHMOOR=true
   export ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE=true
   export ADAPTER_KILL_SWITCH_EAST_HAMPSHIRE=true
   export ADAPTER_KILL_SWITCH_FAREHAM=true
   export ADAPTER_KILL_SWITCH_GOSPORT=true
   export ADAPTER_KILL_SWITCH_HART=true
   export ADAPTER_KILL_SWITCH_HAVANT=true
   export ADAPTER_KILL_SWITCH_NEW_FOREST=true
   export ADAPTER_KILL_SWITCH_PORTSMOUTH=true
   export ADAPTER_KILL_SWITCH_SOUTHAMPTON=true
   export ADAPTER_KILL_SWITCH_TEST_VALLEY=true
   export ADAPTER_KILL_SWITCH_WINCHESTER=true

   # Restart API service to load new config
   kubectl rollout restart deployment/api-service
   ```

2. **ISOLATE COMPROMISED SERVICES**
   ```bash
   # Block all ingress traffic except from internal monitoring
   kubectl annotate service api-service "maintenance-mode=true"
   
   # OR fully isolate
   kubectl scale deployment/api-service --replicas=0
   ```

3. **REVOKE ALL API KEYS**
   ```sql
   -- Connect to database
   psql $DATABASE_URL

   -- Disable all API keys
   UPDATE api_keys SET enabled = false, revoked_at = NOW(), revoked_reason = 'P0 incident - all keys revoked';

   -- Verify
   SELECT COUNT(*) FROM api_keys WHERE enabled = true;
   -- Expected: 0
   ```

4. **PRESERVE EVIDENCE**
   ```bash
   # Snapshot audit logs
   kubectl logs deployment/api-service --since=24h > incident-$(date +%Y%m%d-%H%M%S)-api-logs.txt

   # Export security events
   psql $DATABASE_URL -c "COPY (SELECT * FROM security_events WHERE created_at > NOW() - INTERVAL '24 hours') TO STDOUT CSV HEADER" > incident-security-events.csv

   # Copy to immutable storage
   az storage blob upload --container incident-evidence --file incident-*.txt --account-name $STORAGE_ACCOUNT
   ```

5. **NOTIFY STAKEHOLDERS**
   ```
   TO: ceo@company.com, legal@company.com, cto@company.com
   SUBJECT: P0 SECURITY INCIDENT - Hampshire Bin Platform
   
   A P0 security incident has been detected on the Hampshire Bin Platform.
   
   Status: ACTIVE
   Impact: [DATA BREACH / EXPLOITATION / OUTAGE]
   Services: Platform in emergency maintenance mode (all kill switches activated)
   Customer Impact: API unavailable
   Data at Risk: [Describe: API keys / addresses / council data]
   
   Actions Taken:
   - All adapters disabled via kill switches
   - All API keys revoked
   - Services isolated from network
   - Evidence preserved
   
   Next Steps:
   - Incident investigation in progress
   - External forensics team engaged (if applicable)
   - Update in 1 hour
   
   Incident Commander: [NAME]
   Incident ID: INC-$(date +%Y%m%d-%H%M%S)
   ```

### Investigation (First Hour)

6. **IDENTIFY SCOPE**
   ```sql
   -- Check for suspicious API key usage
   SELECT * FROM security_events 
   WHERE event_type = 'auth.success' 
   AND created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;

   -- Check for data exfiltration
   SELECT api_key_id, COUNT(*) as request_count
   FROM audit_log
   WHERE created_at > NOW() - INTERVAL '24 hours'
   AND action LIKE '%collection%'
   GROUP BY api_key_id
   ORDER BY request_count DESC
   LIMIT 100;

   -- Check for unauthorized evidence access
   SELECT * FROM audit_log
   WHERE resource_type = 'evidence'
   AND created_at > NOW() - INTERVAL '24 hours'
   ORDER BY created_at DESC;
   ```

7. **IDENTIFY ATTACK VECTOR**
   - Review injection detection logs
   - Check for successful auth bypass
   - Review adapter health check failures
   - Check for unusual traffic patterns
   - Review recent deployments (supply chain?)

8. **ASSESS DATA EXPOSURE**
   - What data types were accessed?
   - How many records potentially compromised?
   - Were addresses/UPRNs exposed?
   - Were API keys compromised?
   - Was evidence storage accessed?

### Containment (First 4 Hours)

9. **PATCH VULNERABILITY**
   - If code vulnerability: Deploy emergency patch
   - If misconfiguration: Fix and redeploy
   - If compromised dependency: Downgrade or replace
   - If insider threat: Revoke access immediately

10. **ROTATE ALL SECRETS**
    ```bash
    # Database password
    az keyvault secret set --vault-name $VAULT_NAME --name DATABASE-PASSWORD --value $(openssl rand -base64 32)

    # Redis password
    az keyvault secret set --vault-name $VAULT_NAME --name REDIS-PASSWORD --value $(openssl rand -base64 32)

    # HMAC secret
    az keyvault secret set --vault-name $VAULT_NAME --name AUDIT-HMAC-SECRET --value $(openssl rand -base64 32)

    # Restart services to load new secrets
    kubectl rollout restart deployment/api-service
    kubectl rollout restart deployment/adapter-worker
    ```

11. **REBUILD FROM CLEAN IMAGES**
    ```bash
    # Pull known-good image from registry
    docker pull hampshire-bins/api-service:$LAST_KNOWN_GOOD_TAG

    # Redeploy with clean image
    kubectl set image deployment/api-service api-service=hampshire-bins/api-service:$LAST_KNOWN_GOOD_TAG
    ```

### Recovery (First 24 Hours)

12. **VALIDATE SYSTEM INTEGRITY**
    - Scan all containers for malware (Trivy, Snyk)
    - Verify database integrity (no unauthorized changes)
    - Verify evidence storage integrity (content hashes match)
    - Check audit log HMAC signatures (no tampering)

13. **GRADUAL SERVICE RESTORATION**
    ```bash
    # Re-enable one adapter for testing
    export ADAPTER_KILL_SWITCH_EASTLEIGH=false
    kubectl rollout restart deployment/api-service

    # Monitor for 1 hour
    kubectl logs -f deployment/api-service | grep SECURITY

    # If stable, re-enable next adapter
    export ADAPTER_KILL_SWITCH_RUSHMOOR=false
    # ... repeat
    ```

14. **GENERATE NEW API KEYS**
    ```sql
    -- For each customer, generate new API key
    -- Send via secure channel (not email)
    -- Set expiry for old keys (7-day grace period)
    ```

### Post-Incident (First Week)

15. **FORENSIC REPORT**
    - Timeline of events
    - Root cause analysis
    - Data exposure assessment
    - Regulatory notification requirements
    - Customer communication plan

16. **REGULATORY NOTIFICATIONS**
    - GDPR breach notification (72 hours if PII exposed)
    - Customer notifications (if required)
    - Law enforcement (if criminal activity)

17. **POST-INCIDENT REVIEW**
    - What went well?
    - What could be improved?
    - Detection gaps?
    - Response time acceptable?
    - Update runbooks

---

## P1: Suspected Compromise / Abuse at Scale

### Detection Signals

- Alert: "Enumeration hard block >100/hour"
- Alert: "Failed auth attempts >500/hour from single IP"
- Alert: "Adapter blocked 3+ times in 1 hour"
- Alert: "Upstream council error rate >50%"
- Manual report of suspicious activity

### Immediate Actions (Within 1 Hour)

1. **IDENTIFY AFFECTED COMPONENT**
   ```bash
   # Check security events dashboard
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.internal/v1/admin/security/events/critical?hours=1

   # Check incidents
   curl -H "Authorization: Bearer $ADMIN_TOKEN" \
     https://api.internal/v1/admin/incidents?status=open
   ```

2. **BLOCK ATTACKER IP (IF SINGLE SOURCE)**
   ```bash
   # Add to IP blocklist
   kubectl exec -it deployment/api-service -- redis-cli SADD blocklist:ip 192.168.1.0

   # Verify
   kubectl exec -it deployment/api-service -- redis-cli SISMEMBER blocklist:ip 192.168.1.0
   ```

3. **DISABLE COMPROMISED API KEY (IF IDENTIFIED)**
   ```sql
   UPDATE api_keys 
   SET enabled = false, disabled_reason = 'P1 incident - suspected abuse'
   WHERE id = '<api-key-id>';
   ```

4. **ACTIVATE AFFECTED ADAPTER KILL SWITCH**
   ```bash
   # If specific council adapter under attack
   export ADAPTER_KILL_SWITCH_EASTLEIGH=true
   kubectl rollout restart deployment/api-service
   ```

5. **NOTIFY INCIDENT COMMANDER**
   ```
   TO: incident-commander@company.com
   SUBJECT: P1 INCIDENT - Suspected Abuse
   
   P1 incident detected: [DESCRIPTION]
   
   Affected Component: [Adapter / API / Database]
   Attack Type: [Enumeration / Credential Stuffing / DoS]
   Attack Source: [IP / API Key / Unknown]
   
   Immediate Actions Taken:
   - [List actions]
   
   Monitoring: Active
   Next Update: 2 hours
   ```

### Investigation (First 4 Hours)

6. **ANALYZE ATTACK PATTERN**
   ```sql
   -- For enumeration attacks
   SELECT actor_ip, COUNT(DISTINCT metadata->>'postcode') as unique_postcodes
   FROM audit_log
   WHERE created_at > NOW() - INTERVAL '1 hour'
   AND action = 'abuse.enumeration'
   GROUP BY actor_ip
   ORDER BY unique_postcodes DESC;

   -- For credential stuffing
   SELECT actor_ip, COUNT(*) as failed_attempts
   FROM audit_log
   WHERE created_at > NOW() - INTERVAL '1 hour'
   AND event_type = 'auth.failure'
   GROUP BY actor_ip
   HAVING COUNT(*) > 50;
   ```

7. **ASSESS IMPACT**
   - How much data was accessed?
   - Was upstream council impacted?
   - Were rate limits effective?
   - Did attacker succeed?

8. **IDENTIFY GAPS**
   - What detection failed?
   - What controls were bypassed?
   - How can we prevent recurrence?

### Remediation (First 24 Hours)

9. **IMPLEMENT ADDITIONAL CONTROLS**
   - Lower rate limit thresholds temporarily
   - Add IP blocklist entries
   - Require CAPTCHA for suspicious IPs
   - Increase enumeration detection sensitivity

10. **COMMUNICATE WITH AFFECTED PARTIES**
    - If council site impacted: Apologize, explain, mitigate
    - If customer abused platform: Notify, revoke access
    - If external attacker: No communication (don't tip off)

---

## P2: Anomalous Patterns / Failed Attacks

### Detection Signals

- Alert: "Injection detection blocks >50/hour"
- Alert: "Bot detection blocks >100/hour"
- Alert: "Unusual traffic pattern detected"
- Manual security review finding

### Actions (Within 4 Hours)

1. **REVIEW LOGS**
2. **DOCUMENT FINDINGS**
3. **ADJUST DETECTION THRESHOLDS IF NEEDED**
4. **MONITOR FOR ESCALATION**
5. **SCHEDULE REVIEW IN NEXT SECURITY MEETING**

---

## Communication Templates

### P0 Customer Communication

```
Subject: Security Incident Notification - Action Required

Dear [Customer],

We are writing to inform you of a security incident affecting the Hampshire Bin Platform.

INCIDENT SUMMARY:
On [DATE] at [TIME], we detected [DESCRIPTION OF INCIDENT]. We immediately activated our incident response procedures and took the platform offline to prevent further unauthorized access.

DATA POTENTIALLY AFFECTED:
[List data types: API keys, bin collection schedules, property addresses, etc.]

ACTIONS WE HAVE TAKEN:
- Platform taken offline immediately
- All API keys revoked
- Forensic investigation initiated
- External security experts engaged
- Law enforcement notified (if applicable)

ACTIONS YOU SHOULD TAKE:
1. Generate a new API key when the platform is restored
2. Review your application logs for any suspicious activity
3. Monitor for any unusual activity related to bin collection data
4. Contact us immediately if you notice anything suspicious

TIMELINE:
- Incident detected: [DATE TIME]
- Platform secured: [DATE TIME]
- Investigation ongoing: [ESTIMATED COMPLETION]
- Expected restoration: [DATE]

CONTACT:
If you have questions, please contact our security team at security@company.com or [PHONE].

We sincerely apologize for this incident and any inconvenience caused.

[NAME]
Security Engineer
Hampshire Bin Platform
```

---

## Post-Incident Review Template

```markdown
# Incident Post-Mortem: [INCIDENT ID]

**Date:** [DATE]
**Severity:** P0 / P1 / P2
**Duration:** [DETECTION TO RESOLUTION]
**Incident Commander:** [NAME]

## Timeline

| Time | Event |
|---|---|
| HH:MM | Incident detected |
| HH:MM | Kill switches activated |
| HH:MM | Investigation began |
| HH:MM | Root cause identified |
| HH:MM | Patch deployed |
| HH:MM | Service restored |
| HH:MM | Incident closed |

## Root Cause

[Detailed description of what went wrong and why]

## Impact

- **Data Exposure:** [Yes/No - what data]
- **Service Downtime:** [Duration]
- **Customers Affected:** [Number]
- **Financial Impact:** [Estimate if known]

## What Went Well

- Detection time: [X minutes]
- Response time: [X minutes]
- Kill switches effective: [Yes/No]

## What Could Be Improved

- Detection gap: [Description]
- Response delay: [Description]
- Communication: [Description]

## Action Items

| Action | Owner | Due Date | Status |
|---|---|---|---|
| [Fix X] | [Name] | [Date] | Open |
| [Improve Y] | [Name] | [Date] | Open |

## Lessons Learned

[Key takeaways for future incidents]
```

---

## Sign-Off

**Incident Response Readiness:** DOCUMENTED  
**Requires:** SIEM integration + on-call rotation before production  

**Security Engineer:** Amos  
**Date:** 2026-03-25  

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial incident response playbook |
