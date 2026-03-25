# Incident Response Triggers — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

This document defines what constitutes a security incident for the Hampshire Bin Collection Data Platform and specifies the required response actions for each trigger condition.

**Incident Classification:**
- **P1 (Critical):** Active compromise, data breach, service unavailable
- **P2 (High):** Security vulnerability exploited, credential compromise suspected
- **P3 (Medium):** Anomalous behaviour, potential attack in progress
- **P4 (Low):** Security event requiring investigation, no immediate impact

---

## Incident Triggers

### IR-01: API Key Compromise

**Trigger Condition:**
- API key used from anomalous location (geography/IP)
- API key used at unusual times (outside normal pattern)
- Same API key used concurrently from multiple geographies
- API key reported compromised by customer
- API key found in public repository/paste site

**Severity:** P2 (High)

**Immediate Actions:**
1. Revoke compromised API key immediately
2. Notify key owner via registered contact
3. Review recent activity from compromised key
4. Check for data exfiltration patterns
5. Issue replacement key to legitimate owner

**Notification Requirement:**
- Security team: immediate (automated alert)
- Platform operator: immediate
- Customer: within 1 hour

**Kill Switch Actions:**
- N/A (key revocation is sufficient)

---

### IR-02: Database Credential Breach

**Trigger Condition:**
- Database connection from unexpected source IP
- Failed authentication attempts from multiple sources
- Unusual query patterns (bulk export, schema queries)
- Credential found in logs or external source
- Database audit shows unauthorized access

**Severity:** P1 (Critical)

**Immediate Actions:**
1. Rotate database credentials immediately
2. Terminate all existing database connections
3. Review database audit logs for unauthorized access
4. Check for data exfiltration
5. Restart services with new credentials
6. Assess data exposure scope

**Notification Requirement:**
- Security team: immediate
- Engineering lead: immediate
- Management: within 1 hour
- Legal (if data breach): within 4 hours

**Kill Switch Actions:**
- Disable all database access if exfiltration ongoing
- Consider read-only mode while investigating

---

### IR-03: Redis Credential Breach

**Trigger Condition:**
- Redis connection from unexpected source
- KEYS or DEBUG commands executed
- Unusual memory patterns
- Credential found in logs

**Severity:** P2 (High)

**Immediate Actions:**
1. Rotate Redis access key immediately
2. Review Redis command logs
3. Clear cache (flush if potentially poisoned)
4. Restart services with new credentials
5. Assess if cache poisoning occurred

**Notification Requirement:**
- Security team: immediate
- Platform operator: immediate

**Kill Switch Actions:**
- Temporarily disable Redis (fall back to no-cache)

---

### IR-04: Unusual Upstream Response

**Trigger Condition:**
- Council website returns unexpected content type
- Response contains script tags or suspicious patterns
- Redirect to non-council domain
- SSL certificate changed unexpectedly
- Page structure dramatically different

**Severity:** P3 (Medium)

**Immediate Actions:**
1. Kill switch for affected adapter (immediate)
2. Review captured evidence
3. Validate SSL certificate
4. Check if council site was compromised
5. Do not process suspicious content

**Notification Requirement:**
- Security team: within 15 minutes
- Adapter owner (Naomi): immediate
- Council contact (if compromised): after verification

**Kill Switch Actions:**
- Disable specific adapter immediately
- Do not re-enable until manual review

---

### IR-05: Excessive Error Rate

**Trigger Condition:**
- 5xx error rate exceeds 10% for 5+ minutes
- Database connection errors spike
- Authentication failures exceed threshold
- Adapter failure rate exceeds 50%

**Severity:** P2 (High) or P3 (Medium) depending on cause

**Immediate Actions:**
1. Check system health (database, Redis, services)
2. Review recent deployments
3. Check for attack patterns in logs
4. Scale resources if legitimate load
5. Enable enhanced logging

**Notification Requirement:**
- Platform operator: immediate (automated alert)
- Security team: if attack suspected
- Engineering: if system issue

**Kill Switch Actions:**
- Rate limit more aggressively
- Disable non-essential features
- Enable maintenance mode if needed

---

### IR-06: Anomalous Traffic Patterns

**Trigger Condition:**
- Traffic spike >3x normal baseline
- Geographic anomaly (traffic from unusual regions)
- Enumeration pattern detected (sequential postcodes)
- Single IP exceeds rate limits repeatedly
- Distributed attack pattern (many IPs, same pattern)

**Severity:** P3 (Medium)

**Immediate Actions:**
1. Enable enhanced WAF rules
2. Increase rate limiting
3. Review traffic patterns
4. Block offending IPs/ranges
5. Enable CAPTCHA on affected endpoints

**Notification Requirement:**
- Security team: within 15 minutes
- Platform operator: immediate (automated)

