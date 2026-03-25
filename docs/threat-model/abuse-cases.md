# Abuse Case Catalogue — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

This document catalogues abuse cases — scenarios where the platform is used in ways that harm the platform, its users, upstream councils, or violate terms of service.

Each abuse case documents:
- **Actor:** Who performs the abuse
- **Goal:** What they're trying to achieve
- **Method:** How they attempt it
- **Impact:** Consequences if successful
- **Controls:** Mitigations we implement

---

## AC-001: Mass Address Resolution for Mapping

**Actor:** Bot operator / data aggregator

**Goal:** Build comprehensive address-to-bin-day mapping dataset for resale to marketing companies, property developers, or competitors

**Method:**
1. Register for API key (or use unauthenticated access)
2. Script iteration through all UK postcodes (~1.7M)
3. For each postcode, call `/v1/postcodes/{postcode}/addresses`
4. Store all returned addresses and UPRNs
5. Use multiple IPs/keys to evade rate limits
6. Sell aggregated dataset

**Impact:**
- Platform degradation under load
- Excessive upstream requests to councils
- Potential council relationship damage
- Terms of service breach
- Data resale without authorization

**Controls:**
- Rate limiting per IP (100 req/min unauthenticated)
- Rate limiting per API key (1000 req/hour)
- Daily quota per API key
- Anomaly detection: flag sequential postcode patterns
- CAPTCHA for unauthenticated after threshold
- Cache responses aggressively to reduce upstream impact
- API key revocation for enumeration behaviour
- Require registration with valid use case description

---

## AC-002: Upstream Scraping via Platform Proxy

**Actor:** Lazy scraper / competitor

**Goal:** Use our platform as a free scraping proxy to avoid implementing their own council adapters

**Method:**
1. Identify that our API triggers upstream council requests
2. Make requests that force cache misses (rare addresses)
3. Get fresh data without hitting councils directly
4. Avoid anti-bot measures that councils might have

**Impact:**
- We bear the cost and reputation risk of upstream requests
- Council rate limits applied to us, not them
- We become a scraping-as-a-service

**Controls:**
- Cache-first response (return stale data rather than trigger upstream)
- Background refresh on schedule, not on-demand
- No user-triggerable forced refresh
- Rate limit requests that would trigger upstream
- Monitor for patterns of deliberate cache misses

---

## AC-003: API Key Credential Stuffing

**Actor:** External attacker

**Goal:** Find valid API keys through brute force or credential stuffing

**Method:**
1. Generate possible API key formats
2. Attempt authentication with each
3. Use timing differences to identify valid keys
4. Valid keys harvested for further abuse

**Impact:**
- Valid API keys compromised
- Legitimate users' quotas consumed
- Platform abuse attributed to legitimate users

**Controls:**
- High-entropy API keys (256 bits minimum)
- Constant-time key comparison
- Rate limit authentication attempts (10/min per IP)
- Block IP after failed attempts threshold
- Monitor for distributed key probing
- No timing leak on key validity

---

## AC-004: Admin Account Takeover

**Actor:** Targeted attacker

**Goal:** Gain admin access to platform for data access, sabotage, or persistence

**Method:**
1. Identify admin users (LinkedIn, GitHub, etc.)
2. Phishing attack for credentials
3. Password spray against admin login
4. Exploit SSO vulnerabilities
5. Session hijacking if MFA bypassed

**Impact:**
- Full platform compromise
- Data exfiltration
- Adapter sabotage
- Credential theft
- Persistent backdoor installation

**Controls:**
- SSO with MFA required (hardware keys preferred)
- No local admin passwords
- Admin service internal network only
- Session timeout (15 minutes)
- Concurrent session detection
- Anomalous login alerting
- Break-glass procedure with dual approval
- Quarterly access review

---

## AC-005: Denial of Service via Complex Queries

**Actor:** Malicious user / frustrated competitor

**Goal:** Make the platform unavailable to legitimate users

