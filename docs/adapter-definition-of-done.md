# Adapter Definition of Done

**Version:** 1.0  
**Owner:** Holden (Lead Architect)  
**Last Updated:** 2026-03-25

---

## Purpose

This document defines the **Definition of Done (DoD)** for council adapters at each maturity stage. An adapter's status determines whether it's production-ready, in beta, degraded, or disabled.

**Adapter Statuses:**
- `implemented` — Production-ready, full DoD met
- `beta` — Functional but not fully validated
- `degraded` — Operational but low confidence
- `disabled` — Kill switch active, no acquisitions
- `postponed` — Upstream blocking (bot protection, etc.)
- `stub` — Placeholder, not implemented

---

## Status: "implemented" (Production-Ready)

An adapter achieves **"implemented"** status when ALL of the following criteria are met:

### 1. Code Completeness

- [ ] **Implements full `CouncilAdapter` interface**
  - `discoverCapabilities()` — Returns adapter capabilities with required inputs
  - `resolveAddresses()` — Resolves postcode to addresses with UPRN (if available)
  - `getCollectionServices()` — Returns bin types collected for property
  - `getCollectionEvents()` — Returns upcoming collection dates
  - `verifyHealth()` — Health check returns status and metadata

- [ ] **Kill switch enforced in all public methods**
  - Check `isKillSwitchActive()` before any upstream call
  - Return `FailureCategory.ADAPTER_DISABLED` when killed
  - Log kill switch activation to audit log

- [ ] **`securityProfile()` returns accurate egress domains**
  - All upstream URLs documented
  - No wildcard domains (must be specific)
  - No cloud metadata endpoints (169.254.169.254, etc.)
  - No private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)

- [ ] **`SELECTORS_VALIDATED=true` (browser adapters only)**
  - Selectors verified against live council website
  - Screenshot evidence captured and reviewed
  - Selectors tested with real postcodes (minimum 3 samples)
  - Fallback selectors implemented where possible

### 2. Data Quality

- [ ] **Returns all canonical bin types** for the council
  - General waste (black bin) — if collected
  - Recycling (blue/green bin) — if collected
  - Garden waste (brown bin) — if collected
  - Food waste — if collected separately
  - All expected bin types documented in council metadata

- [ ] **Collection dates in ISO-8601 format**
  - Format: `YYYY-MM-DD` (no time component)
  - Timezone: Always UK local time (Europe/London)
  - No relative dates ("next Monday") — absolute dates only

- [ ] **Confidence score ≥ 0.70**
  - Average confidence across 10 sample acquisitions ≥ 0.70
  - No individual acquisition < 0.60
  - Confidence breakdown includes all factors (method, freshness, validation, health)

- [ ] **At least one successful acquisition with real data**
  - Not stubbed responses
  - Real council postcode tested
  - Evidence captured and stored
  - Data validated against council website (manual spot-check)

### 3. Security

- [ ] **Egress restricted to council domain only**
  - `securityProfile()` allowlist matches actual URLs
  - No redirects to off-domain URLs (SSRF protection)
  - No data exfiltration to third-party domains
  - Evidence: Network trace shows only allowed domains contacted

- [ ] **Evidence captured and stored**
  - HTML snapshot (for browser adapters)
  - Screenshot (for browser adapters)
  - Raw API response (for API adapters)
  - Evidence metadata includes acquisition timestamp, correlation ID, council ID

- [ ] **Parser handles malformed responses without crash**
  - Try/catch around all parsing logic
  - Invalid data returns `FailureCategory.PARSE_ERROR` or `VALIDATION_ERROR`
  - No unhandled exceptions leak to caller
  - Error messages safe (no PII, no internal paths, no stack traces in public API)

- [ ] **Amos security review: PASS**
  - Security review completed (checklist in `.squad/agents/amos/`)
  - No critical vulnerabilities identified
  - Injection testing passed (SQL, command, path traversal)
  - Off-domain redirect testing passed
  - Evidence tampering testing passed