**Kill Switch Actions:**
- Enable geo-blocking if specific region
- Tighten rate limits platform-wide
- Enable proof-of-work challenge

---

### IR-07: Dependency Vulnerability Disclosed

**Trigger Condition:**
- CVE published for dependency in use
- GitHub security advisory for dependency
- npm/pip audit finds new vulnerability
- CISA alert for dependency

**Severity:**
- P1 (Critical): Remote code execution, actively exploited
- P2 (High): High severity, not yet exploited
- P3 (Medium): Medium severity or low exploitability

**Immediate Actions:**
1. Assess exposure (is vulnerable code path used?)
2. Check for exploitation attempts in logs
3. Update dependency if patch available
4. Apply workaround if no patch
5. Expedite deployment of fix

**Notification Requirement:**
- Security team: immediate for Critical/High
- Engineering: immediate for Critical/High
- Management: for Critical only

**Kill Switch Actions:**
- Disable affected feature if actively exploited
- Consider emergency maintenance if critical

**Patching SLA:**
- Critical (actively exploited): 24 hours
- High: 7 days
- Medium: 30 days
- Low: 90 days

---

### IR-08: Data Leak Suspicion

**Trigger Condition:**
- Unusual bulk data access patterns
- Data found on external site
- Customer reports seeing their data elsewhere
- Evidence of data export operations
- Insider threat indicators

**Severity:** P1 (Critical)

**Immediate Actions:**
1. Identify scope of potential leak
2. Preserve logs and evidence
3. Restrict access to affected systems
4. Review recent access logs
5. Identify affected data subjects
6. Prepare breach notification

**Notification Requirement:**
- Security team: immediate
- Legal: immediate
- Management: immediate
- Data Protection Officer: within 4 hours
- Affected users: within 72 hours (GDPR)
- ICO: within 72 hours if personal data (GDPR)

**Kill Switch Actions:**
- Restrict API access if leak ongoing
- Disable affected data access paths
- Enable read-only mode

---

### IR-09: Adapter Misbehaviour

**Trigger Condition:**
- Adapter making unexpected outbound connections
- Adapter accessing other adapters' data
- Adapter process consuming excessive resources
- Adapter returning malformed data
- Adapter violating rate limits to council

**Severity:** P2 (High)

**Immediate Actions:**
1. Kill switch for affected adapter
2. Isolate adapter container
3. Review adapter logs
4. Check for compromise indicators
5. Review recent code changes
6. Restore from known-good state if needed

**Notification Requirement:**
- Security team: immediate
- Adapter owner (Naomi): immediate
- Platform operator: within 15 minutes

**Kill Switch Actions:**
- Disable specific adapter immediately
- Review all adapter permissions
- Do not re-enable until root cause found

---

### IR-10: Admin Account Compromise

**Trigger Condition:**
- Admin login from unusual location
- Admin login outside business hours
- Failed MFA attempts followed by success
- Admin actions not matching normal pattern
- Admin reported credentials stolen

**Severity:** P1 (Critical)

**Immediate Actions:**
1. Disable compromised admin account immediately
2. Terminate all active sessions for account
3. Review recent admin actions
4. Check for privilege escalation
5. Check for backdoor creation
6. Reset all potentially affected credentials

**Notification Requirement:**
- Security team: immediate
- All admins: immediate (potential broader compromise)
- Management: immediate
- Legal: if data affected

**Kill Switch Actions:**
- Disable all admin accounts except break-glass
- Enable dual-approval for all admin actions
- Consider maintenance mode

---

### IR-11: CI/CD Pipeline Compromise

**Trigger Condition:**
- Unauthorized commit to protected branch
- Build producing unexpected artifacts
- Deployment without approval
- Pipeline credentials accessed unexpectedly
- Malicious code in build logs

**Severity:** P1 (Critical)

**Immediate Actions:**
1. Halt all deployments immediately
2. Revoke pipeline credentials
3. Review recent deployments
4. Check for malicious code in production
5. Rollback suspicious deployments
6. Audit build artifacts

**Notification Requirement:**
- Security team: immediate
- Engineering lead: immediate
- Management: immediate
- All developers: within 1 hour

**Kill Switch Actions:**
- Disable pipeline
- Lock repository
- Manual deployment only until resolved

---

### IR-12: Browser Automation Escape

**Trigger Condition:**
- Browser process accessing files outside sandbox
- Browser making connections to non-allowed hosts
- Container escape indicators
- Unexpected processes in browser container
- Resource usage anomalies

**Severity:** P1 (Critical)

**Immediate Actions:**
1. Kill all browser containers immediately
2. Isolate affected host
3. Review container logs
4. Check for lateral movement
5. Rebuild browser infrastructure
6. Update Playwright/Chromium

**Notification Requirement:**
- Security team: immediate
- Infrastructure team: immediate
- Adapter owner (Naomi): immediate

