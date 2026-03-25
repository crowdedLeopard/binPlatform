# Smoke Test Report — 2026-03-25

**Tester:** Bobbie (QA Engineer)  
**Target Environment:** Staging  
**API Base URL:** `https://ca-binplatform-api-staging.icyriver-42deda52.uksouth.azurecontainerapps.io`  
**Test Execution:** 2026-03-25 16:04 UTC  
**Overall Result:** ✅ **PASS** (12/12 tests, 100% pass rate)

---

## Executive Summary

All smoke tests passed successfully. The API is functioning correctly across all tested endpoints, properly handling both happy path and error scenarios. Security headers are well-configured with a robust Content Security Policy and HSTS. Rate limiting is active and working as expected (100 req/window limit).

**Key Findings:**
- ✅ All 13 councils returned correctly from `/v1/councils`
- ✅ Health and readiness endpoints operational
- ✅ Kill switch correctly enabled for Basingstoke-Deane, disabled for Eastleigh
- ✅ Error responses return JSON (not HTML) with appropriate 404 status codes
- ✅ Security headers present (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- ✅ Rate limiting active (100 requests per window, headers present)
- ⚠️ Minor: X-XSS-Protection header not set (acceptable, deprecated header)
- ✅ Server header not present (good security practice)

---

## Test Results by Category

### 1. Happy Path Tests (8/8 PASS)

| Endpoint | Expected | Actual | Status | Notes |
|----------|----------|--------|--------|-------|
| `GET /health` | 200 | 200 | ✅ PASS | JSON response with `status:"ok"`, version `0.1.0` |
| `GET /ready` | 200 or 503 | 200 | ✅ PASS | All checks (database, cache, storage) report `"ok"` |
| `GET /v1/councils` | 200 | 200 | ✅ PASS | Returns 13 councils (correct count) |
| `GET /v1/councils/eastleigh` | 200 | 200 | ✅ PASS | Returns council details, `lookup_method:"api"` |
| `GET /v1/councils/basingstoke-deane` | 200 | 200 | ✅ PASS | Returns council details, `lookup_method:"html_form"` |
| `GET /v1/councils/portsmouth` | 200 | 200 | ✅ PASS | Returns council details, `lookup_method:"html_form"` |
| `GET /v1/councils/eastleigh/health` | 200 | 200 | ✅ PASS | `kill_switch_active: false` (beta-active council) |
| `GET /v1/councils/basingstoke-deane/health` | 200 | 200 | ✅ PASS | `kill_switch_active: true` (kill-switched council) |

**Health Endpoint Response Sample:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-25T16:04:24.890Z",
  "service": "hampshire-bin-platform",
  "version": "0.1.0"
}
```

**Ready Endpoint Response Sample:**
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "cache": "ok",
    "storage": "ok"
  },
  "timestamp": "2026-03-25T16:04:24.981Z"
}
```

**Council Health Response Sample (Eastleigh - Active):**
```json
{
  "council_id": "eastleigh",
  "status": "unknown",
  "kill_switch_active": false,
  "confidence_score": 0.9,
  "upstream_risk_level": "medium",
  "checked_at": "2026-03-25T16:04:25.264Z"
}
```

**Council Health Response Sample (Basingstoke-Deane - Kill-Switched):**
```json
{
  "council_id": "basingstoke-deane",
  "status": "disabled",
  "kill_switch_active": true,
  "confidence_score": 0.65,
  "upstream_risk_level": "medium",
  "checked_at": "2026-03-25T16:04:25.317Z"
}
```

---

### 2. Error Case Tests (4/4 PASS)

| Endpoint | Expected | Actual | Status | Notes |
|----------|----------|--------|--------|-------|
| `GET /v1/councils/nonexistent-council` | 404 JSON | 404 JSON | ✅ PASS | Proper JSON error response, not HTML |
| `GET /v1/councils/EASTLEIGH` | 404 | 404 | ✅ PASS | Case-sensitive council IDs enforced |
| `GET /doesnotexist` | 404 JSON | 404 JSON | ✅ PASS | Returns JSON error, not HTML 404 page |
| `GET /v1` | 404 | 404 | ✅ PASS | Correctly rejects incomplete API path |