- [ ] **No secrets in adapter code**
  - No API keys, passwords, tokens hardcoded
  - All credentials from environment variables or Key Vault
  - No council-specific credentials (adapters use public endpoints only)

### 4. Testing

- [ ] **Unit tests ≥ 80% coverage**
  - Test file: `src/adapters/{council}/adapter.test.ts`
  - Coverage: statements, branches, functions, lines all ≥ 80%
  - Mock all external dependencies (Playwright, fetch, etc.)
  - Test happy path, error cases, edge cases

- [ ] **Kill switch test**
  - Test that adapter respects kill switch when active
  - Test that adapter logs kill switch activation
  - Test that kill switch does NOT prevent health check

- [ ] **Security tests**
  - Injection test: Postcode with SQL injection attempt returns validation error
  - SSRF test: Council redirect to internal IP is blocked
  - Off-domain test: Adapter does not follow off-domain redirects

- [ ] **Integration health check**
  - Test file: `src/adapters/{council}/integration.test.ts` (may be shared)
  - Run `verifyHealth()` against live council website (in staging only)
  - Verify health check returns status within 10 seconds

### 5. Infrastructure

- [ ] **Domain in egress allowlist**
  - Terraform/Bicep network policy includes council domain
  - Container network policy allows egress to council domain
  - No other domains allowed

- [ ] **Kill switch env var in `.env.example`**
  - Variable: `KILL_SWITCH_{COUNCIL_ID}=false`
  - Documented in `.env.example` with comment

- [ ] **Canary postcode defined**
  - Test postcode documented in council metadata
  - Postcode known to have bin collections
  - Used for synthetic monitoring

- [ ] **Prometheus metrics emitting**
  - Metrics: `adapter_acquisitions_total{council_id, status}`
  - Metrics: `adapter_confidence_score{council_id}`
  - Metrics: `adapter_duration_seconds{council_id}`
  - Metrics: `adapter_drift_total{council_id, drift_type}`

### 6. Documentation

- [ ] **README.md with acquisition path**
  - File: `src/adapters/{council}/README.md`
  - Describes how adapter works (API, browser, PDF, etc.)
  - Lists required inputs (postcode, UPRN, house number, etc.)
  - Documents known limitations or quirks
  - Includes example postcode for testing

- [ ] **Council registry entry updated**
  - Entry in `data/council-registry.json` with correct metadata
  - `adapterStatus: "implemented"`
  - `lookupMethod` accurate (api, browser, pdf_calendar, etc.)
  - `upstreamRiskLevel` documented (low, medium, high)
  - Postcode prefixes complete and correct

- [ ] **Upstream risk level confirmed**
  - Risk level assessed: low (stable API), medium (form automation), high (bot protection)
  - Evidence: Screenshot or API docs showing stability
  - Documented in discovery notes: `docs/discovery/{council}-notes.md`

---

## Status: "beta" (Functional but Unvalidated)

Adapter is functional but has not met full production DoD. Acceptable for staging/testing but not recommended for production without close monitoring.

### Requirements

- [x] Implements full `CouncilAdapter` interface
- [x] Returns valid data (at least 1 successful acquisition)
- [x] Kill switch enforced
- [x] Security profile defined
- [ ] `SELECTORS_VALIDATED=false` — Selectors not yet verified against live site
- [ ] Confidence score may be < 0.70
- [ ] Tests may have < 80% coverage
- [ ] Amos security review not yet completed

### Use Cases

- New adapter under development
- Council website recently changed, adapter being updated
- Experimental adapter for evaluation

### Transition to "implemented"

Complete remaining DoD items, then request Holden review + Amos security review.

---

## Status: "degraded" (Low Confidence)

Adapter is operational but returning low-confidence data (confidence < 0.5). May indicate schema drift or upstream issues.

### Causes

- Council website changed structure (schema drift)
- Partial data extraction (missing bin types)
- Frequent parsing errors or timeouts
- Upstream health degraded

### Actions

1. **Investigate within 4 hours** (per drift response runbook)
2. **Enable kill switch if confidence < 0.4** (unless data is better than nothing)
3. **Fix adapter** to restore confidence ≥ 0.70
4. **Disable kill switch** only after 10 consecutive successful acquisitions with confidence ≥ 0.70

