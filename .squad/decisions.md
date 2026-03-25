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

## Phase 3 Decisions

### Adapter Implementation (Naomi)

**Decision 1: Bartec Base Adapter Pattern**
- **Status:** Implemented
- **Scope:** Fareham Borough Council (Bartec Collective SOAP/XML API)
- **Pattern:** `BartecBaseAdapter` abstract base class with Fareham-specific extension
- **Components:** SOAP envelope construction, XML parsing (`fast-xml-parser`), service code mappings, fault handling
- **Rationale:** Enables 50% code reduction for future Bartec councils, centralizes SOAP/XML logic
- **Risk:** If Bartec varies significantly between councils, base may need abstraction layers
- **Strategic Value:** High reusability across UK council estate

**Decision 2: PDF Calendar Base Adapter Pattern**
- **Status:** Implemented
- **Scope:** East Hampshire District Council (PDF calendar system)
- **Pattern:** `PdfCalendarBaseAdapter` abstract base class with EH-specific mappings
- **Components:** Secure PDF download, text extraction (`pdf-parse`), multi-format date matching, service type inference
- **Rationale:** Enables 60% code reduction for Gosport and Havant (also use PDF calendars)
- **Security:** Centralized PDF validation (domain, size, content-type)
- **Limitation:** Requires text-based PDFs; OCR deferred for future

**Decision 3: Bartec Service Code Mapping (Fuzzy)**
- **Strategy:** Fuzzy mapping with warnings for unknown codes
- **Mapping:** RES/REFUSE/RESIDUAL → general_waste, REC/RECYCLE → recycling, GW/GARDEN → garden_waste, etc.
- **Handling:** Unknown codes map to `other` and log warning (early alert for schema drift)
- **Rationale:** Handles variance between Bartec implementations, graceful degradation

**Decision 4: PDF Service Type Inference from Context**
- **Method:** Keyword-based context analysis (200 chars before/after each date)
- **Confidence:** 0.75 (vs 0.9+ for API data) — reflects uncertainty in PDF parsing
- **Extensibility:** Can add ML classifier later if needed
- **Risk:** Calendar redesigns may break keyword matching

**Decision 5: XML Parsing Library (`fast-xml-parser`)**
- **Choice:** `fast-xml-parser` over alternatives (DOM, xml2js, manual regex)
- **Security:** No script execution risk, namespace handling, configurable attributes
- **Performance:** Fast parsing (name accurate), good TypeScript support
- **Trade-off:** Requires schema knowledge (less self-documenting than JSON)

**Decision 6: PDF Parsing Library (`pdf-parse`)**
- **Choice:** `pdf-parse` for server-side text-only extraction
- **Security:** No rendering engine, no JavaScript execution in PDFs
- **Limitation:** Text-only (OCR deferred for image-based PDFs)
- **Assumption:** East Hampshire PDFs remain text-based

**Decision 7: Aggressive PDF Caching (12-Hour TTL)**
- **TTL:** 12 hours for PDF calendars (vs 7 days for collection schedules)
- **Rationale:** PDFs 1-5MB, change infrequently (annual/semi-annual); 12h ensures twice-daily checks
- **Trade-off:** Users see stale data for up to 12h if calendar updated mid-period
- **Alternative:** ETags/If-Modified-Since deferred

**Decision 8: Postcode-to-Area Static Lookup with Dynamic Fallback**
- **Primary:** Static lookup table for common postcodes (GU30-GU35)
- **Fallback:** Placeholder for dynamic browser automation (not yet implemented)
- **Coverage:** Static table covers 90%+ of cases
- **Rationale:** Pragmatic for common postcodes; extensible for edge cases

---

### Confidence Scoring + Admin Dashboard (Holden)

**Decision 1: Weighted Multi-Factor Confidence Score (0.0–1.0)**
- **Formula:** `confidence = (method_score × 0.35) + (freshness_score × 0.25) + (validation_score × 0.25) + (health_score × 0.15)`
- **Penalties:** Partial data (×0.85), stale cache (×0.90), parse warnings (×(1.0 - 0.05 × warning_count))

**Method Score Weights:**
- API: 1.0 (structured, stable)
- Hidden JSON: 0.95 (discovered endpoint)
- HTML Form: 0.85 (form submit, fragile)
- Browser Automation: 0.75 (high fragility)
- PDF Calendar: 0.7 (OCR/parse, error-prone)
- Unknown: 0.3 (unvalidated)

**Freshness Decay:**
- API/HTML/Browser: Fresh 4h, then -2.5%/hr decay, min 0.2
- PDF/Calendar: Fresh 24h, then -1.5%/hr decay, min 0.2
- Rationale: Calendars change less frequently than real-time APIs

**Named Thresholds:**
- CONFIRMED (≥0.8): Display as "confirmed"
- LIKELY (≥0.6): Display as "likely"
- UNVERIFIED (≥0.4): Display as "unverified"
- STALE (<0.4): Trigger re-acquisition

