# Abuse-Resistance Hardening Review — Hampshire Bin Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Classification:** Internal  

---

## Executive Summary

This document reviews the platform's abuse-resistance controls and identifies hardening opportunities. As part of Phase 4 security review, this assessment evaluates our defenses against automated abuse, bot activity, and enumeration attacks.

**Current Posture:** STRONG with identified improvement areas

The platform has robust foundational abuse controls (enumeration detection, rate limiting, injection blocking) but lacks advanced bot detection and circuit breaker mechanisms.

**2 Hardening Improvements Implemented:**
1. **User-Agent based bot detection** (heuristic analysis)
2. **Endpoint-specific rate limiting** (expensive operations protected)

---

## Rate Limiting Assessment

### Current Implementation

**Global Rate Limiting:**
- **Limit:** 100 requests per 15 minutes (900,000ms window)
- **Scope:** Per-IP address
- **Storage:** Redis (distributed) or in-memory (development)
- **Headers:** X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

**Evidence:**
- `src/api/server.ts` lines 71-90: Rate limit configuration
- Fastify rate-limit plugin with Redis backend

### Gaps Identified

❌ **No differentiation for expensive endpoints:**
- Address resolution (requires upstream council query) has same limit as cheap endpoints
- Property lookup (database query + potential adapter invocation) same limit as health check
- Expensive operations not adequately protected

❌ **No per-API-key rate limiting:**
- Design documents specify per-key limits
- Currently only IP-based limiting
- Authenticated users not tracked separately

❌ **No circuit breaker:**
- Platform can be used as amplification vector against council sites
- No automatic throttling if upstream errors spike
- Potential to cause council site DoS

### Analysis: Distributed Attack Resistance

**Current Defense:**
- Per-IP rate limiting: 100/15min
- For distributed botnet with 1000 IPs: 100,000 requests per 15 minutes possible
- **Verdict:** Insufficient against sophisticated distributed attacks

**Gaps:**
- No account-level daily quotas
- No aggregate pattern detection across IPs
- No behavioral analysis (request timing, patterns)

### Recommendations

**Implemented (Phase 4):**
1. ✅ **Endpoint-specific rate limiting** (see code improvements below)
   - Address resolution: 20/15min per IP
   - Property lookup: 30/15min per IP
   - Collection lookup: 100/15min per IP (cheap, cached)

**Future Enhancements (Phase 4.1):**
2. ⬜ Per-API-key rate limiting with daily quotas
3. ⬜ Circuit breaker: Stop adapter if upstream error rate >20% over 5 minutes
4. ⬜ Aggregate pattern detection (multiple IPs making identical request patterns)

---

## Enumeration Detection Assessment

### Current Implementation

**Sliding Window Tracking:**
- **Window:** 15 minutes (15 x 60-second buckets)
- **Soft Block Threshold:** 50 unique postcodes in window
- **Hard Block Threshold:** 100 unique postcodes in window
- **Soft Block Action:** Artificial delay (2-3 seconds, degrades bot performance)
- **Hard Block Action:** 15-minute ban (429 response)
- **Storage:** Redis sets per bucket

**Evidence:**
- `src/api/middleware/enumeration-detection.ts` lines 22-25: Thresholds
- `src/api/middleware/enumeration-detection.ts` lines 119-147: Sliding window implementation

### Analysis: Threshold Appropriateness

**Soft Block (50 postcodes / 15 min):**
- Legitimate user: ~1-2 postcode lookups per session (friends/family addresses)
- Legitimate high-volume: Developer testing, maybe 5-10 unique postcodes
- **50 postcodes in 15 min = 3.3 postcodes/minute = Bot-like behavior**
- **Verdict:** Appropriate threshold

**Hard Block (100 postcodes / 15 min):**
- Allows soft-blocked bot to continue at reduced speed
- Bot experiences degraded performance (2-3s delay per request)
- 100 postcodes = covering multiple towns (clear enumeration)
- **Verdict:** Appropriate threshold

### Gaps Identified

✅ **Postcode enumeration vector covered**

⚠️ **Property ID enumeration not covered:**
- UPRNs may be enumerable via sequential ID guessing
- Enumeration detection only tracks postcode parameter
- If endpoint accepts UPRN directly, could bypass detection

⚠️ **API key rate limiting independent:**
- Enumeration detection is IP-based only
- API key with rotating IPs could evade detection
- Need per-key enumeration tracking

### Attack Scenarios

**Scenario 1: Single IP Enumerator**
- Attack: Bot iterates UK postcodes from single IP
- Defense: ✅ Soft block at 50, hard block at 100
- Outcome: Attack mitigated

**Scenario 2: Distributed Enumerator (1000 IPs)**
- Attack: Each IP requests 49 unique postcodes (stays under soft block)
- Result: 49,000 postcodes enumerated in 15 minutes
- Defense: ❌ No cross-IP pattern detection
- Outcome: Attack succeeds

**Scenario 3: API Key with IP Rotation**
- Attack: Valid API key used from rotating IPs (cloud proxies)
- Result: Each IP appears legitimate, enumeration succeeds
- Defense: ❌ No per-key enumeration tracking
- Outcome: Attack succeeds

