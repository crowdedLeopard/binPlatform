# Project Context

- **Owner:** crowdedLeopard
- **Project:** Hampshire Bin Collection Data Platform — a production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.
- **Stack:** TypeScript or Python, FastAPI or Node.js, PostgreSQL, Redis, Playwright (browser automation), Terraform/Bicep, Docker, OpenAPI
- **Created:** 2026-03-25

## Learnings
<!-- Append new learnings below. -->

### 2026-03-25: Security Architecture Package Complete

**Key Threats Identified:**

1. **Highest-risk threats** requiring immediate controls:
   - Supply chain compromise (npm/pip dependencies) — requires lockfile pinning, audit in CI, and dependency review
   - Browser automation escape (Playwright/Chromium vulnerabilities) — requires container isolation, seccomp profiles, and regular updates
   - SSRF via adapter redirects — requires egress allowlists and blocking of cloud metadata endpoints
   - Cross-adapter trust boundary failures — requires database row-level isolation and network segmentation

2. **Likely abuse patterns:**
   - Mass address enumeration by bots for data resale — API key authentication + rate limiting + anomaly detection required
   - Using platform as scraping proxy — cache-first responses, no user-triggerable upstream refresh
   - Admin account compromise — SSO with MFA mandatory, internal network only

3. **Upstream content is adversarial:**
   - Council websites could serve hostile HTML/JS (compromised or intentional)
   - Must never execute scraped content, must validate all extracted data against schema
   - Raw evidence must never be rendered without sanitization

**Critical Controls Established:**

1. **Network architecture:** Deny-all default, per-adapter egress allowlists, database/Redis never internet-accessible
2. **Secrets management:** Azure Key Vault with managed identity, no secrets in code/config/logs, rotation schedules defined
3. **Adapter isolation:** Each adapter in separate container, no shared credentials, separate blob storage paths
4. **Kill switch strategy:** Per-adapter and global kill switches, < 60 second activation, state preserved during disable
5. **Incident triggers:** 15 specific trigger conditions defined with severity and immediate actions

**Security Decisions Made:**

- Azure Key Vault selected as secrets store (HSM-backed, managed identity support)
- 90-day retention limit on raw evidence (privacy risk mitigation)
- Browser automation runs rootless with seccomp, no GPU, isolated container per session
- Admin service accessible only via internal network + VPN
- API keys hashed with pepper (bcrypt/argon2), constant-time comparison
- Break-glass procedures defined for emergency access

**Documents Produced:**
- `docs/threat-model/threat-model.md` — 25 specific threats catalogued with CVSS-style analysis
- `docs/threat-model/stride-assessment.md` — STRIDE for 10 major components
- `docs/threat-model/abuse-cases.md` — 20 abuse cases documented
- `docs/threat-model/data-classification.md` — 15 data types classified with retention policies
- `docs/threat-model/secrets-handling.md` — Complete secrets lifecycle design
- `docs/threat-model/network-policy.md` — Network segmentation and egress rules
- `docs/threat-model/security-controls.md` — 150+ controls checklist with owners and phases
- `docs/threat-model/incident-triggers.md` — 15 incident types with response procedures
- `docs/threat-model/kill-switch-strategy.md` — Per-adapter and global kill switch design

---

### 2026-03-25: Phase 2 Audit Logging & Security Event Infrastructure Complete

**Implementation Summary:**

Delivered complete Phase 2 security observability infrastructure for production readiness:

1. **Audit Logging System** (`src/observability/audit.ts`)
   - Structured audit trail for all privileged and security-relevant actions
   - 18 event types covering auth, adapters, abuse, admin, and security
   - IP anonymisation (IPv4 last octet zeroed, IPv6 last 80 bits zeroed)
   - PII-safe: never logs API keys, connection strings, full addresses
   - HMAC signing for tamper evidence (sequential event numbers)
   - Async logging pattern (never blocks request path)
   - SIEM transport injection point (ready for Azure Sentinel/Splunk integration)

