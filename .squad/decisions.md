# Squad Decisions

## Active Decisions (Phase 0 Complete)

### Architectural Decisions (Holden)

**ADR-001: TypeScript as Primary Language**
- **Status:** For team review
- **Decision:** TypeScript with strict mode for all platform components
- **Rationale:** Type safety at adapter interfaces, native Playwright support, single-language stack
- **Impact:** Team needs TypeScript proficiency; build step required; strict mode enforced
- **Action Required:** Team acknowledgment

**ADR-002: Hono as API Framework**
- **Status:** For team review
- **Decision:** Hono replaces previous Fastify consideration
- **Rationale:** TypeScript-first design, security headers, Zod integration, smaller attack surface
- **Impact:** Team needs Hono familiarity; Express patterns may differ; package.json updated
- **Action Required:** Team acknowledgment

**ADR-003: Three-Tier Storage Architecture**
- **Status:** For team review
- **Decision:** PostgreSQL (domain data) + Redis (cache/queues) + Azure Blob (evidence)
- **Rationale:** Separation of concerns; evidence isolation; standard Azure PaaS
- **Impact:** Three infrastructure components; evidence retention policies; database partitioning
- **Action Required:** Team acknowledgment

**ADR-004: Worker Queue with Container Sandbox**
- **Status:** For team review
- **Decision:** BullMQ for adapter orchestration + container sandbox for browser automation
- **Rationale:** Adapter isolation; resource limits; network isolation for browser tasks
- **Impact:** More complex deployment; job queue operational surface; container orchestration
- **Action Required:** Team acknowledgment

**ADR-005: Layered Property Identity Resolution**
- **Status:** For team review
- **Decision:** UPRN → council local ID → address hash fallback hierarchy
- **Rationale:** Not all councils expose UPRN; ensures adapter compatibility
- **Impact:** Property deduplication needed; UPRN coverage varies; resolution logic complexity
- **Action Required:** Team acknowledgment

---

### Security Decisions (Amos) — MANDATORY, BLOCKING

**SD-01: No Secrets in Code, Config, or Git**
- **Status:** Mandatory — blocking merge if violated
- **Decision:** Secrets never in source, config, git, containers, tests, docs
- **Enforcement:** Pre-commit hooks + CI secret scanning
- **Alternative:** Azure Key Vault injection at runtime
- **Owner:** All team members
- **Violations block merge**

**SD-02: Azure Key Vault for Secrets Management**
- **Status:** Mandatory
- **Decision:** Azure Key Vault is sole secrets store
- **Requirements:**
  - Credentials stored in Key Vault only
  - Access via managed identity (no service principal keys in code)
  - Secret access logged and monitored
  - Rotation: DB credentials 90d, JWT keys 180d
- **Owner:** Drummer (infrastructure)

**SD-03: Adapter Isolation Architecture**
- **Status:** Mandatory
- **Decision:** Each adapter in complete isolation (container, network, data, credentials)
- **Rationale:** Compromise of one adapter must not affect others
- **Owner:** Naomi (adapters), Drummer (infrastructure)

**SD-04: Egress Deny-by-Default**
- **Status:** Mandatory
- **Decision:** All outbound traffic blocked by default
- **Allowed egress:**
  - API Service: Database, Redis, Key Vault, monitoring only. **No internet.**
  - Adapters: Specific council URL only. Cloud metadata blocked.
  - Admin Service: SSO provider only. **No general internet.**
  - Database/Redis: **No outbound access.**
- **Violations:** Any internet egress to core services requires security review
- **Owner:** Drummer (infrastructure)

**SD-05: Admin Service Internal Only**
- **Status:** Mandatory
- **Decision:** Admin service not accessible from internet
- **Access:** VPN/bastion only; SSO + MFA required; no local passwords
- **Owner:** Drummer (infrastructure), Holden (implementation)

**SD-06: Kill Switch Capability Required**
- **Status:** Mandatory
- **Decision:** Every adapter disableable via kill switch in <60 seconds without deployment
- **Implementation:**
  - Per-adapter kill switch
  - Global adapter kill switch
  - Feature-level kill switches
  - State in database + Redis cache
  - Kill switch check before every adapter run
- **Owner:** Naomi (adapters), Holden (API/admin)

