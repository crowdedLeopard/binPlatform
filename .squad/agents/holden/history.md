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