**Key Security Win:** All 404 errors return JSON (not HTML), preventing information leakage through stack traces or default error pages.

---

### 3. Security Headers Audit

| Header | Value | Status | Notes |
|--------|-------|--------|-------|
| `X-Frame-Options` | `DENY` | ✅ GOOD | Prevents clickjacking attacks |
| `X-Content-Type-Options` | `nosniff` | ✅ GOOD | Prevents MIME-sniffing attacks |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | ✅ EXCELLENT | HSTS with preload and subdomains |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; upgrade-insecure-requests` | ✅ EXCELLENT | Restrictive CSP, blocks XSS and injection attacks |
| `X-XSS-Protection` | Not set | ⚠️ ACCEPTABLE | Deprecated header, modern browsers ignore it |
| `Server` | Not set | ✅ GOOD | Server header removed (prevents fingerprinting) |

**Security Posture:** **STRONG**

- Content Security Policy is highly restrictive and well-configured
- HSTS is enabled with preload and subdomain inclusion (12-month duration)
- Server fingerprinting mitigated (no Server header)
- No stack traces or sensitive information leaked in error responses

**Recommendation:** Current security header configuration is production-ready. The missing X-XSS-Protection header is acceptable as it's been deprecated in favor of CSP.

---

### 4. Rate Limiting Verification

**Test Method:** 5 rapid consecutive requests to `/health` endpoint (100ms interval)

**Results:**
| Attempt | X-RateLimit-Remaining | X-RateLimit-Limit |
|---------|----------------------|-------------------|
| 1 | 85 | 100 |
| 2 | 84 | 100 |
| 3 | 83 | 100 |
| 4 | 82 | 100 |
| 5 | 81 | 100 |

**Status:** ✅ **WORKING**

- Rate limit headers are present and correctly decrementing
- Current limit: 100 requests per window
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining` (no `X-RateLimit-Reset` observed)

**Recommendation:** Rate limiting is functional. Consider testing actual limit enforcement (attempt 101+ requests to verify 429 response).

---

## Issues Found

**NONE** — No critical or moderate issues detected.

### Minor Observations:

1. **X-XSS-Protection header missing** (Severity: LOW, Priority: P4)
   - Impact: None (deprecated header, replaced by CSP)
   - Recommendation: No action required
   - Rationale: Modern browsers ignore this header in favor of Content-Security-Policy

2. **X-RateLimit-Reset header not observed** (Severity: INFO)
   - Impact: Clients cannot determine when rate limit window resets
   - Recommendation: Consider adding `X-RateLimit-Reset` (epoch timestamp) for better client behavior
   - Not blocking for production

---

## Councils Inventory Verification

**Expected:** 13 Hampshire councils  
**Actual:** 13 councils returned from `/v1/councils`

**Verified Council IDs:**
1. `basingstoke-deane` — Basingstoke & Deane Borough Council
2. `eastleigh` — Eastleigh Borough Council
3. `portsmouth` — Portsmouth City Council
4. *(10 additional councils in response, full list in JSON)*

**Kill Switch Status Verified:**
- ✅ Eastleigh: `kill_switch_active: false` (expected for beta-active council)
- ✅ Basingstoke-Deane: `kill_switch_active: true` (expected for kill-switched council)

---

## Test Coverage Summary

| Category | Tests | Pass | Fail | Coverage |
|----------|-------|------|------|----------|
| Happy Path | 8 | 8 | 0 | 100% |
| Error Cases | 4 | 4 | 0 | 100% |
| Security Headers | 6 checks | 5 optimal, 1 acceptable | 0 | 100% |
| Rate Limiting | 1 | 1 | 0 | 100% |
| **TOTAL** | **12** | **12** | **0** | **100%** |

---

## Recommended Next Tests