**SD-07: Secrets Redaction in Logs**
- **Status:** Mandatory — blocking merge if violated
- **Decision:** Logs must never contain secrets
- **Implementation:**
  - Automatic redaction patterns
  - Never log Authorization headers, connection strings, tokens
  - Structured logging with explicit allowlists
  - Code review includes log review
- **Violations block merge**

**SD-08: 90-Day Evidence Retention Limit**
- **Status:** Mandatory
- **Decision:** Raw HTML/JSON automatically deleted after 90 days
- **Implementation:**
  - Blob storage lifecycle policy
  - No manual override without security approval
  - Evidence contains potential PII
- **Owner:** Drummer (infrastructure), Naomi (evidence storage)

**SD-09: API Key Authentication Required for Address Resolution**
- **Status:** Mandatory
- **Decision:** `/v1/postcodes/{postcode}/addresses` endpoint requires API key auth
- **Rationale:** Most expensive operation (upstream lookups), highest abuse value
- **Note:** Collection schedule lookups may remain unauthenticated but rate-limited
- **Owner:** Holden (API design)

**SD-10: Database Parameterized Queries Only**
- **Status:** Mandatory — blocking merge if violated
- **Decision:** All queries use parameterized placeholders, no string interpolation
- **Implementation:**
  - ORM with query builder preferred
  - Raw queries only with parameterized placeholders
  - Code review includes SQL review
  - Static analysis for SQL injection patterns
- **Violations block merge**

**SD-11: Browser Automation Sandboxing**
- **Status:** Mandatory
- **Decision:** Playwright sessions run in hardened sandbox
- **Configuration:**
  - Rootless container
  - Seccomp profile (restrictive)
  - No GPU access
  - Read-only filesystem (except temp)
  - Isolated network (council URLs only)
  - CPU/memory limits
  - 30-second navigation timeout with hard kill
- **Owner:** Drummer (infrastructure), Naomi (Playwright adapters)

**SD-12: Startup Validation Required**
- **Status:** Mandatory
- **Decision:** All services validate required secrets at startup and fail safely if missing
- **Implementation:**
  - Check all required secrets present and non-empty
  - Test database/Redis connectivity
  - Exit with non-zero code if validation fails
  - Log which secrets missing (not the values)
- **Owner:** Holden, Naomi (service implementation)

**Security Review Requirements (Trigger Security Review Before Merge):**
1. Any change to network egress rules
2. Any new dependency addition
3. Any change to authentication/authorization logic
4. Any change to secrets handling
5. Any change to evidence storage
6. Any new API endpoint
7. Any adapter changes affecting data extraction

**Reviewer:** Amos (Security Engineer)

**Phase 1 (MVP) Requirements:**
- [ ] TLS everywhere
- [ ] API key authentication
- [ ] Basic rate limiting
- [ ] Parameterized queries
- [ ] Container isolation
- [ ] Startup validation
- [ ] No secrets in code

**Phase 2 (Production) Requirements:**
- [ ] Kill switches implemented
- [ ] SSO/MFA for admin
- [ ] Evidence retention policies
- [ ] Incident response plan
- [ ] Secret rotation capability

---

### Discovery Decisions (Naomi)

**Decision 1: UPRN Resolution Service Required**
- **Context:** Eastleigh requires UPRN-based endpoint; others may benefit
- **Options:**
  1. OS AddressBase Plus (most authoritative, license required)
  2. Third-party UPRN API (uprn.uk or paid service)
  3. Per-council postcode lookup scraping (fragile)
- **Recommendation:** Investigate OS AddressBase licensing
- **Impact:** Required for Eastleigh Phase 1; reusable across councils
- **Team Input Needed:** Licensing approach, budget decision

**Decision 2: Bartec Platform Pattern - Reusability Priority**
- **Context:** Fareham uses Bartec Collective (SOAP API); many UK councils use Bartec
- **Proposal:** Prioritize Bartec Phase 2 as reusable library
- **Investment Rationale:** SOAP client investment reusable; auth patterns applicable to other councils
- **Team Input Needed:** Formal partnership approach, broader UK support planned?

**Decision 3: New Forest & Southampton - Deprioritize**
- **Context:**
  - New Forest: 403 bot protection + phased 2026 rollout (unstable)
  - Southampton: Imperva protection (difficult access)
- **Proposal:** Postpone New Forest to Q4 2026; consider third-party service for Southampton
- **Rationale:** High maintenance vs. 11 other accessible councils
- **Team Input Needed:** Agreement to deprioritize? Third-party acceptable for Southampton?