**Decision 2: Schema Snapshot Inference for Drift Detection**
- **Capture:** For every successful acquisition, store schema snapshot with:
  - Field paths (e.g., `events[].collectionDate`)
  - Detected types, required flag, array flag, sample values
  - Numeric ranges, string patterns
- **Versioning:** Each snapshot tracked with version number

**Drift Classification:**
- **New fields:** Log and continue
- **Missing fields:** Flag for review, notify admin
- **Type changes / missing required fields:** Fail acquisition, log security event (SECURITY_SCHEMA_MISMATCH)

**Drift Response:**
1. Fail acquisition immediately
2. Log `SECURITY_SCHEMA_MISMATCH` security event
3. Create drift alert with recommendation
4. Admin reviews, acknowledges after investigation
5. If fixed: schema snapshot updated, acquisitions resume
6. If broken: kill switch activated

**Decision 3: Admin Dashboard Data Layer**
- **Dashboard Stats:** Total councils, adapter health, acquisition success rate, avg confidence, pending drift alerts, open security events (5min TTL cache)
- **Adapter Health:** Per-adapter roll-up with kill switch state, 7d success rate, latency, confidence, drift alerts
- **Confidence Distribution:** Histogram (confirmed/likely/unverified/stale counts)
- **Evidence Retention:** Total size, expired files, last purge timestamp

**Decision 4: Evidence Retention Policy**
- **High-confidence:** 90d retention
- **Low-confidence:** 180d retention (for debugging)
- **Async purge:** BullMQ job runs weekly
- **Admin capability:** Manual purge trigger

---

### Testing Strategy (Bobbie)

**TP-001: XML/SOAP Test Fixtures with Raw Imports**
- **Pattern:** Use `?raw` suffix to preserve exact XML structure, whitespace, encoding
- **Benefit:** Realistic SOAP fault testing, validates parser behavior
- **Impact:** Vite/TypeScript must support `?raw` imports, more verbose fixtures

**TP-002: PDF Adapter Testing with Mock Buffers**
- **Pattern:** Use `Buffer.from()` for mock PDF data, no actual PDF files
- **Rationale:** Real PDFs bloat test fixtures (>100KB each); adapter tests focus on validation logic, not PDF library
- **Benefit:** Fast test execution, no file I/O

**TP-003: Confidence Score Determinism**
- **Requirement:** Same inputs must always produce same output
- **Enforcement:** No randomness, no `Date.now()` in calculation
- **Benefit:** Reproducible scores, reliable threshold-based decisions

**TP-004: Drift Detection Audit Logging**
- **Requirement:** All drift events (minor/major/breaking) logged to audit trail
- **Rationale:** Historical drift patterns inform maintenance priorities, compliance requirement
- **Volume:** ~5-10 drift events per adapter per month expected

**TP-005: Synthetic Monitor Safety Isolation**
- **Pattern:** Synthetic checks run in isolated worker with separate rate limit quota
- **Rationale:** Failures must not block production user requests, upstream rate limits protected
- **Implementation:** Separate BullMQ queue, separate Redis rate limit keys, `isSynthetic: true` flag

**Synthetic Check Frequencies:**
- Liveness: 5 minutes (MTTD <5min)
- Freshness: 30 minutes
- Canary: 2 hours
- Confidence Trend: 1 hour

**Alert Escalation:**
1. Single failure: Log only
2. 2 consecutive failures: Increment counter, log warning
3. 3 consecutive failures: Mark degraded, notify on-call
4. Upstream unreachable: Immediate notification

**Test Postcode Selection:**
- Use actual postcodes (not synthetic)
- Avoid residential properties (use council offices, public buildings)
- Rotate quarterly (prevent synthetic detection)

---

### Retention Policy & Incident Management (Amos)

**Decision 1: Retention Windows by Data Type**
- raw-evidence-html: 90 days, hard-delete-blob
- raw-evidence-json: 90 days, hard-delete-blob
- raw-evidence-pdf: 30 days, hard-delete-blob
- raw-evidence-screenshot: 7 days, hard-delete-blob
- normalised-collection: 365 days, soft-delete-db
- acquisition-attempt: 90 days, soft-delete-db
- security-event: 365 days, archive-then-delete
- audit-log: 730 days, archive-then-delete
- user-input-log: 30 days, hard-delete-db
- api-key: null (active), 90 days (revoked), revoke-on-expiry

**Trade-offs:**
- Storage cost vs. debug capability: 90 days for evidence
- Privacy vs. forensics: 365 days for security events
- Compliance vs. cost: 730 days for audit (compliance wins)

**Decision 2: Soft Delete with 7-Day Reversible Window**
- **Process:** Mark as deleted but don't physically remove
- **Reversal:** Records can be recovered within 7 days
- **Rationale:** Protects against accidental deletion, industry standard pattern
- **Implementation:** UPDATE with `deleted_at`, then hard DELETE after 7 days

**Decision 3: Safety Window (7 Days from Cutoff Date)**
- **Rule:** Never purge data newer than `cutoff_date - 7 days`
- **Rationale:** Prevents accidental deletion just after expiry, protects against clock skew
- **Example:** 90-day retention → actual cutoff 97 days ago

