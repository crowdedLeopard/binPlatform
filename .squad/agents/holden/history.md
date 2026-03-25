# Project Context

- **Owner:** crowdedLeopard
- **Project:** Hampshire Bin Collection Data Platform — a production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.
- **Stack:** TypeScript, Hono, PostgreSQL, Redis, Playwright (browser automation), Terraform/Bicep, Docker, OpenAPI
- **Created:** 2026-03-25

## Learnings
<!-- Append new learnings below. -->

### 2026-03-25: Phase 0 Architecture Deliverables

**Key Decisions:**
- **TypeScript over Python** (ADR-001): Chosen for type safety at contract boundaries, native Playwright support, and single-language stack across API/workers/adapters.
- **Hono over Fastify/Express** (ADR-002): Modern TypeScript-first framework with built-in security headers, excellent Zod integration, and smaller attack surface. (Note: Drummer's bootstrap used Fastify; now updated to Hono per this decision.)
- **PostgreSQL + Redis + Blob Storage** (ADR-003): Three-tier architecture separating relational data, ephemeral cache/queues, and immutable evidence storage.
- **Worker Queue with Container Sandbox** (ADR-004): BullMQ for adapter orchestration with process isolation; containerised browser automation for high-risk scrapers.
- **Layered UPRN Resolution** (ADR-005): UPRN as canonical when available, with fallback to council local IDs and normalised addresses.

**Files Created:**
- `STRUCTURE.md` — Complete repository structure documentation
- `docs/adr/ADR-001-language-choice.md` through `ADR-005-property-identity.md`
- `src/adapters/base/adapter.interface.ts` — Canonical adapter contract (500+ lines)
- `src/core/domain/schema.json` — Full JSON Schema domain model
- `src/storage/postgres/migrations/001_initial_schema.sql` — PostgreSQL schema with partitioning
- `openapi.yaml` — OpenAPI 3.1 specification with 10+ endpoints
- `docs/architecture.md` — ASCII architecture diagrams
- `docs/threat-model/trust-boundaries.md` — 10 trust boundary definitions
- `docs/backlog.md` — 5-phase backlog with security gates

**Patterns Established:**
- All adapter results include `AcquisitionMetadata` for audit trail
- Evidence captured for every acquisition (HTML, screenshots, JSON)
- Security events separate from audit entries
- Database tables partitioned by time for collection_events, acquisition_attempts, security_events
- API key auth for public API, JWT for admin API
- Trust boundary documentation for each crossing

**Framework Alternative Note:**
Drummer's bootstrap defaulted to Fastify, but this decision moves to Hono as the primary framework. Hono provides better TypeScript-first design, built-in security headers via `secureHeaders()` middleware, and native Zod integration for request validation. Smaller attack surface compared to Express makes it preferable for a security-hardened platform.

### 2026-03-25: Phase 2 Property Resolution & Live API Routes

**Implementation Completed:**
- **Property Resolution Service** (`src/core/property-resolution/`):
  - Full layered resolution flow per ADR-005
  - Postcode validation, normalisation, and Hampshire boundary checking
  - Council routing with ambiguity handling (overlapping postcodes)
  - UPRN → council local ID → address hash fallback hierarchy
  - Input sanitisation (house identifier: max 50 chars, safe chars only)
  - Auto-resolution for single match, candidate list for multiple matches
  - Security: never logs full addresses (postcode prefix only), opaque UUIDs for property IDs

- **Postcode Utilities** (`postcode-utils.ts`):
  - UK postcode regex validation
  - Normalisation: uppercase, single space between outward/inward codes
  - Hampshire postcode map: 13 councils with prefix mappings
  - Overlap handling: Hart/Rushmoor (GU11, GU12, GU14), Test-Valley/Eastleigh (SO51)
  - Council resolution returns string or string[] for ambiguous cases

- **API Routes** (Hono-based):
  - **Councils** (`/v1/councils`):
    - `GET /v1/councils` - List all 13 councils with status (cache: 5min)
    - `GET /v1/councils/:councilId` - Council details with capabilities (public-safe)
    - `GET /v1/councils/:councilId/health` - Health status (no internal errors exposed)
  - **Properties** (`/v1/postcodes/:postcode/addresses`, `/v1/properties/:propertyId/*`):
    - `GET /v1/postcodes/:postcode/addresses` - Address resolution (rate limit: 10/min/IP, cache: 1h)
    - `GET /v1/properties/:propertyId/collections` - Collection events (cache: 4h)
    - `GET /v1/properties/:propertyId/services` - Collection services (cache: 24h)
  - **Admin** (`/v1/admin/adapters`):
    - `GET /v1/admin/adapters` - List with sensitive details (admin-only)
    - `POST /v1/admin/adapters/:councilId/disable` - Kill switch enable (audit logged)
    - `POST /v1/admin/adapters/:councilId/enable` - Kill switch disable (audit logged)

- **Auth Middleware** (`src/api/middleware/auth.ts`):
  - API key extraction from `X-Api-Key` or `Authorization: Bearer` headers
  - Role-based access control: public, read, admin
  - Public endpoints: no key required (IP rate-limited)
  - Read endpoints: valid API key required
  - Admin endpoints: admin role required
  - Keys stored as bcrypt hashes in database (not yet wired)
  - 5-minute cache for validated keys (Redis)

- **Error Handling** (`src/api/errors.ts`):
  - Standardised error response format: `{ error: { code, message, requestId, details } }`
  - Error codes: INVALID_POSTCODE, POSTCODE_NOT_HAMPSHIRE, PROPERTY_NOT_FOUND, ADAPTER_UNAVAILABLE, ADAPTER_DISABLED, RATE_LIMITED, UNAUTHORIZED, FORBIDDEN, INTERNAL_ERROR
  - Safe error factory functions (never expose stack traces, internal IDs, connection strings)
  - Secure logging: redacts secrets, logs postcode prefix only (not full postcode), never logs addresses

- **Database Migration** (`002_council_seed.sql`):
  - Seeded all 13 Hampshire councils with metadata
  - `council_adapters` table for kill switches, risk levels, last health check
  - Initial metadata: lookup methods, required inputs, confidence scores, upstream risk levels
  - Eastleigh/Fareham marked as API-based (high confidence), Winchester as browser automation (lower confidence)
  - Kill switches default to `FALSE` (all enabled)

**Security Patterns Enforced:**
- **Input Validation**: Strict UK postcode regex before any processing; house identifier sanitised (HTML stripped, alphanumeric + safe punctuation only)
- **Rate Limiting**: Expensive operations (address lookup) flagged for upstream enforcement
- **Opaque IDs**: Property IDs are UUIDs (unguessable), never expose council internal IDs to clients
- **Logging Safety**: Postcode prefix logged only; full addresses/UPRNs never in logs
- **Error Safety**: Error responses never leak internal details, stack traces, file paths

**Routing Architecture Decisions:**
- Hampshire postcode overlaps handled by querying multiple adapters and deduplicating by UPRN or address
- Ambiguous councils (e.g., Hart/Rushmoor) trigger parallel adapter calls
- Deduplication prefers UPRN (canonical) over normalised address
- Single-result auto-resolution reduces friction; multi-result returns candidates for user selection
- Property caching: 24h TTL in Redis for resolved properties (not yet implemented - database/Redis TODO)

**TODOs Identified:**
- Redis cache integration for property resolution, API key validation, council health checks
- Database queries for property lookup (by ID, UPRN, council local ID, address)
- Kill switch state checks in PropertyResolutionService
- Rate limiting middleware implementation (per-IP, per-key)
- API key database schema and bcrypt comparison logic
- Audit event table writes for kill switch operations

### 2026-03-25: Phase 3 Confidence Scoring + Admin Dashboard Data Layer

**Implementation Completed:**
- **Confidence Scoring System** (`src/core/confidence/`):
  - Weighted multi-factor scoring: method (35%), freshness (25%), validation (25%), health (15%)
  - Method base scores: API=1.0, hidden_json=0.95, html_form=0.85, browser=0.75, pdf=0.7
  - Freshness decay curves per method (API fresh 4h, PDF fresh 24h, then linear decay)
  - Named thresholds: CONFIRMED (≥0.8), LIKELY (≥0.6), UNVERIFIED (≥0.4), STALE (<0.4)
  - Multiplicative penalties: partial_data (-15%), stale_cache (-10%), parse_warnings (-5% each)
  - Full `ConfidenceAssessment` with score, level, factors, component scores, and penalties
  - `computeConfidence()` main engine, `calculateFreshnessScore()`, `interpretConfidenceScore()`

- **Drift Detection System** (`src/core/drift/`):
  - Schema snapshot inference from parsed results (field paths, types, ranges, patterns)
  - Drift comparison: new_fields, missing_fields, type_change, value_range_change
  - Severity classification: minor (log), major (review), breaking (fail acquisition)
  - Recommendation engine: log_and_continue, flag_for_review, fail_acquisition
  - `DriftDetector` interface with `detectDrift()` and `recordSnapshot()`
  - `InMemoryDriftDetector` implementation (production: PostgreSQL-backed)
  - Schema snapshot merging for multi-sample accuracy
  - Breaking drift triggers SECURITY_SCHEMA_MISMATCH audit events

- **Admin Dashboard Data Layer** (`src/admin/`):
  - **Dashboard stats** (`dashboard.ts`):
    - `getDashboardStats()`: total councils, active/degraded/disabled adapters, today's acquisitions, success rate, avg confidence, pending drift alerts, open security events
    - `getAdapterStatusSummary()`: per-council grid with status, kill switch, 7d success rate, last success/failure, confidence
    - `getRecentAcquisitions()`: last N acquisitions with council, timestamp, duration, success, confidence
    - `getConfidenceDistribution()`: histogram of confirmed/likely/unverified/stale counts
  - **Adapter health** (`adapter-health.ts`):
    - `getAdapterHealthSummary()`: aggregated health across all councils with latency, drift alert counts
    - `getAdapterHealthDetail()`: deep dive per adapter with recent attempts, drift events, capabilities
  - **Evidence retention** (`retention.ts`):
    - `getEvidenceRetentionStats()`: total files, size, expired count, retention window
    - `getExpiredEvidence()`: query files older than retention window
    - `markEvidenceForDeletion()`: soft-delete marking (actual purge is async)
    - `purgeExpiredEvidence()`: async job to delete from blob storage + DB cleanup

- **Admin API Routes** (extended `src/api/routes/admin.ts`):
  - `GET /v1/admin/dashboard` → `DashboardStats`
  - `GET /v1/admin/adapters/health` → `AdapterHealthSummary[]`
  - `GET /v1/admin/drift-alerts` → Recent drift events with severity, affected fields
  - `POST /v1/admin/drift-alerts/:alertId/acknowledge` → Mark drift alert as reviewed (audit logged)
  - `GET /v1/admin/retention/stats` → Evidence retention statistics
  - `POST /v1/admin/retention/purge-expired` → Queue async purge job (returns job ID)

- **Database Migrations**:
  - **004_schema_snapshots.sql**: `schema_snapshots` table with JSONB fields, version, active flag
  - **005_drift_alerts.sql**: `drift_alerts` table with drift_type, severity, recommendation, affected_fields, acknowledged flag
  - **006_confidence_log.sql**: `confidence_log` table for time-series confidence tracking per property/council with factors, component scores, penalties

- **ADR-006: Confidence Scoring Design**:
  - Decision: Weighted multi-factor numeric score over boolean flag or multi-dimensional score
  - Rationale: Single authoritative score enables filtering, retention policies, and drift detection
  - Security implication: Low-confidence data must never be presented as authoritative
  - Weights chosen: method (35%), freshness (25%), validation (25%), health (15%)
  - Named thresholds communicate reliability clearly to users

**Patterns Established:**
- Confidence scoring is **mandatory** for all `CollectionEventResult` objects
- `ConfidenceFactors` breakdown provides transparency and audit trail
- Drift detection runs on every acquisition; breaking drift fails the acquisition
- Schema snapshots stored in PostgreSQL for persistence and historical analysis
- Admin dashboard queries are **read-only** aggregations (no state mutations except acknowledge/purge)
- Evidence purge is **async job** (BullMQ) not synchronous API call
- All admin operations are **audit logged** (drift acknowledgment, purge initiation)

**Security Considerations:**
- Confidence scores prevent presenting unreliable data as authoritative
- Drift alerts of severity 'breaking' trigger security events (SECURITY_SCHEMA_MISMATCH)
- Evidence retention keyed to confidence: high confidence (90d), low confidence (180d for debugging)
- Schema snapshots enable forensic analysis of upstream changes
- Admin endpoints require `admin` role (enforced by auth middleware)
- Purge operations logged and require explicit admin initiation

**TODOs for Phase 4:**
- Wire admin dashboard queries to PostgreSQL (currently stub implementations)
- Implement BullMQ job queue for evidence purge
- Add Redis caching for dashboard stats (5min TTL)
- Create admin UI components consuming these endpoints
- Implement drift alert notification system (email/Slack for breaking drift)
- Add confidence score trending charts (track degradation over time)
- Implement automatic re-acquisition when confidence drops below STALE threshold
