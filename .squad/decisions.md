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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
- **Security Decisions (Amos):** MANDATORY and BLOCKING — violations prevent merge
- **Architecture Decisions (Holden):** Require team acknowledgment before Phase 1
- **Discovery Decisions (Naomi):** Require team discussion and input
- **Infrastructure Decisions (Drummer):** Ready for Phase 1 implementation