**Decision 4: Browser Automation Infrastructure**
- **Context:** Winchester requires browser automation (React SPA)
- **Proposal:** Implement Playwright infrastructure
- **Considerations:** Cost (resource-intensive), maintenance complexity, caching essential
- **Question:** Build in Phase 1 or defer to Phase 4?

**Decision 5: PDF Parsing vs. HTML Scraping Trade-offs**
- **Context:** Some councils offer downloadable PDF calendars (East Hampshire, Gosport, Havant)
- **Proposal:** Build PDF parsing capability as alternative to HTML scraping
- **Advantages:** More stable, longer caching (365 days), reduces upstream load
- **Infrastructure:** PDF extraction library + date parsing + OCR fallback
- **Team Input Needed:** Priority vs. HTML-only approach?

**Decision 6: Form Automation Framework Investment**
- **Context:** 9 of 13 councils use HTML forms
- **Proposal:** Build reusable form framework in Phase 1 (Rushmoor implementation)
- **ROI:** Single framework supports 69% of Hampshire scope
- **Framework Components:** CSRF, cookie consent, session mgmt, sanitization, parsing, rate limiting, error handling
- **Team Input Needed:** Architecture review of framework design?

**Decision 7: Community Scraper Monitoring**
- **Context:** UKBinCollectionData (GitHub) has community-maintained scrapers
- **Proposal:** Monitor for implementations, early warning of site changes, alternative patterns
- **Question:** Contribute our adapters back to community? (Open source policy)
- **Team Input Needed:** Open source contribution strategy?

**Decision 8: Error Budget and Success Criteria**
- **Targets:**
  - Phase 1: <5% error rate (2 councils, clean patterns)
  - Phase 2: <5% error rate (4 councils, platform patterns)
  - Phase 3: <10% error rate (9 councils, HTML brittleness)
  - Overall: <10% aggregate across 11 councils
- **Definition of Error:** Failed acquisition (timeout, 403, 500, parse failure); excludes upstream downtime
- **Team Input Needed:** Are targets realistic given upstream brittleness?

**Decision 9: Evidence Capture and Raw Storage**
- **Context:** Platform charter requires raw evidence; council responses are untrusted input
- **Proposal:** Store all raw responses (HTML, JSON, XML, PDF) with metadata
- **Metadata:** Timestamp, council ID, request params, response status, headers, body
- **Use Cases:** Debug failures, compliance audit, upstream change detection, replay testing
- **Question:** Storage in PostgreSQL or S3/Blob Storage?
- **Team Input Needed:** Storage architecture decision (Drummer)?

**Decision 10: Rate Limiting and Good Citizen Policy**
- **Context:** No published council rate limits; must infer from response behavior
- **Proposal:**
  - Default: 1 request/2s per council
  - Browser Automation: 1 request/10s
  - Backoff: Exponential on 403/429 (10s, 20s, 40s, max 5min)
  - Circuit Breaker: 5 consecutive errors → pause for 1h
- **Monitoring:** Per-council error rates, adjust limits based on tolerance, alerting
- **Team Input Needed:** Conservative approach vs. faster throughput?

**Adapter Priority (RECOMMENDED):**
1. **Eastleigh** (Phase 1) — API-based, clean UPRN patterns
2. **Rushmoor** (Phase 1) — Form automation, framework test
3. **8 Form Councils** (Phase 3) — Apply framework

---

### Infrastructure Decisions (Drummer)

**Decision 1: Web Framework - Fastify → Hono**
- **Previous:** package.json specified Fastify
- **New Decision:** Hono replaces Fastify
- **Rationale:** TypeScript-first, security headers, Zod integration, smaller surface area
- **Trade-offs:** Smaller ecosystem than Express (sufficient); team learning curve
- **Note:** Aligns with Holden's ADR-002

**Decision 2: Database - PostgreSQL 16 on Azure Flexible Server**
- **Rationale:**
  - ACID guarantees for collection data
  - Spatial support for future lat/long queries
  - pg_trgm extension for fuzzy address matching
  - Azure Flexible Server better performance/HA than Single Server
- **Trade-offs:** Higher cost (acceptable); no built-in document storage (use JSONB)

