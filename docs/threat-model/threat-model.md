# Hampshire Bin Collection Data Platform — Threat Model

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Classification:** Internal  

---

## 1. System Overview

### What We're Protecting

The Hampshire Bin Collection Data Platform is a production-grade system that:

1. **Acquires** bin collection schedule data from 13 Hampshire local council websites
2. **Normalises** that data into a consistent schema
3. **Exposes** that data via a rate-limited, authenticated API

The platform exists to provide reliable, machine-readable bin collection data where no official API exists. It does this by scraping council websites — an inherently adversarial environment where the upstream source is untrusted and may change without notice.

### Why This Matters

- **Privacy:** Property addresses are processed — this is potentially PII
- **Reliability:** Users depend on this for notification services
- **Upstream relationships:** We must not abuse council resources or violate their terms
- **Credential security:** API keys, database credentials, and service secrets must be protected
- **Supply chain:** We depend on third-party packages that could be compromised

### Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              INTERNET (UNTRUSTED)                       │
│    ┌─────────────┐                              ┌──────────────────┐   │
│    │ API Clients │                              │ Council Websites │   │
│    │ (untrusted) │                              │   (untrusted)    │   │
│    └──────┬──────┘                              └────────┬─────────┘   │
└───────────┼─────────────────────────────────────────────┼──────────────┘
            │                                             │
            ▼                                             ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        DMZ / API GATEWAY                              │
│   ┌─────────────────────────────────────────────────────────────┐    │
│   │                 WAF / Rate Limiter / TLS Termination        │    │
│   └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────┬─────────────────────────────────────┘
                                  │
                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│                      APPLICATION TIER (TRUSTED)                       │
│   ┌─────────────┐  ┌─────────────┐  ┌──────────────────────────────┐ │
│   │ API Service │  │ Auth Layer  │  │ Adapter Worker Pool          │ │
│   │             │◄─┤             │  │  ┌─────────┐ ┌─────────┐     │ │
│   └──────┬──────┘  └─────────────┘  │  │Adapter 1│ │Adapter N│     │ │
│          │                          │  └─────────┘ └─────────┘     │ │
│          │                          │        │                      │ │
│          │                          │        ▼                      │ │
│          │                          │  ┌─────────────────────┐     │ │
│          │                          │  │ Browser Automation  │     │ │
│          │                          │  │ (Playwright sandbox)│     │ │
│          │                          │  └─────────────────────┘     │ │
│          │                          └──────────────────────────────┘ │
└──────────┼────────────────────────────────────────────────────────────┘
           │
           ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        DATA TIER (RESTRICTED)                         │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│   │ PostgreSQL  │  │    Redis    │  │ Blob Storage│                  │
│   │ (normalised │  │   (cache)   │  │ (raw evidence)                │ │
│   │    data)    │  │             │  │                               │ │
│   └─────────────┘  └─────────────┘  └─────────────┘                  │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Assets to Protect

| Asset | Classification | Location | Criticality |
|-------|----------------|----------|-------------|
| API keys (client keys) | Sensitive | Database, memory | High |
| Internal service credentials | Restricted | Secrets store | Critical |
| Database credentials | Restricted | Secrets store | Critical |
| Redis credentials | Restricted | Secrets store | High |
| Blob storage credentials | Restricted | Secrets store | High |
| Adapter configuration | Internal | Config files, DB | Medium |
| Council-specific session state | Internal | Redis, memory | Medium |
| Raw HTML evidence | Internal | Blob storage | Medium |
| Property UPRNs | Sensitive | Database | Medium |
| Address data | Sensitive | Database, API responses | Medium |
| Collection schedules | Public | Database, API responses | Low |
| Operational telemetry | Internal | Logging system | Low |
| Admin credentials | Restricted | Secrets store, IdP | Critical |
| CI/CD secrets | Restricted | Pipeline secrets | Critical |
| Source code | Internal | Git repository | High |