**Method:**
1. Find expensive API operations (large postcode, many addresses)
2. Send concurrent expensive requests
3. Exhaust database connections or CPU
4. Repeat from multiple IPs

**Impact:**
- Platform unavailability
- SLA breach
- Customer churn
- Recovery costs

**Controls:**
- Query complexity limits
- Request timeout (30 seconds)
- Database connection pooling
- Per-user concurrent request limit
- Circuit breaker on slow operations
- Async processing for expensive queries
- Auto-scaling with cost caps
- CDN/WAF for volumetric absorption

---

## AC-006: Data Poisoning via Fake Upstream

**Actor:** Malicious council website operator / attacker who compromised council site

**Goal:** Inject false collection schedule data into our platform

**Method:**
1. Compromise council website (or spoof DNS)
2. Return plausible but incorrect collection data
3. Our adapter ingests and stores false data
4. Users receive wrong bin collection dates
5. Trust in platform destroyed

**Impact:**
- Incorrect data served to users
- User complaints / missed collections
- Reputational damage
- Trust loss

**Controls:**
- Schema validation on all ingested data
- Plausibility checks (dates in future, valid bin types)
- Anomaly detection (sudden changes in schedule patterns)
- Sample validation against known-good sources
- Adapter health checks
- Alert on data pattern changes
- Human review of anomalous data

---

## AC-007: Supply Chain Injection via Dependency

**Actor:** Supply chain attacker

**Goal:** Execute code in our environment via compromised npm/pip package

**Method:**
1. Compromise popular dependency maintainer account
2. Inject malicious code in patch version
3. Our automated updates pull malicious version
4. Code executes during install (postinstall) or runtime
5. Credentials exfiltrated, backdoor installed

**Impact:**
- Full system compromise
- Credential theft
- Data exfiltration
- Persistent backdoor

**Controls:**
- Lockfile pinning (exact versions)
- Dependabot with review before merge
- npm audit / pip-audit in CI (block on critical)
- Review dependency diffs on updates
- Minimal dependency footprint
- Regular unused dependency cleanup
- Monitor for unexpected network calls

---

## AC-008: Evidence Storage Path Traversal

**Actor:** Malicious adapter / compromised adapter

**Goal:** Read or write files outside the evidence storage directory

**Method:**
1. Craft malicious path: `../../etc/passwd` or `../../other-adapter/evidence`
2. Pass path to evidence storage function
3. Access files outside intended directory
4. Exfiltrate sensitive data or overwrite legitimate evidence

**Impact:**
- Cross-adapter data access
- Evidence tampering
- Potential system file access
- Privilege escalation

**Controls:**
- Never use adapter-provided input in file paths
- Storage keys are UUIDs or content hashes only
- Path validation rejects `..`, absolute paths
- Separate blob containers per adapter
- Evidence service has least-privilege storage access

---

## AC-009: Log Injection for Audit Manipulation

**Actor:** Insider / compromised service

**Goal:** Inject false log entries to hide malicious activity or frame others

**Method:**
1. Include newline characters in logged values
2. Craft input that creates valid-looking log entries
3. Obscure actual malicious activity
4. Create false audit trail

**Impact:**
- Compromised audit trail
- Inability to investigate incidents
- False accusations
- Compliance failures

**Controls:**
- Structured JSON logging (no raw string concatenation)
- Escape/sanitize all logged values
- Replace newlines in logged strings
- Immutable log storage (append-only)
- Log integrity monitoring
- Separate audit log with stricter controls

---

## AC-010: Rate Limit Bypass via Distributed IPs

**Actor:** Sophisticated bot operator

**Goal:** Exceed rate limits by distributing requests across many IP addresses

**Method:**
1. Acquire botnet or proxy network (thousands of IPs)
2. Distribute requests across IPs
3. Each IP stays under rate limit
4. Aggregate exceeds intended limits
5. Achieve mass enumeration