### Documented In

- `docs/runbooks/drift-response.md` — Step-by-step recovery procedures

---

## Status: "disabled" (Kill Switch Active)

Adapter is disabled via kill switch. No acquisitions being made.

### When to Use

- Breaking schema drift detected
- Security incident (SSRF, injection, data leak)
- Upstream blocking (bot detection, rate limits)
- Council site down for extended period

### Effects

- `verifyHealth()` returns `status: "disabled"`
- All other methods return `FailureCategory.ADAPTER_DISABLED`
- API returns cached data or "temporarily unavailable" message
- No upstream requests made

### Recovery

1. **Investigate root cause** (per incident response plan)
2. **Fix issue** (adapter code, upstream changes, etc.)
3. **Test fix** in staging with real postcode
4. **Disable kill switch** only after validation
5. **Monitor for 24 hours** after re-enablement

### Documented In

- `docs/threat-model/kill-switch-strategy.md` — Full kill switch procedures

---

## Status: "postponed" (Upstream Blocking)

Council upstream is actively blocking automation (bot protection, CAPTCHA, 403 Forbidden). No technical fix available.

### Causes

- Bot protection (Cloudflare, Incapsula, Imperva)
- CAPTCHA challenges
- 403 Forbidden on all requests
- IP blocking
- Requires authentication (council residents only)

### Adapter Behavior

- Returns `FailureCategory.BOT_DETECTION` or `FailureCategory.AUTH_REQUIRED`
- Clear error message to user: "Council has postponed digital access"
- `verifyHealth()` returns `status: "unavailable"`
- No retry attempts (respects upstream blocking)

### Recovery Paths

1. **Partnership Approach (Preferred):**
   - Contact council IT/digital team
   - Request API access or data sharing agreement
   - Formal partnership under public sector collaboration

2. **Third-Party Service:**
   - Evaluate existing services (e.g., bin-calendar.nova.do)
   - Validate accuracy and reliability
   - Consider licensing or partnership

3. **Wait for Upstream Changes:**
   - Council may lift bot protection after service stabilization
   - Monitor council announcements for digital transformation initiatives

4. **Browser Automation (Last Resort):**
   - Playwright Stealth with anti-detection patterns
   - Only if ethically acceptable and legally compliant
   - Not recommended — fragile and may violate Terms of Service

### Examples

- New Forest (403 Forbidden — bot protection active)
- Southampton (Incapsula CDN blocks all automation)

### Documented In

- `docs/discovery/{council}-postponed.md` — Detailed analysis of blocking
- `docs/platform-status.md` — Recovery plan timeline

---

## Status: "stub" (Not Implemented)

Placeholder adapter, not functional. Returns error immediately.

### Use Cases

- Council not yet prioritized for implementation
- Council on roadmap but not yet started
- Council outside Hampshire (future expansion)

### Adapter Behavior

- Returns `FailureCategory.NOT_FOUND` or `FailureCategory.UNKNOWN`
- Error message: "Adapter for {council} is not yet implemented"
- `verifyHealth()` returns `status: "not_implemented"`

### Transition to "beta"

Implement adapter following new adapter checklist: `docs/runbooks/new-adapter-checklist.md`

---

## Adapter Lifecycle

```
stub → beta → implemented ↔ degraded
                   ↓
                disabled
                   ↓
             postponed (if upstream blocking)
```

**Normal Flow:**
1. Start with `stub` (not implemented)
2. Implement basic functionality → `beta`
3. Complete DoD items → `implemented`
4. Production use

**Degradation Flow:**
1. Schema drift or upstream changes → `degraded`
2. Fix adapter → `implemented` (restored)

**Failure Flow:**
1. Critical issue detected → `disabled`
2. Fix and test → `implemented` (restored)
3. If unfixable (bot protection) → `postponed`

---

## Checklist Templates

### New Adapter Checklist

When creating a new adapter, use this checklist:

