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