**Decision 3: Evidence Storage - Azure Blob Storage with Immutability**
- **Rationale:**
  - Regulatory requirement (immutable evidence)
  - Cost-effective for large HTML/screenshot volumes
  - Lifecycle management for archival
  - Workload identity integration
- **Trade-offs:** Azurite local dev differences; latency for retrieval (acceptable, write-heavy)

**Decision 4: CI/CD Security Gates - Multi-Stage**
- **Gates:**
  1. Dependency scanning (npm audit + OWASP Dependency Check, fail on moderate+)
  2. Secret scanning (TruffleHog, verified secrets only)
  3. Container scanning (Trivy, fail on critical CVEs)
  4. Dockerfile linting (hadolint)
- **Trade-offs:** Longer CI times (~5-7 minutes); occasional false positives

**Decision 5: Docker Multi-Stage Builds**
- **Structure:** Separate builder and runtime stages
- **Benefits:**
  - Minimal runtime image (~150MB vs ~1GB)
  - No build tools/devDependencies in production
  - Non-root user (nodejs:1001)
  - Health checks baked in
- **Trade-offs:** Slightly longer build times (acceptable with BuildKit)

**Decision 6: Terraform Modular Structure**
- **Modules:** api, database, storage, networking per resource category
- **Benefits:** Reusable across environments; blast radius reduction; easier testing
- **Trade-offs:** More files to manage (mitigated by clear boundaries)

**Decision 7: Adapter Kill Switches via Environment Variables**
- **Rationale:** Rapid response to site changes or rate limiting; no deployment needed; auditable
- **Trade-offs:** 13+ environment variables; must coordinate with deployment

**Decision 8: Rate Limiting - Global + Per-Key with Redis**
- **Strategy:**
  - Global: 100 req/15min per IP
  - Per-key: Custom limits by API key tier
  - Redis: Distributed rate limiting
- **Trade-offs:** Redis dependency (acceptable); 1-2ms latency per request

---

---

## Phase 2 Decisions Captured

### Adapter Implementation Decisions (Naomi)

**D1: Eastleigh Response Format Discovery**
- Endpoint returns JSON with variations in field names
- Implementation: Permissive parser with multiple field name fallbacks
- Rationale: Upstream may change field names without notice

**D2: Rushmoor Browser Automation vs. XHR Discovery**
- Decision: Playwright browser automation with network interception
- Rationale: No obvious JSON endpoint visible; browser automation guarantees success
- Future optimization: Monitor network logs for XHR patterns, replace with direct HTTP if found

**D3: Evidence Storage — Blob Storage vs. Database**
- Decision: Azure Blob Storage with reference IDs in database
- Rationale: Responses can be large; blob storage cheaper for high-volume data; write-heavy workload
- Implementation: `{councilId}/{date}/{uuid}.{ext}` paths with lifecycle policies

**D4: Browser Adapter Base Pattern**
- Reusable BrowserAdapter base class with security hardening built-in
- Features: Domain allowlist, timeout enforcement, screenshot capture, HAR logging
- Impact: 50% code reduction for future browser adapters (8+ councils)

**D5: Kill Switch Implementation (Adapter Level)**
- Environment variable-based with three levels: global, per-adapter, registry-level
- Rationale: Meets SD-06 requirement (<60 seconds without deployment)
- Implementation: Checked at startup and per-request

**D6: Date Parsing — Multi-Format Support**
- Support ISO 8601, UK format (DD/MM/YYYY), day names, generic Date.parse()
- Rationale: Upstream formats vary by council
- Output: Normalized to ISO 8601 only

**D7: Adapter Metadata — AcquisitionMetadata Structure**
- Capture: attemptId, timestamps, resource usage, execution context, caching, adapter info
- Rationale: Enables detailed monitoring, debugging, and compliance audit
- Impact: ~500 bytes overhead per request

**D8: Service Type Mapping — Fuzzy Matching**
- Fuzzy substring matching to canonical ServiceType enum
- Examples: "Green bin" → GENERAL_WASTE, "Blue bin" → RECYCLING
- Rationale: Normalizes across all councils for API consumers

---

### Routing and Resolution Architecture Decisions (Holden)

**D1: Layered Property Resolution with Council Routing**
- Flow: Validate postcode → normalize → sanitise house identifier → check Hampshire boundary → resolve council(s) → query adapters (in parallel if overlap) → deduplicate → cache
- Hampshire overlaps: Hart/Rushmoor (GU11, GU12, GU14), Test-Valley/Eastleigh (SO51)
- Rationale: Handles boundary overlaps, multiple address matches, property identity persistence

