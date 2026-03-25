# Project Context

- **Owner:** crowdedLeopard
- **Project:** Hampshire Bin Collection Data Platform — a production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.
- **Stack:** TypeScript or Python, FastAPI or Node.js, PostgreSQL, Redis, Playwright (browser automation), Terraform/Bicep, Docker, OpenAPI
- **Created:** 2026-03-25

## Learnings
<!-- Append new learnings below. -->

### 2026-03-25 - Repository Bootstrap
**Stack Decisions:**
- **Framework:** Fastify (chosen over Express for performance, schema validation, and TypeScript-first design)
- **Database:** PostgreSQL 16 with Flexible Server on Azure
- **Cache:** Redis 7 with distributed rate limiting support
- **Storage:** Azure Blob Storage for evidence (Azurite for local dev)
- **ORM:** pg driver with raw SQL (considered drizzle-orm for future migration)
- **Validation:** Zod for runtime schema validation
- **Testing:** Vitest for unit, integration, and security tests
- **IaC:** Terraform with modular structure for Azure resources

**Key Infrastructure Patterns:**
- Multi-stage Docker builds: builder + runtime with non-root user
- Docker Compose for local dev with health checks on all services
- Separate Dockerfile.worker for Playwright-based adapters
- GitHub Actions CI with parallel jobs for lint, test, security scans
- Dependency scanning (npm audit + OWASP Dependency Check)
- Secret scanning (TruffleHog)
- Container scanning (Trivy with SARIF upload to GitHub Security)
- Hadolint for Dockerfile linting

**Security Patterns:**
- @fastify/helmet for security headers (CSP, HSTS, X-Frame-Options, etc.)
- @fastify/rate-limit with Redis store for distributed rate limiting
- API key authentication with bcrypt hashing (cost 12)
- RBAC with read/write/admin roles
- Structured logging with Pino (sensitive field redaction)
- Non-root containers with read-only filesystem hints
- Network isolation for Playwright adapters
- Evidence immutability with blob storage

**CI/CD Gates:**
- Lint and typecheck (ESLint + TSC)
- Unit tests (Vitest)
- Integration tests (with Postgres + Redis services)
- Security tests (dedicated test suite)
- Dependency vulnerability scan (fail on moderate+)
- Secret scan (TruffleHog with verified secrets only)
- Dockerfile lint (hadolint)
- Container image scan (Trivy, fail on critical)

**Configuration Management:**
- All secrets via environment variables
- .env.example with comprehensive documentation
- Feature flags for adapter kill switches
- Separate config for dev/test/prod environments
- Graceful shutdown with configurable timeout

**Database Design:**
- Normalised schema with audit trail
- UUID primary keys for properties and collections
- String IDs for councils (human-readable)
- pg_trgm extension for fuzzy address search
- Audit log table with JSONB metadata
- Adapter execution tracking
- Updated_at triggers on mutable tables

**Adapter Architecture:**
- Base adapter interface with metadata, health check, cleanup
- BaseAdapter abstract class with common functionality
- Registry pattern for adapter lookup and lifecycle
- Kill switch per council via environment variables
- Evidence storage with blob references
- Metrics recording for adapter execution