**Impact:**
- Rate limiting ineffective
- Enumeration succeeds
- Upstream council impact
- Platform resource consumption

**Controls:**
- Rate limit by API key (not just IP)
- Account-level daily quotas
- Device fingerprinting
- Anomaly detection on aggregate patterns
- Require verified registration for higher limits
- CAPTCHA on suspicious patterns
- Block known proxy/VPN ranges for sensitive endpoints

---

## AC-011: Replay Attack on Authenticated Request

**Actor:** Network attacker / malicious proxy

**Goal:** Capture and replay valid authenticated requests

**Method:**
1. MITM or capture request with valid API key
2. Replay request multiple times
3. Consume victim's quota
4. Trigger repeated operations

**Impact:**
- Quota exhaustion for victim
- Repeated state changes
- Audit log pollution

**Controls:**
- TLS everywhere (makes capture difficult)
- Request timestamp validation (reject if >5 min old)
- Nonce for state-changing operations
- Idempotency keys for mutations
- Rate limiting (limits replay value)

---

## AC-012: Adapter as Attack Vector for SSRF

**Actor:** Compromised upstream council site

**Goal:** Use our adapter to make requests to internal services or cloud metadata

**Method:**
1. Council site returns redirect to `http://169.254.169.254/latest/meta-data/`
2. Our adapter follows redirect
3. Fetches cloud credentials or internal data
4. Returns to attacker via subsequent scrape

**Impact:**
- Cloud credential theft
- Internal service discovery
- Potential full compromise

**Controls:**
- Disable automatic redirect following
- Validate redirect targets against allowlist
- Block private IP ranges and cloud metadata IPs
- DNS rebinding protection
- Per-adapter egress allowlist (specific council domain only)

---

## AC-013: Admin Function Abuse for Sabotage

**Actor:** Disgruntled insider / compromised admin

**Goal:** Disable the platform or corrupt data

**Method:**
1. Use admin access to kill all adapters
2. Delete or corrupt database records
3. Modify API keys to invalid state
4. Leave backdoor for later access

**Impact:**
- Platform outage
- Data loss
- Recovery time and cost
- Trust damage

**Controls:**
- Dual approval for destructive operations
- Admin action audit log (immutable)
- No direct database access in production
- Regular backup verification
- Disaster recovery runbook
- Access review and offboarding procedures
- Break-glass monitoring

---

## AC-014: Privacy Violation via Evidence Retention

**Actor:** Regulatory auditor / data breach

**Goal:** Expose personally identifiable information in retained evidence

**Method:**
1. Raw HTML evidence contains addresses visible on council pages
2. Evidence retained indefinitely
3. Data breach exposes years of evidence
4. PII from evidence published

**Impact:**
- GDPR/DPA violations
- Fines
- Reputational damage
- Legal action

**Controls:**
- 90-day evidence retention limit
- Automated lifecycle deletion
- Evidence audit for PII presence
- Evidence encryption at rest
- Access logging for evidence reads
- Data protection impact assessment

---

## AC-015: Browser Automation Resource Exhaustion

**Actor:** Malicious upstream content

**Goal:** Exhaust resources on our browser automation environment

**Method:**
1. Council page loads cryptocurrency miner
2. Or page has infinite JavaScript loops
3. Or page triggers memory leak
4. Browser consumes all available resources
5. Other adapters blocked

**Impact:**
- Adapter failures
- Platform degradation
- Increased costs
- Resource starvation

**Controls:**
- CPU and memory limits per browser container
- Navigation timeout (30 seconds)
- Hard kill after timeout
- Isolated container per browser session
- No GPU access (blocks some miners)
- Resource monitoring and alerting
- Browser context discarded after each run

---

## AC-016: Timing Attack on Key Validation

**Actor:** Sophisticated attacker

**Goal:** Determine API key validity via response timing

**Method:**
1. Send requests with various candidate keys
2. Measure response time precisely
3. Valid keys take different time than invalid
4. Narrow down valid key space