**Kill Switch Actions:**
- Disable all browser-based adapters
- Isolate adapter subnet
- Do not re-enable until patched

---

### IR-13: Secrets Exposure in Logs

**Trigger Condition:**
- Secret pattern detected in log output
- Connection string in error message
- API key visible in request log
- Credential in stack trace

**Severity:** P2 (High)

**Immediate Actions:**
1. Identify which secret was exposed
2. Rotate exposed secret immediately
3. Purge logs containing secret (if possible)
4. Review who has log access
5. Fix code to prevent future leakage

**Notification Requirement:**
- Security team: immediate
- Developer who introduced issue: immediate

**Kill Switch Actions:**
- N/A (secret rotation is primary action)

---

### IR-14: SSRF Attempt Detected

**Trigger Condition:**
- Adapter attempted connection to internal IP
- Adapter attempted cloud metadata access
- Redirect to blocked destination detected
- DNS resolution to private IP blocked

**Severity:** P3 (Medium) — P1 if successful

**Immediate Actions:**
1. Block offending request/adapter
2. Review if any successful internal access
3. Check if council site is compromised
4. Update blocklists if needed

**Notification Requirement:**
- Security team: within 15 minutes
- Adapter owner: immediate

**Kill Switch Actions:**
- Kill adapter making suspicious requests
- Tighten egress controls

---

### IR-15: Rate Limit Bypass Detected

**Trigger Condition:**
- Single user/key exceeding quotas via multiple IPs
- Distributed enumeration pattern
- Rate limit counting anomalies
- Unprotected endpoint discovered

**Severity:** P3 (Medium)

**Immediate Actions:**
1. Identify bypass method
2. Implement additional controls
3. Block identified attackers
4. Fix any unprotected endpoints

**Notification Requirement:**
- Security team: within 30 minutes
- Platform operator: immediate

**Kill Switch Actions:**
- Enable CAPTCHA on affected endpoints
- Tighten rate limits globally

---

## Incident Response Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT DETECTED                            │
│   (Automated alert / Manual report / External notification)     │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TRIAGE (15 minutes max)                      │
│   1. Validate incident is real                                  │
│   2. Classify severity (P1-P4)                                  │
│   3. Assign incident commander                                  │
│   4. Open incident channel                                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTAIN (varies by severity)                 │
│   - Execute immediate actions from trigger                      │
│   - Activate kill switches if needed                            │
│   - Preserve evidence                                           │
│   - Limit blast radius                                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INVESTIGATE                                  │
│   - Determine root cause                                        │
│   - Assess full impact                                          │
│   - Identify affected data/users                                │
│   - Document timeline                                           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REMEDIATE                                    │
│   - Fix root cause                                              │
│   - Restore normal operations                                   │
│   - Verify fix effectiveness                                    │
│   - Re-enable disabled features                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    POST-INCIDENT                                │
│   - Complete incident report                                    │
│   - Conduct blameless retrospective                             │
│   - Update runbooks/controls                                    │
│   - Share learnings                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Escalation Matrix

| Severity | Initial Response | Escalate After | Escalate To |
|----------|------------------|----------------|-------------|
| P1 | Immediate (all hands) | 15 minutes no progress | Management + Legal |
| P2 | Within 15 minutes | 1 hour no progress | Engineering Lead |
| P3 | Within 1 hour | 4 hours no progress | Security Lead |
| P4 | Within 4 hours | Next business day | Security Review |

---

## Contact Information

| Role | Contact Method | Response Time |
|------|---------------|---------------|
| Security On-Call | PagerDuty | 15 minutes |
| Engineering On-Call | PagerDuty | 15 minutes |
| Management | Phone tree | 30 minutes |
| Legal | Email + phone | 1 hour |
| External Security Contact | security@binday.example.com | N/A (inbound) |

---

## Incident Log Template

```markdown
# Incident Report: [INCIDENT-YYYY-MM-DD-NNN]

## Summary
- **Date/Time Detected:** 
- **Date/Time Resolved:** 
- **Severity:** P1/P2/P3/P4
- **Incident Commander:** 
- **Status:** Active / Resolved / Post-mortem Complete

## Timeline
| Time | Event |
|------|-------|
| HH:MM | Incident detected |
| HH:MM | Triage complete |
| HH:MM | Containment actions |
| HH:MM | Resolution |

## Impact
- **Users Affected:** 
- **Data Affected:** 
- **Service Degradation:** 
- **Duration:** 

## Root Cause
[Description of root cause]

## Actions Taken
1. [Containment action]
2. [Investigation step]
3. [Remediation action]

## Follow-up Items
- [ ] [Preventive measure]
- [ ] [Detection improvement]
- [ ] [Process update]

## Lessons Learned
[What we learned and how to prevent recurrence]
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial incident triggers document |