**D2: Kill Switch Architecture (API Level)**
- Database table: `council_adapters.kill_switch_active`
- Checked before every adapter call in PropertyResolutionService
- Admin API endpoints: `POST /v1/admin/adapters/:id/disable|enable`
- Response time: <1 second to disable (database update + cache invalidate)

**D3: Auth Middleware Strategy**
- Role hierarchy: Public (IP rate-limited), Read (API key required), Admin (API key + admin role)
- API key storage: Hashed with bcrypt, cached 5 minutes in Redis
- Header support: `X-Api-Key` and `Authorization: Bearer`
- Future: JWT for admin service, MFA enforcement

**D4: Council Registry Seed Data**
- Database migration: 002_council_seed.sql
- 13 Hampshire councils with IDs, names, websites, adapter metadata
- Risk levels: Eastleigh/Fareham (low, API-based), Winchester (high, browser automation)
- Kill switches: All default to FALSE (enabled)

---

### Security Pattern Decisions (Amos)

**D1: Output Sanitisation (CRITICAL)**
- All adapter output fields MUST be HTML-escaped before returning
- Prevents XSS if malicious upstream HTML/JavaScript returned in display fields
- Enforcement: Phase 1 code review, Phase 2 automatic sanitisation layer (defence in depth)

**D2: State Isolation (CRITICAL)**
- Adapters MUST NOT store request-specific data in instance variables
- All state must be passed explicitly through method parameters
- Prevents data leakage between Request A and Request B
- Enforcement: Platform creates fresh adapter instances per request

**D3: Evidence Path Security (CRITICAL)**
- BREAKING CHANGE: Remove `storagePath` from `SourceEvidence` interface
- Platform MUST construct all evidence storage paths (not adapters)
- Prevents path traversal vulnerability
- Platform generates safe path: `evidence/{councilId}/{year}/{month}/{evidenceRef}.{type}`

**D4: Input Validation Contract**
- Platform MUST validate all inputs before calling adapter
- Contract: Postcode (UK format, max 8 chars), UPRN (numeric, max 12 digits), Address fragment (max 100 chars)
- Rationale: Prevents adapters from receiving malicious input
- Implementation: Validation middleware before adapter calls

**D5: Never Trust Upstream Content**
- All council responses are hostile until proven otherwise
- Required checks: Schema validation, malformed data rejection, parsing timeouts (30s), response size limits (10MB), HTML-escape before return
- Rationale: Council websites could be compromised or serve hostile content

**D6: No Secrets in Adapter Code**
- Council credentials MUST come from Key Vault (never hardcode URLs, tokens, session IDs)
- Enforcement: Pre-commit hooks + CI secret scanning
- Rationale: Maintains SD-01 (No Secrets in Code, Config, or Git)

**D7: Adapter Security Patterns — Code Review Checklist**
- Mandatory security tests: SQL injection, XSS sanitization, bot detection handling, kill switch behavior, evidence storage validation, secret redaction
- Integration tests: Concurrent requests (state leakage), malicious inputs, upstream anomalies
- Violations block merge

**D8: Enhanced Security Profile Interface**
- Add runtime limits: maxExecutionTimeSeconds, maxMemoryMb, maxConcurrentExecutions
- Add network requirements: allowedDomains, requiresTls
- Add privacy flags: processesPii, piiTypes, retentionDays
- Add monitoring: alertOnFailure, requiresManualReview
- Rationale: Platform reads profile and enforces at runtime

---

### Test Pattern Decisions (Bobbie)

**D1: Test-Before-Implementation for Phase 2**
- Tests written from specifications (interface contracts, discovery notes, OpenAPI schema) before implementation
- Benefits: Naomi and Holden work in parallel, tests validate contract not implementation, reduced rework
- Owner: Bobbie

**D2: 80% Coverage Minimum**
- Global: 80% lines, functions, statements; 75% branches
- Per-component: API routes 85%, core logic 90%, browser adapters 75%
- Higher thresholds for critical paths, lower for hard-to-test areas
- Owner: Bobbie

**D3: Security Tests Non-Negotiable**
- Security test suites cannot be skipped or disabled in CI
- Enforce SD-01 through SD-12 controls
- Violations block merge
- Owner: Amos, Bobbie