---

## 3. Threat Actors

### TA-01: External Attacker (Opportunistic)

- **Motivation:** Curiosity, CVE scanning, credential harvesting
- **Capability:** Uses automated tools, exploits known vulnerabilities
- **Access:** Internet only
- **Persistence:** Low — moves on if target is hardened

### TA-02: Targeted Attacker (Motivated Adversary)

- **Motivation:** Data theft, platform disruption, extortion
- **Capability:** Sophisticated, patient, custom tooling
- **Access:** Internet, may attempt social engineering
- **Persistence:** High — will try multiple vectors

### TA-03: Bot / Scraper (Automated Abuse)

- **Motivation:** Harvest address data for resale, competitive intelligence
- **Capability:** Distributed infrastructure, rate limit evasion
- **Access:** Internet via API
- **Persistence:** High — will adapt to countermeasures

### TA-04: Malicious Upstream (Council Site)

- **Motivation:** Accidental or intentional hostile content
- **Capability:** Controls HTML/JS content we fetch
- **Access:** Via adapter HTTP requests
- **Note:** Could be compromised council site, not necessarily council itself

### TA-05: Compromised Dependency (Supply Chain)

- **Motivation:** Broad impact, cryptocurrency mining, backdoors
- **Capability:** Code execution in build or runtime
- **Access:** Via npm/pip packages
- **Persistence:** Until dependency is updated or removed

### TA-06: Insider Threat

- **Motivation:** Financial gain, disgruntlement, coercion
- **Capability:** Legitimate access to systems
- **Access:** VPN, admin credentials, code repository
- **Persistence:** Variable

### TA-07: Automated Scanners

- **Motivation:** Build vulnerability databases, botnet recruitment
- **Capability:** Internet-scale scanning
- **Access:** Internet only
- **Persistence:** Continuous

---

## 4. Threat Catalogue

### T-01: External API Abuse / Enumeration

**Threat Description:** Attackers systematically query the API to enumerate all addresses, postcodes, or collection schedules to build a comprehensive dataset.

**Attack Vector:** 
- Iterate through all UK postcodes via `/v1/postcodes/{postcode}/addresses`
- Script sequential UPRN queries
- Use multiple IP addresses to distribute requests

**Likelihood:** High  
**Impact:** Medium

**Existing Mitigations:**
- Rate limiting planned
- API key authentication for non-public endpoints

**Recommended Controls:**
1. Per-IP rate limits (100 requests/minute for unauthenticated)
2. Per-API-key rate limits (1000 requests/hour, configurable)
3. Anomaly detection for enumeration patterns (sequential postcodes, rapid unique queries)
4. CAPTCHA or proof-of-work for unauthenticated endpoints under abuse
5. Exponential backoff on failed lookups
6. Cache responses to reduce upstream impact

**Residual Risk:** Low — enumeration is slowed significantly but cannot be completely prevented by a determined adversary with resources.

---

### T-02: Bot Abuse of Address Resolution Endpoint

**Threat Description:** Bots specifically target the address resolution endpoint because it triggers expensive upstream lookups to council sites, effectively using our platform as a free proxy to harvest address data.

**Attack Vector:**
- Automated postcode enumeration
- Use API to resolve addresses without implementing their own scrapers
- Resell aggregated data

**Likelihood:** High  
**Impact:** High

**Existing Mitigations:**
- Rate limiting planned

**Recommended Controls:**
1. Higher rate limits on cached responses, lower on upstream-triggering requests
2. API key required for address resolution
3. Usage quotas tied to API key tier
4. Monitor for burst patterns and anomalous geographic distribution
5. Return cached data preferentially; queue upstream refreshes
6. Block API keys exhibiting enumeration behaviour

**Residual Risk:** Medium — determined actors can create multiple API keys, but the friction reduces casual abuse.

---

### T-03: API Key Theft / Leakage