### Recommendations

**Implemented (Phase 4):**
1. ✅ **Bot detection via User-Agent analysis** (see code improvements below)
   - Blocks headless browser signatures
   - Blocks known bot user-agents
   - Flags suspicious patterns

**Future Enhancements (Phase 4.1):**
2. ⬜ Per-API-key enumeration tracking (separate from IP tracking)
3. ⬜ UPRN enumeration detection (if direct UPRN endpoints exist)
4. ⬜ Cross-IP pattern detection (same postcode list across multiple IPs)

---

## Bot Detection Assessment

### Current Implementation

**Existing Bot Defenses:**
- Rate limiting (general, not bot-specific)
- Enumeration detection (behavior-based)
- Injection detection (malicious input)

**Missing Bot Detection:**
- ❌ No User-Agent analysis
- ❌ No headless browser signature detection
- ❌ No behavioral timing analysis
- ❌ No CAPTCHA for suspicious activity

### Bot Detection Vectors

| Vector | Detection Method | Current Status |
|---|---|---|
| User-Agent | Heuristic analysis (headless, curl, wget, python-requests) | ❌ Not implemented |
| Request Timing | Too-regular intervals (bot signature) | ❌ Not implemented |
| JavaScript Challenge | Require JS execution for suspicious IPs | ❌ Not implemented |
| CAPTCHA | Challenge-response after threshold | ❌ Not implemented |
| TLS Fingerprint | Browser TLS handshake analysis | ❌ Not at application layer |
| Mouse Movement | Behavioral biometrics | ❌ Not applicable (API) |

### Recommendations

**Implemented (Phase 4):**
1. ✅ **User-Agent bot detection** (see code improvements below)
   - Blocks common bot signatures
   - Logs suspicious user-agents
   - Returns generic 403 without revealing detection

**Future Enhancements (Phase 4.2):**
2. ⬜ Request timing analysis (standard deviation of request intervals)
3. ⬜ CAPTCHA integration for soft-blocked IPs
4. ⬜ JavaScript challenge for unauthenticated endpoints
5. ⬜ API Gateway-level bot management (Cloudflare Bot Management)

---

## Amplification Attack Protection

### Scenario: Platform Used to DoS Council Sites

**Attack:**
1. Attacker finds address requiring upstream council query
2. Attacker requests address repeatedly with cache bypass
3. Each request triggers adapter to query council site
4. Council site overwhelmed
5. Council blocks our IP, blames us for attack

### Current Defenses

✅ **Cache-first responses:**
- Design specifies cache-first (return stale data rather than trigger upstream)
- Prevents on-demand refresh abuse

⚠️ **No user-triggerable forced refresh:**
- Design specifies no forced refresh but implementation not verified
- If cache=false parameter exists, could be abused

❌ **No circuit breaker:**
- If adapter starts failing, continues to retry
- No automatic halt when upstream errors spike
- Could compound council site issues

❌ **No upstream request budget:**
- No daily/hourly limit on upstream requests per adapter
- Adapter could make thousands of requests if misconfigured

### Recommendations

**Future Enhancements (Phase 4.1):**
1. ⬜ **Circuit breaker implementation:**
   - Track adapter upstream error rate (5-minute window)
   - If error rate >20%, open circuit (stop requests for 5 minutes)
   - After 5 minutes, allow single test request (half-open state)
   - If test succeeds, close circuit (resume normal operation)
   
2. ⬜ **Upstream request budget:**
   - Max 1000 upstream requests per adapter per hour
   - Budget tracked in Redis
   - Exceeding budget returns cached data only
   - Budget resets hourly

3. ⬜ **Request jitter:**
   - Add random delay (100-500ms) before upstream requests
   - Prevents thundering herd on adapter restart
   - Spreads load on council sites

---

## Findings Summary

| Control | Current State | Gap | Recommendation | Priority | Status |
|---|---|---|---|---|---|
| **Rate Limiting** | Global 100/15min per IP | No endpoint-specific limits | Implement tiered rate limits | High | ✅ Implemented |
| **Rate Limiting** | IP-based only | No per-API-key limits | Add per-key tracking | Medium | ⬜ Phase 4.1 |
| **Enumeration** | Postcode tracking (50/100) | No UPRN tracking | Add UPRN enumeration detection | Medium | ⬜ Phase 4.1 |
| **Enumeration** | IP-based only | No per-key tracking | Add per-key enumeration | Medium | ⬜ Phase 4.1 |
| **Bot Detection** | None (behavior-based only) | No UA analysis | Implement UA bot detection | High | ✅ Implemented |
| **Bot Detection** | None | No timing analysis | Detect regular intervals | Low | ⬜ Phase 4.2 |
| **Amplification** | Cache-first design | No circuit breaker | Implement adapter circuit breaker | Medium | ⬜ Phase 4.1 |
| **Amplification** | Unlimited upstream | No request budget | Implement hourly budget | Medium | ⬜ Phase 4.1 |

