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

### 2026-03-25 - Phase 2 CI Hardening and Infrastructure Security

**Kill Switch Enforcement:**
- CI job `adapter-kill-switch-audit` validates kill switch configuration
- Automated verification script (`scripts/ci/verify-kill-switches.js`)
- Checks every council has corresponding environment variable
- Prevents hardcoded kill switch values in Dockerfiles
- Ensures adapters read from environment, not config files

**Container Scanning (Trivy):**
- Cache Trivy DB between CI runs for performance
- Scan both API and Worker images separately
- SARIF output to GitHub Security tab for both images
- CRITICAL vulnerabilities block build (exit code 1)
- HIGH vulnerabilities warn but pass (annotated in PR)
- Build args for git commit SHA and build date labeling

**Secrets Baseline (detect-secrets):**
- Python-based detect-secrets integration
- Baseline file `.secrets.baseline` tracks known false positives
- CI blocks on new secrets detected
- Auto-creates baseline on first run if missing

**OWASP Dependency Check:**
- npm audit at HIGH level (blocks on high/critical)
- OWASP Dependency Check with CVSS threshold 7.0
- SARIF format uploaded to GitHub Security tab
- Retired/experimental checks enabled for comprehensive coverage

**Infrastructure as Code Scanning (tfsec):**
- Scans all Terraform in `infra/terraform/`
- Minimum severity HIGH (blocks build)
- SARIF output to GitHub Security tab
- Validates against Terraform/Azure security best practices

**Dockerfile Hardening:**
- Build arguments for BUILD_DATE and GIT_COMMIT labels
- Remove package managers (npm/yarn) from runtime images
- wget for health checks (instead of node HTTP module)
- Explicit EXPOSE declarations
- Security labels: no-new-privileges, seccomp profiles
- Remove apk tools after installation (defense in depth)
- Separate /tmp/playwright directory ownership for workers

**Health Check Endpoints:**
- `/health` - Liveness probe (process alive)
- `/health/live` - Explicit liveness (Kubernetes-style)
- `/health/ready` - Readiness probe (checks DB + Redis connectivity)
- Returns 200 OK if healthy, 503 if dependencies unavailable
- NEVER exposes: versions, internal IPs, connection strings, secrets
- TypeScript implementation in `src/api/routes/health.ts`

**Docker Compose Health Checks:**
- API: wget-based HTTP check on /health endpoint
- PostgreSQL: pg_isready with environment variable interpolation
- Redis: redis-cli ping with password authentication
- Proper intervals, timeouts, retries, start_period for each service

**Branch Protection Enforcement:**
- Comprehensive documentation in `docs/runbooks/branch-protection.md`
- Automated setup script `scripts/setup-branch-protection.sh`
- Uses GitHub CLI to apply rules programmatically
- Required checks: 11 CI jobs must pass before merge
- Pull request reviews: 1 approval minimum, dismiss stale reviews
- Enforce admins: No bypassing rules, even for administrators
- Restrict direct pushes to main (PRs only)

**Network Policy Implementation (Terraform):**
- Deny-by-default Network Security Groups for all subnets
- API Service: NO internet egress (Database, Redis, Key Vault, Monitoring only)
- Adapter Workers: Allowlist-based egress to council URLs only
- Database: NO outbound access at all
- Redis: NO outbound access at all
- Admin Service: VPN/Bastion inbound only, SSO outbound only
- Cloud metadata endpoint (169.254.169.254) explicitly blocked
- Council egress allowlist in `infra/terraform/modules/networking/egress-allowlist.tf`
- 13 council domains managed as code (auditable, version-controlled)
- Azure Firewall option for domain-based filtering (vs. NSG IP-based)

**Security Posture Improvements:**
- CI enforces security gates (cannot merge if scans fail)
- Container images immutable with git commit traceability
- Network isolation prevents lateral movement
- Kill switches validated in every build
- Infrastructure changes require security review (via tfsec)
- All egress destinations managed as code

**Operational Tooling:**
- `verify-kill-switches.js` - Audits kill switch configuration
- `setup-branch-protection.sh` - Applies GitHub branch rules
- Health check endpoints for container orchestration
- Trivy DB caching reduces CI time

**Key Tradeoffs:**
- Longer CI times (~7-10 min) for comprehensive scanning - acceptable for security posture
- Azure Firewall adds cost but enables domain-based egress filtering
- Trivy may have false positives - mitigated with SARIF review in GitHub Security
- Branch protection prevents quick hotfixes - emergency procedure documented