**D4: Mock-First, Real-Second**
- Unit/security tests use mocks (no real network calls)
- Integration tests can use real adapters (opt-in, not in CI)
- CI must be fast and reliable
- Real tests useful for smoke testing (not blocking merge)

**D5: Security Test Requirements**
- Input validation: SQL injection, XSS, path traversal, null bytes, Unicode normalization, excessive length, invalid format
- Output sanitization: HTML tag stripping, script execution prevention, event handler removal, SQL escaping
- Authentication: Missing key (401), invalid key (401), insufficient permissions (403), timing attack prevention, rate limiting, API key not echoed/logged

---

### Infrastructure Decisions (Drummer)

**D1: Multi-Layer Container Scanning Strategy**
- Trivy scans API and Worker images separately
- CRITICAL severity: Exit code 1 (blocks build)
- HIGH severity: Exit code 0 (warn, annotate PR, pass)
- Upload SARIF for both images to GitHub Security tab
- Cache Trivy DB between runs
- Rationale: Blocking on CRITICAL prevents deploying vulnerable containers; HIGH allows team judgment

**D2: Kill Switch Configuration as Code (Audit Job)**
- CI job validates: Every council has `ADAPTER_KILL_SWITCH_{ID}`, defaults to false in .env.example, no hardcoded values
- Builds FAIL if validation fails
- Rationale: Prevents accidentally deploying without kill switch capability

**D3: Branch Protection with 11 Required Status Checks**
- Main branch requires 11 checks to pass before merge
- Checks: lint-typecheck, unit-tests, integration-tests, security-tests, dependency-check, secrets-baseline, adapter-kill-switch-audit, build-and-scan-image, iac-scan, secret-scan, build
- No bypasses (including administrators)
- Automated setup script using GitHub CLI
- Rationale: Enforces security baseline on every PR

**D4: Network Policy Implementation — NSGs with Firewall Recommendation**
- API Service: NO internet egress (Database, Redis, Key Vault, monitoring only)
- Adapter Workers: Council URLs allowlist (13 domains), DB, Redis, Blob Storage only
- Database/Redis: NO outbound access
- Admin Service: VPN/Bastion inbound only, SSO outbound only
- Cloud metadata (169.254.169.254): Explicitly blocked
- LIMITATION: Azure NSGs support IP/port only, not domain-based filtering
- RECOMMENDATION: Deploy Azure Firewall for Phase 2 production (~$900/month) for FQDN filtering

**D5: Health Check Endpoints — Liveness vs. Readiness Separation**
- Three endpoints: `/health` (liveness, always 200), `/health/live` (explicit liveness, Kubernetes convention), `/health/ready` (readiness, checks DB+Redis, 503 if unavailable)
- Rationale: Orchestrator distinguishes "process crashed" from "dependencies unavailable"
- Benefit: Liveness failures restart; readiness failures remove from load balancer (prevents cascade)

**D6: Dockerfile Hardening**
- Remove npm/yarn/apk from runtime images (attack surface reduction)
- Add build args: BUILD_DATE, GIT_COMMIT
- Label images with git commit SHA and build timestamp
- Use wget for health checks (instead of node HTTP module)
- Add security labels: security.no-new-privileges=true
- Rationale: Immutable runtime images prevent tampering; git commit SHA enables tracing to source

**D7: detect-secrets Integration for Baseline Secret Scanning**
- Baseline file (.secrets.baseline) tracks known false positives
- CI blocks on new secrets not in baseline
- Workflow: `detect-secrets scan --baseline .secrets.baseline` to update
- Rationale: Reduces false positive noise; blocks secrets before merge (not just historical scan)

**D8: API Key Format — Platform-Specific**
- Changed from `sk_live_`/`sk_test_` (Stripe-like) to `hbp_live_`/`hbp_test_` (platform-specific)
- Reason: GitHub push protection blocked Stripe-like format
- Applied across: auth.ts, audit.ts, .env.example
- This is now the canonical key format for all API authentication

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- **Security Decisions (Amos):** MANDATORY and BLOCKING — violations prevent merge
- **Architecture Decisions (Holden):** Require team acknowledgment before Phase 1
- **Discovery Decisions (Naomi):** Require team discussion and input
- **Infrastructure Decisions (Drummer):** Ready for Phase 1 implementation
- **Test Decisions (Bobbie):** Non-negotiable for Phase 2 production readiness
