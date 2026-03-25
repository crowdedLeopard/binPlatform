# Project Context

- **Owner:** crowdedLeopard
- **Project:** Hampshire Bin Collection Data Platform — a production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.
- **Stack:** TypeScript or Python, FastAPI or Node.js, PostgreSQL, Redis, Playwright (browser automation), Terraform/Bicep, Docker, OpenAPI
- **Created:** 2026-03-25

## Learnings
<!-- Append new learnings below. -->

### 2026-03-25: Phase 0 Adapter Priority & Test Planning

**Adapter Testing Priority (from Naomi's discovery):**
1. **Eastleigh** — Phase 1, API-based (clean patterns, UPRN resolution)
2. **Rushmoor** — Phase 1, Form automation (framework validation)
3. **8 form-based councils** — Phase 3, form automation framework (69% coverage)

**Key Test Decisions:**
- **Error budget:** <5% Phase 1, <10% Phase 3 (upstream brittleness expected)
- **Form automation framework:** Centralized CSRF, cookie consent, session management, rate limiting
- **Evidence requirements:** Store raw responses (HTML, JSON, XML) with timestamp, status, headers for debugging and replay testing
- **Rate limiting strategy:** Conservative defaults (1 req/2s councils, 1 req/10s browser automation), exponential backoff on 403/429
- **Browser automation:** Playwright with Seccomp sandbox, 30s timeout, CPU/memory limits, read-only filesystem
- **Integration testing:** Mock council responses for CI; real integration tests for smoke testing (daily)

**Security Test Scenarios (from Amos):**
- SQL injection patterns (parameterized queries mandatory)
- XSS in HTML parsing (redact and sanitize inputs)
- Auth bypass attempts (API key + optional rate limiting)
- Secrets in logs (redaction patterns, code review)
- Adapter isolation (network egress, container limits)
