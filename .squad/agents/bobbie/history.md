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

### 2026-03-25: Phase 3 Test Suite Implementation

**Comprehensive Test Coverage Delivered:**
1. **Fareham/Bartec Adapter Tests (`tests/unit/adapters/fareham.test.ts`):**
   - 30+ test cases covering SOAP API acquisition
   - Bartec service code mapping (REFUSE → general_waste, RECYCLE → recycling, etc.)
   - SOAP fault handling → FailureCategory.SERVER_ERROR
   - Malformed XML → FailureCategory.PARSE_ERROR with safe parsing
   - XML injection (script tags) → security warning, no execution
   - Large payload (>1MB) → rejection with size warning
   - HTTP 403 → FailureCategory.BOT_DETECTION
   - Kill switch integration
   - Evidence capture validation (XML content stored)
   - Confidence score >= 0.9 for API method
   - securityProfile() with correct egress destinations

2. **East Hampshire PDF Adapter Tests (`tests/unit/adapters/east-hampshire.test.ts`):**
   - 25+ test cases covering two-phase PDF acquisition (area lookup → PDF download)
   - Postcode → area code mapping (GU30 → area_round_1)
   - PDF parsing with date extraction
   - Confidence score ~0.75 (higher than unknown, lower than API)
   - PDF size validation (>5MB rejected before parsing)
   - Content-type validation (must be application/pdf)
   - Egress enforcement (PDF URL must be on easthants.gov.uk domain)
   - Corrupted PDF → FailureCategory.PARSE_ERROR
   - No dates found → empty result + warning
   - Evidence storage with PDF hash and URL

3. **Confidence Scoring Tests (`tests/unit/core/confidence.test.ts`):**
   - Base scores: API=0.95, PDF=0.70, Browser=0.75
   - Freshness decay for stale data (API 25h old → confidence <0.5)
   - Very stale (72h) → confidence ≤0.25
   - Parse warnings penalty (3 warnings → -0.15)
   - Partial data flag → -0.15
   - Upstream risk multiplier (high risk → 0.85x)
   - Validation failures penalty (2 failures → -0.20)
   - All penalties clamped to [0.0, 1.0]
   - Deterministic computation (same inputs → same output)
   - Named thresholds: HIGH=0.8, MEDIUM=0.6, LOW=0.4, STALE=0.2

4. **Drift Detection Tests (`tests/unit/core/drift.test.ts`):**
   - No previous snapshot → no drift reported
   - Identical structure → hasDrift: false
   - New fields → driftType: 'new_fields', severity: 'minor', recommendation: 'log_and_continue'
   - Missing fields → driftType: 'missing_fields', severity: 'major', recommendation: 'alert_team'
   - Type changes (string → number) → driftType: 'type_change', severity: 'breaking', recommendation: 'fail_acquisition'
   - Audit event logged for all drift (includes timestamp, severity, drifts array)
   - Multiple drifts → breaking takes precedence
   - Edge cases: empty data, empty snapshot

5. **Integration Tests - Confidence Endpoint (`tests/integration/api/confidence.test.ts`):**
   - GET /v1/properties/:id/collections includes confidence field (number 0-1)
   - confidenceFactors breakdown (method, ageHours, freshness, dataQuality)
   - Stale cached data has lower confidence than fresh data
   - freshness metadata (acquiredAt ISO 8601, ageHours, cacheHit, cacheTtlRemaining)
   - Confidence correlates with data quality (high=excellent, medium=good, low=degraded)

**Test Fixtures Created:**
- `fareham-bartec-valid.xml` — realistic Bartec SOAP response with 3 services
- `fareham-bartec-fault.xml` — SOAP fault envelope
- `fareham-bartec-empty.xml` — valid but no collections
- `east-hampshire-area-lookup.html` — area lookup page with postcode mapping

**Synthetic Monitoring Design:**
- **Document:** `docs/monitoring/synthetic-checks.md` (comprehensive design)
- **Implementation:** `src/workers/synthetic-monitor.ts` (scheduled worker)
- **Check Types:**
  1. Liveness probe (every 5 min) → verifyHealth() with <5s timeout
  2. Freshness probe (every 30 min) → cache age validation
  3. Canary acquisition (every 2 hours) → full end-to-end test
  4. Confidence trend monitor (every hour) → detect >10% drops