### 1. **End-to-End Lookup Tests** (Priority: P0 — CRITICAL)
   - Test actual bin collection lookups for Eastleigh (API-based)
   - Test UPRN resolution and property lookup flow
   - Verify collection schedule data structure matches OpenAPI spec
   - Test error handling when upstream council API fails
   - **Why:** Validates core business functionality, not just infrastructure

### 2. **Rate Limit Enforcement** (Priority: P1 — HIGH)
   - Send 101+ requests to trigger rate limit (expect 429 response)
   - Verify 429 response includes `Retry-After` header
   - Test rate limit per-endpoint (not just `/health`)
   - **Why:** Current test only verified headers, not actual enforcement

### 3. **Kill Switch Activation Test** (Priority: P1 — HIGH)
   - Attempt lookup on a kill-switched council (Basingstoke-Deane)
   - Verify graceful degradation (503 Service Unavailable expected)
   - Verify error message is user-friendly (not technical stack trace)
   - **Why:** Kill switch is a safety mechanism, must be verified in staging

### 4. **Input Validation / Fuzzing** (Priority: P2 — MEDIUM)
   - SQL injection patterns in council IDs and lookup parameters
   - XSS payloads in postcode/address inputs
   - Path traversal attempts (`../`, `..%2F`)
   - Null bytes, Unicode normalization attacks
   - **Why:** Security-critical, tests adapter isolation

### 5. **Load Testing** (Priority: P2 — MEDIUM)
   - Concurrent requests (10-50 simultaneous clients)
   - Sustained load (1 req/sec for 10 minutes)
   - Verify cache behavior under load (Redis hit rate)
   - **Why:** Staging is production-like, need to validate scalability

### 6. **Dependency Failure Scenarios** (Priority: P2 — MEDIUM)
   - Test `/ready` when database is unavailable (expect 503)
   - Test `/ready` when cache is unavailable (expect 503)
   - Verify partial degradation (e.g., cache down but DB up)
   - **Why:** Validates observability and graceful degradation

### 7. **OpenAPI Spec Compliance** (Priority: P3 — LOW)
   - Validate all responses against OpenAPI schema
   - Use automated tool (e.g., `openapi-validator`, `spectral`)
   - **Why:** Ensures contract stability for API consumers

### 8. **CORS and Preflight Tests** (Priority: P3 — LOW)
   - Send `OPTIONS` request with `Origin` header
   - Verify CORS headers (`Access-Control-Allow-Origin`, etc.)
   - **Why:** If API has web clients, CORS must be configured

### 9. **Logging and Observability** (Priority: P3 — LOW)
   - Verify logs do NOT contain sensitive data (postcodes, addresses)
   - Check for request ID propagation in logs (`X-Request-ID`)
   - **Why:** Security (no PII in logs) and debuggability

---

## Conclusion

**Overall Assessment:** ✅ **PRODUCTION-READY (Infrastructure & Error Handling)**

The API infrastructure is solid:
- All endpoints respond correctly
- Error handling is robust (JSON errors, no stack traces)
- Security headers are production-grade
- Rate limiting is active and functional
- Kill switch mechanism is operational

**Critical Next Step:** **End-to-end lookup testing** is required before declaring the API fully production-ready. Current tests validate infrastructure and error handling, but **core business logic (bin collection lookups) has not been smoke tested**.

**Confidence Level:** **HIGH** for infrastructure, **UNKNOWN** for business logic.

**Sign-off Status:** ✅ Infrastructure smoke test PASSED. ⏳ Awaiting E2E lookup validation.

---

**Test Artifacts:**
- Test script: PowerShell smoke test suite (inline in task)
- Test execution log: Captured in this report
- API endpoint coverage: 12 unique endpoint/scenario combinations
- Security posture: Audited and documented

**Next Actions:**
1. Run end-to-end lookup test for Eastleigh (API-based adapter)
2. Verify kill switch behavior blocks lookups on Basingstoke-Deane
3. Validate OpenAPI spec compliance with automated tooling
4. Execute rate limit enforcement test (101+ requests)

---

**Tested by:** Bobbie, QA Engineer  
**Reviewed by:** *(Pending)*  
**Approval Status:** ✅ SMOKE TEST PASSED — Ready for E2E testing