**Decision 4: Deployment Grace Period (24-Hour Dry-Run)**
- **Default:** Dry-run mode enabled for first 24 hours post-deployment
- **Rationale:** Prevents immediate purge after misconfiguration
- **Override:** Admin can force purge with `force: true` flag

**Decision 5: Batch Size Limit (1000 Records per Run)**
- **Rationale:** Prevents long database locks, allows concurrent operations
- **Trade-off:** Multiple runs OK (job runs daily)

**Decision 6: Evidence Expiry Metadata in Blob Storage**
- **Pattern:** Set `expiresAt` metadata on upload
- **Benefit:** Queryable, enables lifecycle policies, platform-agnostic
- **Metadata:** expiresAt, councilId, evidenceType, uploadedAt

**Decision 7: Azure Blob Lifecycle Policy**
- **Evidence:** Tier to cool after 30 days, delete after 90 days
- **Screenshots:** Delete after 7 days (no tiering)
- **Audit logs:** Tier cool 90d, archive 365d, delete 730d
- **Benefit:** Cost optimization + automatic deletion (Microsoft-managed)

**Decision 8: Lightweight Incident Tracking**
- **Scope:** Security incidents only (not general IT)
- **Schema:** Single table with id, type, severity, status, trigger_event_id
- **Status Workflow:** Open → Acknowledged → Resolved
- **Rationale:** Simplicity, speed, flexibility

**Auto-Creation Triggers:**
1. Adapter blocked 3+ times in 1h → `adapter_blocked_repeated` (high)
2. Enumeration threshold hit → `enumeration_threshold_hit` (high)
3. Critical security event → `critical_security_event` (critical)
4. Retention purge failure >5% → `retention_failure` (critical)
5. Audit HMAC failure → `audit_hmac_failure` (critical)

---

### Monitoring Stack & Alerting (Drummer)

**Decision 1: Separate Monitor Container (Not Sidecar)**
- **Architecture:** Dedicated `deploy/Dockerfile.monitor` for synthetic checks
- **Isolation:** Monitor failures don't affect API/worker
- **Scalability:** Can scale independently, lower resource needs
- **Network:** Outbound-only, no exposed ports (smaller attack surface)

**Decision 2: Process-Based Health Check**
- **Method:** `pgrep -f "synthetic-monitor"` instead of HTTP endpoint
- **Rationale:** Monitor is outbound-only; process check sufficient
- **Benefit:** No HTTP server overhead

**Decision 3: Separate Observability Compose File**
- **File:** `docker-compose.observability.yml` separate from main compose
- **Opt-in:** Developers can run app without full stack
- **Benefit:** Lightweight local dev by default, flexibility for production (Azure Monitor)
- **Usage:** `docker-compose -f docker-compose.yml -f docker-compose.observability.yml up`

**Decision 4: Metrics Endpoint (Internal Network Only)**
- **Access:** IP-restricted to internal subnet, NEVER public
- **Security:** Metrics may leak system internals
- **Implementation:** API route with allowlist middleware, Azure Firewall rules
- **Never expose:** Software versions, internal IPs, connection strings, secrets, detailed errors

**Decision 5: Prometheus + Azure Monitor (Both)**
- **Local Dev:** Prometheus for instant feedback
- **Production:** Azure Monitor for enterprise features (long-term storage, alerting, integration)
- **Metrics:** Same Prometheus client library, different backends
- **Cost:** Free local, billed by ingestion on Azure

**Decision 6: Alert Severity with Grace Periods**
- **Critical:** 0-5 min grace, 5 min repeat (breaking drift, adapter unavailable)
- **Warning:** 15-30 min grace, 3 hour repeat (confidence degraded, high latency)
- **Inhibition:** Adapter unavailable → suppress confidence alerts; council down → suppress all adapter alerts

**Decision 7: Synthetic Check Canary Postcodes**
- **Pattern:** One representative postcode per council, environment-configured
- **Selection:** Real, stable addresses (not test data); exercise typical paths
- **Environment:** Different canaries for dev/staging/prod
- **Management:** Version-controlled in environment config

**Decision 8: Breaking Drift Response SLA (15 Minutes)**
- **Procedure:** Enable kill switch within 15 minutes of detection
- **Phases:** 0-15m (kill switch), 15-30m (assess), 30-90m (RCA), 1-24h (fix)
- **Rationale:** Prevent bad data, show "unavailable" instead of wrong dates
- **Escalation:** After 24h → incident manager

**Decision 9: Terraform Monitoring Module**
- **Structure:** Separate `infra/terraform/modules/monitoring` module
- **Benefit:** Reusable, testable independently, clear boundaries
- **Outputs:** Instrumentation keys (from Key Vault), workspace IDs, action group ID

**Decision 10: Runbook Documentation**
- **Scope:** Two runbooks (synthetic-monitoring, drift-response)
- **Structure:** Overview, step-by-step, decision trees, escalation
- **Maintenance:** Quarterly review, update after incidents, test in game days

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