2. **Security Event Storage** (`src/storage/db/security-events.ts`)
   - Write-through PostgreSQL persistence for queryable security events
   - Async writes (best-effort, never blocks)
   - Query API with flexible filtering (severity, type, council, date range)
   - Helper queries: critical events, per-council events, IP abuse lookup
   - Migration: `003_security_events.sql` with optimised indexes

3. **Injection Detection Middleware** (`src/api/middleware/injection-detection.ts`)
   - Detects SQL injection, XSS, path traversal, null bytes, CRLF injection
   - Pattern-based detection (configurable for production)
   - Blocks and logs as SECURITY_INJECTION_ATTEMPT (critical severity)
   - Returns generic 400 error (does not reveal detection logic)
   - Applied to all API endpoints before route handlers

4. **Enumeration Detection Middleware** (`src/api/middleware/enumeration-detection.ts`)
   - Sliding window tracking (15-minute window, 1-minute buckets)
   - Redis-backed distributed state
   - Soft block at 50 unique postcodes (artificial delay, 1-3s, degrades bot performance)
   - Hard block at 100 unique postcodes (15-minute ban)
   - Per-IP tracking with anonymised IP keys
   - Never reveals detection thresholds to attacker

5. **Admin Security Endpoints** (`src/api/routes/admin/security-events.ts`)
   - `GET /v1/admin/security/events` — Paginated query with filters
   - `GET /v1/admin/security/events/critical` — Critical events in last N hours
   - `GET /v1/admin/security/events/council/:councilId` — Per-council events
   - `GET /v1/admin/security/events/ip/:ip` — Abuse events for IP
   - `GET /v1/admin/security/stats` — Aggregated statistics
   - Ready for Holden to integrate into admin routes