```markdown
## {Council Name} Adapter — DoD Checklist

### Code Completeness
- [ ] `CouncilAdapter` interface implemented
- [ ] Kill switch enforced
- [ ] `securityProfile()` defined
- [ ] Selectors validated (browser adapters)

### Data Quality
- [ ] All bin types returned
- [ ] ISO-8601 dates
- [ ] Confidence ≥ 0.70
- [ ] Real data acquisition successful

### Security
- [ ] Egress restricted to council domain
- [ ] Evidence captured
- [ ] Malformed response handling
- [ ] Amos security review: PASS
- [ ] No secrets in code

### Testing
- [ ] Unit tests ≥ 80% coverage
- [ ] Kill switch test
- [ ] Security tests (injection, SSRF, off-domain)
- [ ] Integration health check

### Infrastructure
- [ ] Egress allowlist updated
- [ ] Kill switch env var in `.env.example`
- [ ] Canary postcode defined
- [ ] Prometheus metrics emitting

### Documentation
- [ ] README.md written
- [ ] Council registry updated
- [ ] Upstream risk level confirmed

**Status:** ___________  
**Target Date:** ___________  
**Owner:** ___________
```

Save as: `src/adapters/{council}/CHECKLIST.md`

---

## Review Process

### Self-Review (Developer)

1. Complete DoD checklist
2. Run all tests (`npm test -- src/adapters/{council}`)
3. Test with real postcodes (minimum 3)
4. Create PR with label `adapter-dod`

### Peer Review (Naomi / Team Lead)

1. Code review (logic, security, patterns)
2. Test review (coverage, edge cases)
3. Documentation review (README, registry)
4. Approve or request changes

### Security Review (Amos)

1. Security checklist review (in `.squad/agents/amos/`)
2. Manual testing (injection, SSRF, off-domain)
3. Evidence review (captured correctly?)
4. Approve or request remediation

### Architect Review (Holden)

1. Confirm all DoD items met
2. Validate against ADRs (005, 006, 007)
3. Risk level assessment
4. Approve status change to "implemented"

---

## Maintenance & Monitoring

Even after reaching "implemented" status, adapters require ongoing maintenance:

### Weekly

- [ ] Review drift alerts for this council
- [ ] Check confidence score trend (should be stable ≥ 0.70)
- [ ] Review acquisition error rate (should be < 5%)

### Monthly

- [ ] Re-validate selectors against live website (browser adapters)
- [ ] Update canary postcode if needed
- [ ] Review security profile (any new domains?)

### Quarterly

- [ ] Full DoD re-assessment (especially after council website changes)
- [ ] Refresh Amos security review
- [ ] Update documentation (README, discovery notes)

### Annually

- [ ] Penetration testing (external security assessment)
- [ ] Adapter refactoring (if patterns have evolved)
- [ ] Risk level re-assessment

---

## Exceptions & Waivers

In rare cases, an adapter may achieve "implemented" status with DoD waivers.

### When to Waive

- Temporary blocker (e.g., council website maintenance)
- Known limitation documented and accepted
- Risk accepted by product owner

### Waiver Process

1. Document waiver reason in `src/adapters/{council}/WAIVERS.md`
2. Risk acceptance signed by Holden + Amos
3. Waiver review date scheduled (maximum 90 days)
4. Adapter status annotated: `implemented (waiver: {reason})`

### Example Waivers

- **Confidence < 0.70:** Accepted if data is better than nothing (rare councils)
- **SELECTORS_VALIDATED=false:** Accepted if council allows headless browser (no visual verification needed)
- **80% test coverage:** Accepted if adapter is simple (e.g., single API call with minimal logic)

**Note:** Security items (Amos review, no secrets, egress restriction) are **NEVER** waived.

---

## Questions?

**General DoD Questions:** Ask Naomi (Adapter Engineer)  
**Security Questions:** Ask Amos (Security Engineer)  
**Architecture Questions:** Ask Holden (Lead Architect)  
**Process Questions:** Check `docs/runbooks/new-adapter-checklist.md`

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Holden | Initial Definition of Done |