---

## Implemented Hardening Improvements

### 1. Endpoint-Specific Rate Limiting

**Rationale:**
Address resolution and property lookup are expensive operations requiring upstream queries or complex database operations. These endpoints should have stricter rate limits than cheap cached endpoints.

**Implementation:**
See `src/api/middleware/endpoint-rate-limiting.ts` (created in this phase)

**Configuration:**
- `/v1/postcodes/:postcode/addresses`: 20 req/15min per IP
- `/v1/properties/:uprn`: 30 req/15min per IP
- `/v1/collections/:councilId/:uprn`: 100 req/15min per IP (cached, cheap)
- Default (health, stats): 100 req/15min per IP

**Benefits:**
- Protects expensive endpoints from abuse
- Allows legitimate usage of cheap endpoints
- Prevents resource exhaustion attacks

---

### 2. User-Agent Bot Detection

**Rationale:**
Many bots use identifiable User-Agent strings (headless browsers, curl, automated tools). Blocking obvious bot signatures reduces automated abuse without impacting legitimate users.

**Implementation:**
See `src/api/middleware/bot-detection.ts` (created in this phase)

**Detection Patterns:**
- Headless browsers: HeadlessChrome, PhantomJS, Puppeteer, Playwright
- CLI tools: curl, wget, python-requests, axios, node-fetch
- Scrapers: Scrapy, BeautifulSoup, crawler, spider
- Known bots: bot, crawler, spider (generic signatures)

**Actions:**
- Block request with 403 Forbidden
- Log to audit trail as ADAPTER_BOT_BLOCKED
- Generic error message (no detection logic revealed)

**Allowlist:**
- Legitimate monitoring tools (if configured)
- Internal health check user-agents

**Benefits:**
- Blocks unsophisticated bots immediately
- Reduces load from automated scrapers
- Complements behavioral detection (enumeration)

---

## Testing Recommendations

### Abuse Resistance Testing (Phase 4.1)

1. **Enumeration Attack Simulation:**
   - Script to iterate 200 unique postcodes from single IP
   - Verify soft block at 50 (delay observed)
   - Verify hard block at 100 (429 response)
   - Verify 15-minute ban duration

2. **Distributed Attack Simulation:**
   - 10 IPs each requesting 40 unique postcodes
   - Verify current controls insufficient
   - Test cross-IP pattern detection (when implemented)

3. **Bot Detection Validation:**
   - Requests with headless browser User-Agent → blocked
   - Requests with curl User-Agent → blocked
   - Requests with legitimate browser UA → allowed

4. **Rate Limit Bypass Attempts:**
   - IP rotation to evade per-IP limits
   - Verify API key tracking (when implemented)

5. **Circuit Breaker Testing:**
   - Simulate upstream failures (council site down)
   - Verify circuit opens after error threshold
   - Verify recovery after cooling period

---

## Operational Metrics

### Monitoring Requirements (Phase 4.2)

**Abuse Detection Metrics:**
- Enumeration blocks per hour (by IP, by API key)
- Bot detection blocks per hour (by User-Agent pattern)
- Rate limit violations per hour (by endpoint)
- Failed authentication attempts per IP

**Upstream Protection Metrics:**
- Upstream requests per adapter per hour
- Upstream error rate per adapter (5-min rolling)
- Circuit breaker state (open/closed/half-open) per adapter
- Cache hit rate per endpoint

**Alert Thresholds:**
- Enumeration blocks >50/hour → investigate
- Bot blocks >100/hour → review detection patterns
- Upstream error rate >20% → manual circuit open
- Failed auth >100/hour from single IP → investigate

---

## Penetration Testing Scope

### Recommended Tests (Phase 4.2 - External Pen Test)

1. **Enumeration Attack:**
   - Attempt to enumerate all UK postcodes
   - Attempt to bypass soft/hard blocks
   - Attempt distributed enumeration with IP rotation

2. **Rate Limit Bypass:**
   - Attempt to bypass per-IP limits with proxies
   - Attempt to bypass per-key limits (once implemented)
   - Test endpoint-specific rate limit enforcement

3. **Bot Detection Evasion:**
   - Attempt to evade User-Agent detection (spoofing)
   - Test headless browser with custom UA
   - Test request timing to appear human-like

4. **Amplification Attack:**
   - Attempt to force cache misses
   - Attempt to trigger excessive upstream requests
   - Test circuit breaker activation

5. **Credential Stuffing:**
   - Attempt to brute force API keys
   - Verify timing attack mitigation
   - Test account lockout mechanisms

---

## Sign-Off

**Abuse Resistance Posture:** STRONG with enhancements implemented  
**Hardening Improvements Delivered:** 2 (Endpoint-specific rate limiting, Bot detection)  
**Recommended Future Work:** Circuit breaker, per-key tracking, cross-IP pattern detection  

**Security Engineer:** Amos  
**Date:** 2026-03-25  
**Next Review:** Post-pen-test (Phase 4.2)  

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial abuse-resistance review with Phase 4 improvements |