**Threat Description:** Client API keys are stolen from client-side code, logs, or compromised client systems, allowing impersonation or quota abuse.

**Attack Vector:**
- API key embedded in client-side JavaScript
- Key logged in server logs or error messages
- Key stored in insecure client storage
- Key intercepted via compromised network

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- TLS for all API traffic

**Recommended Controls:**
1. Never log API keys — mask in all log output
2. Key rotation capability with grace period
3. IP allowlisting option for API keys
4. Referrer checking for browser-based keys
5. Separate key tiers (public/restricted) with different capabilities
6. Monitoring for key usage from unusual IPs or patterns
7. Self-service key regeneration in developer portal

**Residual Risk:** Low — with monitoring and rotation, stolen keys have limited useful lifetime.

---

### T-04: Credential Theft (Database, Redis, Blob Storage)

**Threat Description:** Service credentials for backend systems are stolen, allowing direct access to data stores, bypassing all application controls.

**Attack Vector:**
- Credentials in environment variables exfiltrated via SSRF or RCE
- Credentials hardcoded in config files committed to git
- Credentials exposed in error messages or logs
- Compromised CI/CD pipeline leaks secrets

**Likelihood:** Medium  
**Impact:** Critical

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Store all credentials in managed secrets store (Azure Key Vault / AWS Secrets Manager)
2. Inject secrets at runtime, never in code or config files
3. Database credentials: use managed identity where possible
4. Network-level access control — database/Redis not reachable from internet
5. Credential rotation on schedule (90 days) and on suspected compromise
6. Audit logging of secrets access
7. Startup validation that all required secrets are present
8. Principle of least privilege — each service gets only the credentials it needs

**Residual Risk:** Low — with defense in depth, credential theft requires multiple failures.

---

### T-05: SSRF via Adapter Crafting Malicious Upstream Redirect

**Threat Description:** A compromised or malicious council website returns HTTP redirects that cause our adapter to make requests to internal services or arbitrary external targets.

**Attack Vector:**
- Council website returns `302 Redirect` to `http://169.254.169.254/` (cloud metadata)
- Redirect to internal service endpoints
- Redirect to attacker-controlled server to exfiltrate request data

**Likelihood:** Medium  
**Impact:** High

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Disable automatic redirect following in HTTP client
2. If redirects needed, validate target domain against allowlist before following
3. Block requests to private IP ranges (RFC 1918, link-local, cloud metadata)
4. Per-adapter egress allowlist — adapters can only reach their specific council domain
5. DNS rebinding protection — resolve DNS and validate IP before connecting
6. Log all redirects for anomaly detection

**Residual Risk:** Low — with redirect validation and egress controls, SSRF is mitigated.

---

### T-06: Command Injection via Upstream HTML/JS Content

**Threat Description:** Malicious content in council website responses is processed in a way that leads to command execution on our systems.

**Attack Vector:**
- Council website (or attacker controlling it) embeds malicious payloads in HTML
- Parser or downstream processing executes commands
- Server-side template injection if rendering HTML server-side

**Likelihood:** Low  
**Impact:** Critical

**Existing Mitigations:**
- We don't render HTML server-side

**Recommended Controls:**
1. Never pass scraped content to shell commands
2. Never use `eval()` or equivalent on scraped content
3. HTML parsing via safe DOM parser (cheerio, lxml) only
4. No server-side rendering of scraped content
5. Content Security Policy if any admin interface renders evidence
6. Sandboxed execution environment for adapters
7. Input length limits on all scraped fields

**Residual Risk:** Very Low — architecture doesn't require executing scraped content.

---

### T-07: HTML/DOM Parsing Attacks (Malicious Upstream Content)

**Threat Description:** Malformed or malicious HTML content causes parser crashes, hangs, or unexpected behaviour in our adapters.

