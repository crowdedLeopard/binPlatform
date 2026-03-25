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

### 2026-03-25 - Phase 3 Synthetic Monitoring and Drift Detection

**Monitoring Infrastructure:**
- Dedicated synthetic monitoring worker container (`deploy/Dockerfile.monitor`)
- Separate observability stack (`docker-compose.observability.yml`) for local dev
- Prometheus + Grafana + Alertmanager for metrics, visualization, and alerting
- Metrics endpoint (`/metrics`) internal-network-only with IP allowlist protection
- Health check: process-based (pgrep) for outbound-only worker (no HTTP ports)

**Metrics Implementation:**
- Full Prometheus client library integration (replaced stub implementation)
- Real metrics: `adapter_health_status`, `adapter_confidence_score`, `adapter_drift_total`
- Breaking drift counter: `adapter_drift_breaking_total` (immediate alert trigger)
- Synthetic check metrics: `synthetic_check_success`, `synthetic_check_duration_seconds`
- HTTP request tracking: `http_request_duration_seconds`, `http_requests_active`
- Database status gauges: `redis_up`, `pg_up`
- Histogram buckets optimized for API (5ms-10s) and acquisitions (0.1s-60s)

**Alerting Rules:**
- 8 Prometheus alert rules in `drift-detection.yml`
- Critical alerts: `AdapterSchemaBreakingDrift` (0m grace), `AdapterUnavailable` (5m), `SyntheticCheckFailure` (10m)
- Warning alerts: `AdapterConfidenceDegraded` (15m), `HighAbuseRate` (2m), `HighAcquisitionLatency` (10m)
- Inhibition rules: suppress confidence alerts when adapter unavailable
- Alertmanager routing: critical (0s wait, 5m repeat), warning (30s wait, 3h repeat)

**Observability Stack Components:**
- Prometheus 2.48.1 with 30-day retention, automatic rule reloading
- Grafana 10.2.3 with provisioned datasource and dashboards
- Alertmanager 0.26.0 with email/webhook receivers (Slack/Teams ready)
- Adapter Health Overview dashboard (6 panels: health, confidence, drift, latency, rate, abuse)
- Dashboard features: auto-refresh (10s), 1-hour default window, council_id filtering

**CI/CD Integration:**
- New GitHub Actions job: `synthetic-check` (runs on PRs to main)
- Spins up full stack (postgres, redis, API) in CI
- Executes lightweight synthetic checks against all adapters
- Verifies each adapter returns valid health response (no crashes)
- Uploads API logs on failure for debugging
- Proper teardown with process cleanup

**Terraform Monitoring Module:**
- Azure Monitor Workspace (Log Analytics) with configurable retention (30-730 days)
- Application Insights for API and Worker (separate instrumentation)
- Action Group with dynamic email/webhook receivers
- 5 metric alerts: adapter unavailable, confidence degraded, breaking drift, API errors, synthetic failures
- 1 log query alert: high abuse rate (>50 blocks per 5min)
- Dynamic criteria for API errors (auto-adjusting thresholds)
- Diagnostic settings for workspace audit trail

**Runbook Documentation:**
- `docs/runbooks/synthetic-monitoring.md` - How to read results, manual triggers, canary management
- `docs/runbooks/drift-response.md` - Step-by-step response for minor/major/breaking drift
- Breaking drift SLA: kill switch within 15 minutes, fix within 24 hours
- Escalation matrix: minor (7d), major (4h), breaking (immediate)
- Drift prevention: multiple selector fallbacks, flexible parsing, council communication

**Security Patterns:**
- `/metrics` endpoint NEVER exposed to public internet (internal subnet only)
- Monitor container: no exposed ports, outbound-only to internal API
- Network isolation: monitor in `app-network` (no adapter-network access)
- Non-root user (nodejs:1001) in monitor container
- Package managers removed from runtime image

**Operational Patterns:**
- Canary postcodes: one representative per council (environment-configured)
- Synthetic check interval: 5 minutes (configurable via `MONITOR_INTERVAL_MINUTES`)
- Confidence score thresholds: <0.5 critical, 0.5-0.79 warning, 0.8+ healthy
- Graceful degradation: kill switches prevent bad data during drift incidents
- Post-incident reviews required for all breaking drift events

**Configuration Management:**
- Prometheus scrape configs for API and monitor jobs
- Metric relabeling to drop sensitive label names (password, secret, token)
- Grafana dashboard provisioning (no manual setup required)
- Alertmanager templates ready for SMTP and webhook integration
- Separate compose file allows opt-in observability for local dev

**Key Decisions:**
- Process-based health check for monitor (no HTTP server overhead)
- Separate Application Insights for API vs Worker (clearer attribution)
- IP-based allowlist for metrics endpoint (defense in depth)
- Synthetic checks in CI verify adapter initialization (not full acquisitions)
- Monitor container restarts: `unless-stopped` (resilient to transient failures)

**Integration Points:**
- Metrics exported by API at `GET /metrics` (Prometheus text format)
- Worker publishes metrics to same registry (shared Redis optional)
- CI synthetic-check job validates adapter health endpoints
- Terraform monitoring module outputs instrumentation keys (Key Vault injection)
- Grafana dashboards read from Prometheus datasource (auto-provisioned)
