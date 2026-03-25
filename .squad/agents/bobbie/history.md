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

### 2026-03-25: Phase 2 Test Suite Implementation

**Comprehensive Test Coverage Delivered:**
1. **Unit Tests:**
   - Eastleigh adapter: 20+ test cases covering happy path, error scenarios, security (XSS/SQL injection), bot detection, kill switch
   - Rushmoor adapter: 18+ test cases covering form automation, HTML parsing, CSRF handling, browser launch failures
   - Property resolution: 15+ test cases covering postcode validation, normalization, council identification, cache behavior
2. **Security Tests:**
   - Input validation: 15+ test cases for SQL injection, XSS, path traversal, null bytes, unicode normalization
   - API auth: 15+ test cases for API key validation, rate limiting, timing attacks, log redaction, brute force protection
3. **Integration Tests:**
   - Council health endpoint: 10+ test cases for status reporting, error handling, kill switch integration, schema drift detection
4. **Test Fixtures:**
   - Realistic mock responses for Eastleigh (JSON) and Rushmoor (HTML) based on discovery notes

**Test Patterns Established:**
- **Spec-driven testing:** Tests written from interface contract and discovery notes, not implementation
- **Security-first:** Every adapter test includes negative security tests (XSS, SQL injection, bot detection)
- **Evidence validation:** Mock evidence store to verify all responses are captured
- **Mock-first for CI:** No real network calls; integration tests use fixture responses
- **Clear test organization:** Describe blocks by feature; it blocks with clear behavior expectations

**Coverage Thresholds Agreed:**
- Global: 80% lines, 80% functions, 75% branches
- Adapters (src/adapters): 80% minimum (API-based), 85% target (critical path)
- Core/property-resolution: 90% (business logic critical)
- Excluded: Fixtures, migrations, generated files, infra config

**Next Steps:**
- Naomi & Holden: Implement adapters to pass these tests
- Run `npm run test:unit` to validate adapter implementations
- Run `npm run test:security` to validate security controls
- Run `npm run test:coverage` to verify thresholds met