- **Alert Routing:** degraded → log, unhealthy → disable + notify, security → audit + alert
- **Safety:** Isolated execution, no production data, separate rate limit quota

**Key Test Patterns Learned:**
1. **XML/SOAP Testing:**
   - Use raw XML imports (`fareham-bartec-valid.xml?raw`)
   - Test SOAP fault handling separately from parse errors
   - Validate script injection is logged but not executed
   - Size limits enforced before parsing (prevent DoS)

2. **PDF Adapter Testing:**
   - Multi-step acquisition (area lookup → PDF download) tested in sequence
   - Content-type validation critical (reject non-PDF responses)
   - Egress enforcement prevents SSRF (domain allowlist)
   - Mock PDF as Buffer for fixture data

3. **Confidence Scoring:**
   - Method-based base scores define ceiling
   - Freshness decay is time-dependent (not linear)
   - Multiple penalties are additive, then clamped
   - Named thresholds provide consistent classification

4. **Drift Detection:**
   - Schema snapshots enable comparison over time
   - Severity precedence: breaking > major > minor
   - Audit logging mandatory for all drift events
   - Recommendations guide operational response

5. **Synthetic Monitoring:**
   - Proactive detection reduces user-facing failures
   - Canary postcodes per council documented in registry
   - Failure counters prevent alert fatigue (3 consecutive → escalate)
   - Confidence trends detect upstream schema changes

**Coverage Impact:**
- Phase 3 adds ~150 new test cases across 5 test files
- Estimated coverage: Adapters 85%, Core 92%, Integration 80%
- All tests follow established vitest + TypeScript strict patterns

**Next Steps:**
- Naomi & Holden: Implement Fareham adapter (SOAP/Bartec) to pass tests
- Naomi & Holden: Implement East Hampshire adapter (PDF) to pass tests
- Holden: Implement confidence scoring logic in `src/core/confidence.ts`
- Holden: Implement drift detection in `src/core/drift-detection.ts`
- Holden: Wire up synthetic monitor worker to scheduler
- Run `npm run test:unit` to validate all Phase 3 implementations
- Deploy synthetic monitor to staging for validation

### 2026-03-25: Phase 3 Wave 2 Test Suite Implementation

**Comprehensive Test Coverage Delivered:**
1. **7 Council Adapter Tests (Browser-based):**
   - `tests/unit/adapters/basingstoke-deane.test.ts` - 23 test cases covering browser automation, bin type mapping, error handling, security, kill switch
   - `tests/unit/adapters/gosport.test.ts` - 19 test cases covering form-based acquisition, all bin types, timeout/500/parse/redirect errors
   - `tests/unit/adapters/havant.test.ts` - 16 test cases covering happy path, error scenarios, XSS/SSRF protection
   - `tests/unit/adapters/hart.test.ts` - 14 test cases covering address lookup, collection events, security validation
   - `tests/unit/adapters/winchester.test.ts` - 14 test cases covering 4 bin types (general/recycling/garden/food), error cases
   - `tests/unit/adapters/test-valley.test.ts` - 13 test cases covering browser-based acquisition, domain validation
   - `tests/unit/adapters/portsmouth.test.ts` - 21 test cases covering dual-mode (JSON API + browser fallback), discoverCapabilities()

2. **FormAdapter Base Class Tests (`tests/unit/adapters/base/form-adapter.test.ts`):**
   - 27 test cases covering shared browser automation patterns
   - navigateToLookupPage: URL navigation with domain validation (3 tests)
   - fillPostcodeField: Input normalization and sanitization (3 tests)
   - waitForAddressList: Timeout handling (3 tests)
   - selectAddress: Option selection and page change verification (2 tests)
   - capturePageEvidence: HTML/screenshot capture + evidence store integration (4 tests)
   - validateOnDomain: Domain allowlist validation, SSRF/typosquatting/cloud metadata blocking (6 tests)
   - Error handling: Network errors, selector timeouts (2 tests)
   - Input sanitization: SQL injection, XSS, truncation (2 tests)

3. **Integration Tests - All Adapters Health (`tests/integration/api/all-adapters-health.test.ts`):**
   - 24 test cases covering end-to-end health check integration
   - GET /v1/councils: Returns all 13 Hampshire councils (4 tests)
   - GET /v1/councils/{councilId}/health: Health status for each Wave 2 council (7×3=21 tests)
   - Kill switch response: 503 with reason for disabled adapters (7×2=14 tests)
   - Registry validation: Unique IDs, kebab-case format (3 tests)
   - Performance: Concurrent requests, parallel health checks (2 tests)
   - Error states: Degraded/unhealthy/schema drift (3 tests)