**Attack Vector:**
- Deeply nested HTML causing stack overflow
- Billion laughs / XML bomb style attacks
- Unicode exploits in HTML content
- Malformed UTF-8 causing encoding issues

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Response size limits (10MB max)
2. Parsing timeouts (30 seconds max)
3. DOM depth limits
4. Use memory-safe parsing libraries with known security posture
5. Validate encoding before parsing
6. Isolate parsers in separate process/container
7. Monitor for parser hangs or crashes

**Residual Risk:** Low — with limits and isolation, parser attacks have limited impact.

---

### T-08: Malicious Council-Side Content in Raw Evidence

**Threat Description:** Raw HTML evidence stored in blob storage contains malicious content that could affect downstream systems if rendered or processed later.

**Attack Vector:**
- XSS payloads in stored HTML rendered by admin interface
- Malicious scripts executed if evidence is viewed in browser
- Polyglot files (HTML that's also valid JavaScript/executable)

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Never render raw evidence in browser without sanitization
2. Serve raw evidence with `Content-Type: text/plain` and `X-Content-Type-Options: nosniff`
3. Content-Disposition: attachment for downloads
4. Sanitize evidence before display in admin interface
5. CSP on admin interface blocking inline scripts
6. Evidence viewer runs in sandboxed iframe with `sandbox` attribute

**Residual Risk:** Low — with proper content handling, stored XSS is prevented.

---

### T-09: Supply Chain Compromise (npm/pip Packages)

**Threat Description:** A dependency (or dependency of dependency) is compromised, injecting malicious code into our application.

**Attack Vector:**
- Typosquatting (e.g., `lod-ash` instead of `lodash`)
- Maintainer account compromise
- Malicious code in postinstall scripts
- Dependency confusion attacks

**Likelihood:** Medium  
**Impact:** Critical

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Lockfile pinning — commit package-lock.json/poetry.lock
2. Dependabot / Renovate for automated security updates
3. npm/pip audit in CI pipeline, fail on high/critical
4. Review dependency diffs before merging updates
5. Use private registry/proxy with vulnerability scanning
6. Minimal dependency footprint — prefer standard library
7. SRI hashes in lockfiles where supported
8. Monitor for dependency removal (left-pad scenario)
9. Regular dependency audit — remove unused packages

**Residual Risk:** Medium — supply chain attacks are sophisticated; controls reduce but don't eliminate risk.

---

### T-10: Replay Attacks on Public Endpoints

**Threat Description:** Attackers capture and replay valid requests to public endpoints to trigger repeated actions or bypass authentication timing.

**Attack Vector:**
- Capture request with valid timestamp/nonce
- Replay before expiration
- Use replay for cache poisoning

**Likelihood:** Low  
**Impact:** Low

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Rate limiting makes replay less valuable
2. Request signing for authenticated endpoints (timestamp + signature)
3. Nonce validation for state-changing operations
4. Short validity window on signed requests (5 minutes)
5. Idempotent API design where possible

**Residual Risk:** Very Low — public endpoints serve cacheable data; replay impact minimal.

---

### T-11: Scraper Evasion / Brittle Upstream Behaviour Leading to Data Poisoning

**Threat Description:** Council websites detect scraping and return fake or misleading data, or gradual page changes cause adapters to extract incorrect data without failing.

**Attack Vector:**
- Council detects scraper and returns CAPTCHA or fake data
- Page structure changes but adapter doesn't break — extracts wrong fields
- Anti-bot measures return different content to headless browsers

**Likelihood:** High  
**Impact:** Medium

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Schema validation on extracted data
2. Anomaly detection (sudden changes in data patterns)
3. Sample validation — compare extracted data with known good values
4. Adapter health checks with test fixtures
5. Alert on consecutive extraction failures
6. Human review of data samples periodically
7. Hash page structure to detect changes
8. Rate limiting our requests to avoid detection

**Residual Risk:** Medium — detection systems vary; some false data may slip through.

---

### T-12: Denial of Service Against the Platform

**Threat Description:** Attackers overwhelm the platform with requests, making it unavailable to legitimate users.

**Attack Vector:**
- Volumetric attacks against API endpoints
- Slowloris or similar slow-rate attacks
- Application-layer attacks targeting expensive operations
- Resource exhaustion via malformed requests

**Likelihood:** Medium  
**Impact:** High

**Existing Mitigations:**
- Rate limiting planned

**Recommended Controls:**
1. CDN/WAF for volumetric attack absorption (Cloudflare, AWS Shield)
2. Rate limiting at multiple layers (WAF, API gateway, application)
3. Request timeouts at all layers
4. Connection limits
5. Async processing for expensive operations
6. Circuit breakers for downstream dependencies
7. Auto-scaling with cost caps
8. Monitor for resource exhaustion patterns

**Residual Risk:** Low — with proper infrastructure, platform survives most DoS attacks.

---

### T-13: Denial of Service Against Council Sites (Over-Polling)

**Threat Description:** Our platform makes excessive requests to council websites, causing their systems to degrade or block us, or damaging our relationship with councils.

**Attack Vector:**
- Aggressive polling schedule
- Thundering herd on adapter restart
- Amplification via many parallel adapters
- Bug causing retry storm

**Likelihood:** Medium  
**Impact:** High

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Configurable per-adapter rate limits
2. Jittered backoff on failures
3. Staggered adapter schedules (not all at midnight)
4. Global request budget across all adapters
5. Respect robots.txt where present
6. Circuit breaker — stop polling if too many failures
7. Monitoring for request volume anomalies
8. Document and respect any council-communicated limits
9. Kill switch to immediately disable adapter

**Residual Risk:** Low — with controls, we're a polite scraper.

---

### T-14: Schema Poisoning via Malformed Upstream Data

**Threat Description:** Malformed data from council sites causes unexpected behaviour in parsing, storage, or downstream processing.

**Attack Vector:**
- Oversized field values
- Unexpected data types
- SQL injection payloads in scraped content
- Special characters causing parsing issues

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Strict schema validation before database insert
2. Parameterized queries (never interpolate scraped data into SQL)
3. Field length limits
4. Data type coercion with validation
5. Reject invalid records, don't store
6. Log schema violations for investigation
7. Input sanitization at adapter output boundary

**Residual Risk:** Low — with validation, malformed data is rejected.

---

### T-15: Excessive Raw Evidence Retention (Privacy Risk)

**Threat Description:** Raw evidence (HTML pages) are retained indefinitely, accumulating stale data that may contain personal information scraped inadvertently.

**Attack Vector:**
- Data breach exposes years of stored evidence
- GDPR/DPA compliance issues
- Storage cost escalation
- Evidence from deprecated adapters never cleaned

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Retention policy: delete evidence older than 90 days
2. Automated lifecycle rules on blob storage
3. Audit retained data for PII presence
4. Delete evidence when adapter is deprecated
5. Document retention requirements
6. Regular review of storage contents
7. No personal data in evidence file metadata

**Residual Risk:** Low — with lifecycle rules, data doesn't accumulate.

---

### T-16: Privilege Escalation in Admin Functions

**Threat Description:** Attackers or compromised accounts escalate privileges to access admin functions, modify system configuration, or access restricted data.

**Attack Vector:**
- Insecure direct object references in admin API
- Missing authorization checks
- JWT manipulation
- Admin endpoint accessible without authentication

**Likelihood:** Medium  
**Impact:** Critical

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Separate admin service on internal network only
2. Admin authentication via SSO/IdP with MFA
3. Role-based access control with least privilege
4. Authorization checks on every admin endpoint
5. Audit logging of all admin actions
6. Admin sessions with short timeout
7. Break-glass procedures for emergency access
8. Regular review of admin access grants

**Residual Risk:** Low — with layered controls, privilege escalation requires multiple failures.

---

### T-17: Secrets Leakage in Logs

**Threat Description:** Secrets (API keys, credentials, tokens) are accidentally logged, exposing them to anyone with log access.

**Attack Vector:**
- Debug logging includes request headers with API key
- Error messages include database connection strings
- Exception stack traces include credentials
- Correlation IDs include secret material

**Likelihood:** High  
**Impact:** High

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Secret-aware logging library that redacts known patterns
2. Never log Authorization headers in full
3. Never log connection strings
4. Structured logging with explicit field allowlist
5. Log review in code review checklist
6. Automated scanning of logs for secret patterns
7. Separate audit logs with restricted access
8. Test for secret leakage in log output

**Residual Risk:** Low — with redaction and review, leakage is caught quickly.

---

### T-18: Browser Automation Compromise (Playwright Escape)

**Threat Description:** Malicious content in council websites exploits vulnerabilities in the browser automation environment to escape the sandbox and compromise the host.

**Attack Vector:**
- Exploit browser vulnerability to escape sandbox
- Exploit Playwright/Chromium bugs
- Side-channel attacks via browser
- Resource exhaustion via browser

**Likelihood:** Low  
**Impact:** Critical

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Run browser automation in isolated container with minimal privileges
2. No network access except to specific council URLs
3. Read-only filesystem except for necessary temp directories
4. No GPU access (reduces attack surface)
5. Seccomp/AppArmor profiles for container
6. Regular Playwright/Chromium updates
7. Browser runs as non-root user
8. CPU/memory limits on browser containers
9. Browser process timeout and kill
10. No persistence between runs

**Residual Risk:** Low — with isolation, even browser escape has limited impact.

---

### T-19: Dependency Vulnerabilities

**Threat Description:** Known vulnerabilities in dependencies are exploited before patches are applied.

**Attack Vector:**
- CVE disclosed for dependency we use
- Attacker crafts exploit before we update
- Transitive dependency vulnerability not noticed

**Likelihood:** High  
**Impact:** Variable (depends on vulnerability)

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. `npm audit` / `pip-audit` in CI pipeline
2. Dependabot alerts enabled
3. SLA for patching: Critical (24h), High (7d), Medium (30d)
4. SBOM generation for tracking
5. Block deployment if critical vulnerabilities detected
6. Regular dependency review
7. Monitor security advisories for key dependencies

**Residual Risk:** Medium — window between disclosure and patching is unavoidable.

---

### T-20: Cross-Adapter Trust Boundary Failures

**Threat Description:** One adapter's compromise allows access to another adapter's data, credentials, or execution context.

**Attack Vector:**
- Shared credentials across adapters
- Shared execution environment
- Shared database tables without isolation
- Adapter A can trigger actions in Adapter B context

**Likelihood:** Medium  
**Impact:** High

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Each adapter runs in isolated container/process
2. No shared credentials between adapters
3. Database row-level isolation (adapter can only access its own data)
4. Separate blob storage paths per adapter
5. Adapter identity verified on all operations
6. Network isolation — adapters cannot communicate directly
7. No shared mutable state between adapters

**Residual Risk:** Low — with isolation, adapter compromise is contained.

---

### T-21: Lateral Movement if Adapter Environment is Compromised

**Threat Description:** Compromise of an adapter execution environment allows lateral movement to other platform components.

**Attack Vector:**
- Adapter container escapes to host
- Adapter reaches database directly
- Adapter accesses secrets store
- Adapter pivots to admin service

**Likelihood:** Low  
**Impact:** Critical

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Network segmentation — adapters in isolated network
2. Adapters cannot reach database/Redis directly (only via internal API)
3. Adapters have no access to secrets store
4. Adapters receive only their own configuration
5. Container hardening (rootless, readonly, no privileged)
6. Host monitoring for escape attempts
7. Service mesh with mTLS for internal communication

**Residual Risk:** Low — with segmentation, lateral movement is blocked.

---

### T-22: Rate Limit Bypass

**Threat Description:** Attackers find ways to bypass rate limiting controls to abuse the API.

**Attack Vector:**
- Rotate IP addresses via proxies/botnets
- Create multiple API keys
- Exploit rate limit counting bugs
- Find unprotected endpoints

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- Rate limiting planned

**Recommended Controls:**
1. Rate limit at multiple layers (WAF, API gateway, application)
2. Rate limit by API key AND by IP
3. Account-level quotas that aggregate across keys
4. Device fingerprinting for additional signal
5. Monitor for distributed abuse patterns
6. Block known proxy/VPN ranges for sensitive endpoints
7. Dynamic rate limiting that adapts to abuse patterns
8. All endpoints protected (no unprotected paths)

**Residual Risk:** Medium — determined attackers with resources can bypass; controls increase cost of attack.

---

### T-23: Timing Attacks on Authentication

**Threat Description:** Attackers use timing differences in authentication responses to infer valid usernames or API keys.

**Attack Vector:**
- Measure response time for valid vs invalid API keys
- Enumerate valid keys via timing
- Database timing side-channel

**Likelihood:** Low  
**Impact:** Low

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Constant-time comparison for API keys
2. Fixed response time for authentication failures
3. No different error messages for invalid vs disabled keys
4. Rate limit authentication endpoints
5. Monitor for timing attack patterns (many sequential requests)

**Residual Risk:** Very Low — mitigations eliminate timing signal.

---

### T-24: Log Injection

**Threat Description:** Attackers inject malicious content into logs that could be exploited when logs are viewed or processed.

**Attack Vector:**
- Newline injection to forge log entries
- ANSI escape sequences for terminal exploitation
- Log parsing injection (e.g., if logs parsed as JSON)
- XSS if logs viewed in web interface

**Likelihood:** Medium  
**Impact:** Medium

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Structured logging (JSON) with proper escaping
2. Sanitize user input before logging
3. Replace newlines in logged values
4. Strip ANSI sequences from logged data
5. Log viewer with XSS protection
6. Validate log format before parsing

**Residual Risk:** Low — structured logging eliminates most injection vectors.

---

### T-25: Path Traversal in Evidence Storage

**Threat Description:** Attackers manipulate evidence storage paths to read or write files outside intended directories.

**Attack Vector:**
- Inject `../` in adapter-provided filenames
- Manipulate council ID or UPRN to traverse paths
- Overwrite existing evidence with malicious content

**Likelihood:** Medium  
**Impact:** High

**Existing Mitigations:**
- None currently

**Recommended Controls:**
1. Never use user/adapter input directly in file paths
2. Generate storage keys from hash of content or UUID
3. Validate path components against allowlist
4. Blob storage path construction in single function with validation
5. Reject paths containing `..`, absolute paths, or suspicious characters
6. Principle of least privilege on storage credentials
7. Separate blob containers per adapter for isolation

**Residual Risk:** Low — with proper path construction, traversal is prevented.

---

## 5. Security Assumptions

| Assumption | If False |
|------------|----------|
| Cloud provider secures underlying infrastructure | Full compromise of all systems |
| TLS libraries are correctly implemented | MITM of all traffic possible |
| Dependencies are not malicious at install time | Backdoor in production |
| Admin users are trustworthy | Insider threat scenario |
| Council websites are not actively targeting us | Adapter compromise more likely |

---

## 6. Open Questions

1. **Authentication model:** How will admin users authenticate? (SSO integration TBD)
2. **Key management:** Which secrets store will be used? (Azure Key Vault recommended)
3. **Network topology:** Will adapters run in isolated VPC/VNET?
4. **Browser automation:** Playwright in sidecar container or shared pool?
5. **Incident response:** Who is on-call for security incidents?

---

## 7. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial threat model |