6. **Adapter Security Review** (`docs/threat-model/adapter-security-review.md`)
   - Comprehensive security analysis of `CouncilAdapter` interface
   - **5 critical gaps identified:**
     - No output sanitisation enforcement → XSS risk
     - State leakage risk → No architectural isolation guarantee
     - Evidence path injection vulnerability → Storage path manipulation
     - Incomplete security profile → Missing runtime enforcement signals
     - No input validation contract → Trust boundary unclear
   - **Proposed ADR for interface enhancements** (for Holden's review)
   - **Security patterns all adapters must follow** (mandatory checklist)
   - Code review checklist for adapter PRs

**Security Patterns Established:**

- **IP anonymisation everywhere:** Last octet/80 bits zeroed before any storage/logging
- **Never log secrets:** API keys hashed, no connection strings, no full addresses
- **Tamper evidence:** HMAC signatures + sequential event numbers
- **Async writes only:** Security logging never blocks request path
- **Generic error responses:** Injection attempts get 400 without details (hide detection)
- **Soft blocking first:** Degradation before hard block (harder to detect)
- **Attack surface reduction:** Evidence paths controlled by platform, not adapters

**Integration Points for Holden:**

1. **Middleware registration:**
   ```typescript
   app.use('*', injectionDetection);
   app.use('/v1/postcodes/*', enumerationDetection);
   ```

2. **Admin routes:**
   ```typescript
   import { registerSecurityEventRoutes } from './routes/admin/security-events';
   registerSecurityEventRoutes(adminApp);
   ```

3. **Database client injection:**
   ```typescript
   import { setDatabaseClient } from './storage/db/security-events';
   setDatabaseClient(dbPool);
   ```

4. **Redis client injection:**
   ```typescript
   import { setRedisClient } from './api/middleware/enumeration-detection';
   setRedisClient(redis);
   ```

**Next Phase Actions:**

- **Holden:** Integrate middleware, admin routes, propose response to adapter interface ADR
- **Naomi:** Review adapter security patterns, apply to existing adapters
- **Drummer:** Run migration `003_security_events.sql`, configure SIEM transport
- **All:** No secrets in logs (audit logs are append-only, cannot be edited)

---

### 2026-03-25: Phase 3 Retention Enforcement + Security Event Admin View Complete

**Implementation Summary:**

Delivered complete Phase 3 data retention enforcement and incident management infrastructure:

1. **Retention Policy Engine** (`src/core/retention/policy.ts`)
   - Formal, configurable retention policy for all data types
   - Retention windows aligned to data classification matrix:
     - Raw evidence (HTML/JSON): 90 days
     - PDF evidence: 30 days
     - Screenshots: 7 days
     - Normalised collections: 365 days
     - Security events: 365 days
     - Audit logs: 730 days (2 years compliance)
   - Purge strategies: hard-delete-blob, soft-delete-db, archive-then-delete, revoke-on-expiry
   - Safety window: 7 days from cutoff (prevents accidental deletion)
   - Deployment grace period: 24h dry-run mode after deployment
   - Batch size limit: 1000 records per run (prevents long locks)
   - Audit logging: every purge logged before execution

2. **Retention Worker** (`src/workers/retention-worker.ts`)
   - Scheduled background worker (cron: daily at 2am)
   - Workflow: scan → audit log → purge in batches → log completion
   - Dry-run mode configurable via environment variable
   - Failure threshold: emit security event if purge failures >5%
   - Status API: check worker state, last run result, configuration
   - Integration point for cron scheduler (e.g., node-cron)

3. **Evidence Expiry Management** (`src/storage/evidence/expiry.ts`)
   - Set expiry metadata on evidence blobs at upload time
   - Query expired blobs by metadata (expiresAt < now)
   - Delete evidence with audit log entry (never silent deletion)
   - Batch delete with success/failure tracking per blob
   - Helper: calculate expiry date by evidence type
   - Abstract blob storage client interface (Azure Blob, S3, local filesystem)

4. **Azure Blob Lifecycle Policy** (`infra/terraform/modules/storage/lifecycle.tf`)
   - Evidence containers: tier to cool after 30 days, delete after 90 days
   - Screenshots: delete after 7 days (no tiering, short-lived)
   - PDF evidence: tier to cool after 15 days, delete after 30 days
   - Audit logs: tier to cool after 90 days, archive after 365 days, delete after 730 days
   - Security event archive: same as audit logs (2 year retention)
   - Platform-native (Azure-managed, no custom code)
   - Cost optimization: cool storage = 50% cost reduction

5. **Security Event Admin Dashboard** (`src/admin/security-dashboard.ts`)
   - Summary view for admin home page:
     - Critical events last 24h
     - Open incidents count
     - Adapters with anomalies
     - Abuse blocks today
     - Auth failures today
     - Injection attempts today
     - Enumeration blocks today
     - Retention purges due
   - Event filtering and pagination (severity, type, council, date range)
   - Abuse pattern detection: aggregates events by pattern, shows occurrences, unique IPs, affected councils
   - Adapter anomaly tracking: per-council security events with severity and occurrence count
   - Open incidents view with severity-based prioritization

6. **Incident Management** (`src/admin/incidents.ts`)
   - Lightweight incident tracking (not full ITSM)
   - Auto-creation triggers:
     - Adapter blocked 3+ times in 1 hour → high severity
     - Enumeration threshold hit → high severity
     - Critical security event → critical severity
     - Retention failure >5% → critical severity
     - Audit HMAC validation failure → critical severity
   - Status workflow: open → acknowledged → resolved
   - Acknowledge incident: sets acknowledged_by, acknowledged_at, notes
   - Resolve incident: sets resolved_by, resolved_at, resolution_notes
   - Audit logging for all incident state changes
   - Database schema: `007_incidents.sql` migration

7. **Updated Security Controls** (`docs/threat-model/security-controls.md`)
   - Phase 3 section added with implementation status
   - Data retention enforcement: ✅
   - Evidence expiry: ✅
   - Audit archival: ✅
   - Security event admin view: ✅
   - Incident management: ✅
   - Confidence-gated data serving: ⬜ (Phase 4)
   - Penetration testing: ⬜ (Phase 4)

**Design Decisions Made:**

1. **Soft delete with reversible window:** 7-day window before hard delete (protects against accidental deletion)
2. **Safety window:** Never purge data newer than cutoff - 7 days (conservative approach)
3. **Deployment grace period:** 24h dry-run mode after deployment (prevents immediate purge)
4. **Batch size limit:** Max 1000 records per run (prevents long locks, protects database performance)
5. **Audit logging:** Every purge logged BEFORE execution (compliance + transparency)
6. **Expiry metadata on upload:** Set expiresAt on every blob (explicit, queryable)
7. **Azure Blob lifecycle policies:** Platform-native deletion (cost optimization + reliability)
8. **Lightweight incident tracking:** Single table, simple workflow (no ITSM overkill)
9. **Auto-creation triggers:** Create incidents when patterns detected (automation + consistency)
10. **Simple status workflow:** Open → Acknowledged → Resolved (easy to understand, flexible)

**Security Patterns Established:**

- **Never purge security_events or audit_log without archiving first** (forensic capability)
- **Soft delete before hard delete** (reversible window for error recovery)
- **Safety window on all purges** (prevent accidental deletion of "just expired" data)
- **Audit every deletion** (compliance + transparency)
- **Batch processing** (prevent long locks, protect database performance)
- **Dry-run mode by default** (validate before actual deletion)
- **Auto-incident creation on patterns** (detect threats humans might miss)
- **Severity-based prioritization** (critical incidents surface first)

**Integration Points for Holden:**

1. **Retention scanner registration:**
   ```typescript
   const scanners = new Map();
   scanners.set('raw-evidence-html', new EvidenceBlobScanner('html'));
   scanners.set('normalised-collection', new DatabaseTableScanner('collections'));
   const engine = new RetentionPolicyEngine(scanners);
   const worker = await createRetentionWorker(engine, startScheduler: true);
   ```

2. **Admin API routes:**
   - `POST /v1/admin/retention/purge-expired` — Manual purge trigger
   - `GET /v1/admin/retention/status` — Worker status
   - `GET /v1/admin/security/summary` — Dashboard summary
   - `GET /v1/admin/incidents` — List open incidents
   - `POST /v1/admin/incidents/:id/acknowledge` — Acknowledge incident
   - `POST /v1/admin/incidents/:id/resolve` — Resolve incident

3. **Database clients:**
   ```typescript
   import { setDatabaseClient } from './admin/security-dashboard';
   import { setDatabaseClient as setIncidentDbClient } from './admin/incidents';
   setDatabaseClient(dbPool);
   setIncidentDbClient(dbPool);
   ```

4. **Blob storage client:**
   ```typescript
   import { setBlobStorageClient } from './storage/evidence/expiry';
   setBlobStorageClient(azureBlobClient);
   ```

**Integration Points for Drummer:**

1. **Run migration:** `007_incidents.sql`
2. **Deploy Terraform:** `infra/terraform/modules/storage/lifecycle.tf`
3. **Configure cron scheduler:** Run retention worker daily at 2am
4. **Set up monitoring alerts:** Retention failures, incident creation rate

**Integration Points for Naomi:**

1. **Set expiry metadata on evidence upload:**
   ```typescript
   await setEvidenceExpiry(blobRef, expiresAt, councilId, evidenceType);
   ```

**Next Steps:**

- **Holden:** Implement retention scanners (DB + blob), create admin API routes, test in staging
- **Drummer:** Run migration, deploy Terraform, configure cron, set up monitoring
- **Naomi:** Set expiry metadata on evidence upload, test in staging
- **Amos:** Monitor incidents in first week, tune thresholds, review retention policy after 30 days

**Production Readiness:**

- ✅ All code production-quality (error handling, logging, audit trails)
- ✅ Dry-run mode for safe testing
- ✅ Configurable via environment variables
- ✅ Batch processing to prevent long locks
- ✅ Audit logging for compliance
- ✅ Terraform for infrastructure-as-code
- ✅ Migration scripts for database schema
- ⬜ Cron scheduler integration (Holden/Drummer)
- ⬜ Monitoring alerts (Drummer)
- ⬜ Testing in staging environment (All)