4. **HTML Fixtures Created:**
   - `basingstoke-address-list.html` - Realistic address selection page with CSRF token
   - `basingstoke-collection-schedule.html` - Collection schedule with 3 bin types (general/recycling/garden)
   - `gosport-address-list.html` - Address dropdown with UPRN values
   - `gosport-collection-schedule.html` - Schedule with food waste (weekly) and fortnightly collections

**Test Patterns Established:**
1. **Browser-Based Adapter Testing:**
   - Mock Playwright page objects (goto, fill, click, waitForSelector, content, screenshot, url)
   - Mock evidence store with verification of HTML/screenshot capture
   - Mock kill switch with environment variable checking (ADAPTER_KILL_SWITCH_{COUNCIL_ID_UPPER}=true)
   - Confidence scores: 0.75-0.85 for browser automation (lower than API 0.9-0.95, higher than unknown)
   - All canonical bin types tested: general_waste, recycling, garden_waste, food_waste

2. **Error Coverage:**
   - Happy path: Valid postcode → addresses → collection events
   - Empty results: Postcode not in area → empty array (not error)
   - Network errors: Timeout → FailureCategory.TIMEOUT
   - Upstream errors: HTTP 500 → FailureCategory.SERVER_ERROR
   - Parse errors: No schedule found → FailureCategory.PARSE_ERROR with warning
   - Redirect errors: Off-domain → FailureCategory.SERVER_ERROR with security warning

3. **Security Testing:**
   - Kill switch enforcement (refuses before browser launch)
   - XSS sanitization (strip <script> tags from parsed content)
   - SSRF prevention (domain allowlist validation, block cloud metadata IPs 169.254.169.254)
   - Domain validation (typosquatting protection, private IP blocking)
   - verifyHealth() works without triggering real navigation (mock-only)

4. **Dual-Mode Support (Portsmouth):**
   - JSON API mode: LookupMethod.API, confidence 0.95, risk LOW
   - Browser fallback: LookupMethod.BROWSER_AUTOMATION, confidence 0.8, risk HIGH
   - discoverCapabilities() returns correct primaryLookupMethod

5. **Integration Test Scope:**
   - All 13 Hampshire councils registered (Phases 1-3 Wave 2)
   - Health endpoint returns status, successRate24h, avgResponseTimeMs24h, upstreamReachable
   - Kill switch returns 503 with reason
   - Schema drift detection in health response
   - Performance validation (all 7 adapters checked in <5s)

**Coverage Impact:**
- Phase 3 Wave 2 adds ~150 new test cases across 10 test files
- Adapter tests: 7 councils × ~18 tests = ~126 tests
- Base class: 27 tests (reusable patterns)
- Integration: 24 tests (end-to-end validation)
- Total test suite now covers 13 councils across all phases
- Estimated coverage: Adapters 85%+, Core 92%, Integration 80%

**Test File Structure:**
```
tests/
├── unit/
│   └── adapters/
│       ├── base/
│       │   └── form-adapter.test.ts (FormAdapter base class)
│       ├── basingstoke-deane.test.ts
│       ├── gosport.test.ts
│       ├── havant.test.ts
│       ├── hart.test.ts
│       ├── winchester.test.ts
│       ├── test-valley.test.ts
│       └── portsmouth.test.ts
├── integration/
│   └── api/
│       └── all-adapters-health.test.ts
└── fixtures/
    └── responses/
        ├── basingstoke-address-list.html
        ├── basingstoke-collection-schedule.html
        ├── gosport-address-list.html
        └── gosport-collection-schedule.html
```

**Next Steps:**
- Naomi & Holden: Implement 7 Wave 2 adapters to pass these tests
- Run `npm run test:unit -- tests/unit/adapters/basingstoke-deane.test.ts` (etc.) to validate each adapter
- Run `npm run test:integration` to validate health endpoints
- Run `npm run test:coverage` to verify 85%+ adapter coverage threshold met
- Update `.squad/decisions/inbox/bobbie-wave2-tests.md` with any test coverage gaps identified