**Impact:**
- API key discovery
- Authentication bypass

**Controls:**
- Constant-time comparison for all key checks
- Add fixed delay before returning auth failure
- Rate limit authentication attempts
- Generic error message (don't distinguish invalid vs disabled)

---

## AC-017: Council Site DoS via Over-Polling

**Actor:** Platform misconfiguration / malicious adapter

**Goal:** Make excessive requests to council websites (intentionally or accidentally)

**Method:**
1. Adapter polling interval set too aggressive
2. Or bug causes retry storm
3. Or all adapters restart simultaneously (thundering herd)
4. Council site overloaded
5. Council blocks our IP; relationship damaged

**Impact:**
- Council website degradation
- Our platform blocked by council
- Legal/contractual issues
- Data unavailability

**Controls:**
- Configurable rate limits per adapter
- Jittered backoff on failures
- Staggered adapter schedules
- Global request budget
- Circuit breaker (stop on repeated failures)
- Request volume monitoring
- Kill switch to immediately stop adapter

---

## AC-018: Cross-Adapter Data Exfiltration

**Actor:** Compromised adapter

**Goal:** Access data belonging to other adapters

**Method:**
1. Exploit in Adapter A allows code execution
2. Adapter A attempts to read Adapter B's database records
3. Or access Adapter B's evidence storage
4. Or reach other adapter's network

**Impact:**
- Data breach across adapters
- Lateral movement
- Multi-council compromise

**Controls:**
- Database row-level security (adapter sees only its data)
- Separate blob containers per adapter
- Network isolation (adapters cannot communicate)
- No shared credentials
- Adapter identity verified on all operations

---

## AC-019: CI/CD Pipeline Compromise

**Actor:** Supply chain attacker / insider

**Goal:** Inject malicious code into production deployment

**Method:**
1. Compromise developer workstation
2. Push malicious commit
3. Or compromise CI system directly
4. Or poison build dependencies
5. Malicious code deployed to production

**Impact:**
- Full production compromise
- Backdoor persistence
- Data theft
- Trust destruction

**Controls:**
- Signed commits required
- Branch protection (no direct push to main)
- Code review required
- Separate CI runners for production
- Production deployment approval workflow
- Signed container images
- Build provenance tracking
- SBOM generation
- Secrets not accessible until deployment

---

## AC-020: Evidence Tampering for Legal Dispute

**Actor:** Malicious insider / external attacker

**Goal:** Modify stored evidence to support false claims or hide issues

**Method:**
1. Gain access to evidence storage
2. Modify or delete evidence files
3. Create false evidence
4. Use in legal/contractual dispute

**Impact:**
- Evidence integrity compromised
- Legal liability
- Audit failures

**Controls:**
- WORM (Write Once Read Many) storage
- Content hash stored in database
- Hash verification on read
- Immutable audit log of evidence access
- Admin approval for any evidence deletion
- Retention policy enforcement

---

## Summary by Risk Level

### Critical Risk
- AC-004: Admin Account Takeover
- AC-007: Supply Chain Injection
- AC-019: CI/CD Pipeline Compromise

### High Risk
- AC-001: Mass Address Resolution
- AC-006: Data Poisoning
- AC-012: SSRF via Adapter
- AC-013: Admin Sabotage
- AC-018: Cross-Adapter Exfiltration

### Medium Risk
- AC-002: Upstream Proxy Abuse
- AC-003: API Key Credential Stuffing
- AC-005: DoS via Complex Queries
- AC-008: Evidence Path Traversal
- AC-010: Rate Limit Bypass
- AC-014: Privacy via Evidence Retention
- AC-015: Browser Resource Exhaustion
- AC-017: Council DoS via Over-Polling

### Lower Risk
- AC-009: Log Injection
- AC-011: Replay Attack
- AC-016: Timing Attack
- AC-020: Evidence Tampering

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial abuse case catalogue |
