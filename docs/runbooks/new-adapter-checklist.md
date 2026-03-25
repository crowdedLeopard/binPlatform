# New Adapter Rollout Checklist

**Purpose:** Ensure every new council adapter meets production readiness requirements before going live.

**Owner:** DevOps/Infrastructure Team  
**Last Updated:** 2026-03-25  
**Related Documents:**
- [Drift Response Runbook](./drift-response.md)
- [Synthetic Monitoring Guide](./synthetic-monitoring.md)
- [Branch Protection Setup](./branch-protection.md)

---

## Pre-Rollout Checklist

Before marking an adapter as **production-ready**, verify all items below.

### ✅ Code Requirements

- [ ] **Adapter implements full `CouncilAdapter` interface**
  - Verify: `getMetadata()`, `checkHealth()`, `acquire()`, `cleanup()` methods present
  - Verify: All methods have proper type signatures matching interface

- [ ] **Kill switch respected in all public methods**
  - Verify: `acquire()` checks kill switch before execution
  - Verify: `checkHealth()` reports kill switch status
  - Verify: Kill switch environment variable follows naming convention: `ADAPTER_KILL_SWITCH_{COUNCIL_ID}`

- [ ] **Egress restricted to council domain only**
  - Verify: No hardcoded external URLs (CDNs, third-party services) unless documented
  - Verify: Playwright navigation limited to council domain
  - Verify: No fetch/axios calls to non-council domains

- [ ] **Evidence captured and stored**
  - Verify: Screenshots/HTML snapshots saved to blob storage
  - Verify: Evidence metadata includes timestamp, council_id, acquisition_type
  - Verify: Evidence references stored in database `evidence` table

- [ ] **Parser handles malformed responses without crash**
  - Verify: Try-catch blocks around all DOM parsing
  - Verify: Graceful fallback if selector not found
  - Verify: Returns `{ success: false, error: ... }` instead of throwing

- [ ] **Security profile documented**
  - Verify: `README.md` in adapter directory lists security risks
  - Verify: Risk level (API/Browser/Hybrid) declared in metadata
  - Verify: Any known PII exposure documented

---

### ✅ Infrastructure Requirements

- [ ] **Domain added to egress allowlist (Terraform)**
  - File: `infra/terraform/modules/networking/egress-allowlist.tf`
  - Verify: Domain added to `council_egress_destinations` map
  - Verify: Description includes "— adapter worker egress"
  - Verify: Any third-party delegates (e.g., FCC Environment) added with comment

- [ ] **Kill switch env var added to `.env.example`**
  - File: `.env.example`
  - Verify: Entry follows pattern: `ADAPTER_KILL_SWITCH_{COUNCIL_ID}=false`
  - Verify: Comment block header present (only once for all councils)

- [ ] **Canary postcode defined**
  - File: `.env.example`
  - Verify: `CANARY_POSTCODE_{COUNCIL_ID}=XX00 0XX` added
  - Verify: Postcode is real and publicly documented
  - Verify: Postcode added to `deploy/docker-compose.yml` monitor service environment

- [ ] **NSG rule verified (Browser adapters only)**
  - File: `infra/terraform/modules/networking/browser-adapter-nsg.tf`
  - Verify: NSG applied to browser adapter subnet
  - Verify: HTTPS (443) allowed to council domain
  - Verify: Flow logs enabled for denied connection monitoring

---

### ✅ Testing Requirements

- [ ] **Unit tests passing (>80% coverage)**
  - Run: `npm run test:unit -- src/adapters/{council-id}`
  - Verify: All adapter methods covered
  - Verify: Edge cases tested (empty response, timeout, malformed HTML)

- [ ] **Security tests passing**
  - Run: `npm run test:security -- src/adapters/{council-id}`
  - Verify: No secrets hardcoded
  - Verify: No SQL injection vectors in dynamic queries
  - Verify: No command injection in Playwright scripts

- [ ] **Kill switch test passing**
  - Test: Set `ADAPTER_KILL_SWITCH_{COUNCIL_ID}=true` and verify:
    - `checkHealth()` returns `{ available: false, reason: 'kill switch enabled' }`
    - `acquire()` returns error without executing
  - Verify: Test exists in test suite

- [ ] **Integration health check passing**
  - Run: `npm run test:integration -- src/adapters/{council-id}`
  - Verify: Adapter initializes without errors
  - Verify: `checkHealth()` returns healthy status
  - Verify: Mock acquisition succeeds (if applicable)

---

### ✅ Monitoring Requirements

- [ ] **Adapter appears in `/v1/admin/adapters/health` endpoint**
  - Run API locally: `npm run dev`
  - Call: `GET http://localhost:3000/v1/admin/adapters/health`
  - Verify: Council ID present in response
  - Verify: Health status is "healthy" or "degraded" (not error)

- [ ] **Prometheus metrics visible**
  - Run observability stack: `docker-compose -f docker-compose.observability.yml up`
  - Query Prometheus: `http://localhost:9090/graph`
  - Verify: `adapter_health_status{council_id="{COUNCIL_ID}"}` metric exists
  - Verify: `adapter_confidence_score{council_id="{COUNCIL_ID}"}` metric exists

- [ ] **Grafana panel showing**
  - Open Grafana: `http://localhost:3001` (admin/admin)
  - Dashboard: "Adapter Health Overview"
  - Verify: Council ID appears in dropdown filter
  - Verify: Health, confidence, and drift panels render

- [ ] **Alert rules firing correctly in test**
  - Simulate failure: Set kill switch to true, wait 5 minutes
  - Query Prometheus alerts: `http://localhost:9090/alerts`
  - Verify: `AdapterUnavailable` alert fires
  - Verify: Alert includes correct `council_id` label

---

### ✅ Documentation Requirements

- [ ] **README.md with acquisition path**
  - File: `src/adapters/{council-id}/README.md`
  - Required sections:
    - Overview (council name, population, bin types)
    - Acquisition Method (API/Browser/Hybrid)
    - Data Flow (step-by-step acquisition process)
    - Selectors/Endpoints (with validation status)
    - Known Issues
    - Security Considerations

- [ ] **Council registry entry updated**
  - File: `data/council-registry.json`
  - Verify: `adapter_status` set to "ready" (not "postponed" or "in_progress")
  - Verify: `adapter_type` matches implementation (api/browser/hybrid)
  - Verify: `upstream_url` is current
  - Verify: `upstream_risk_level` assessed

- [ ] **Selectors validated against live site**
  - Open council website in browser
  - Verify: All CSS selectors in adapter code still exist on page
  - Verify: Test with real postcode (use canary)
  - Update: Set `SELECTORS_VALIDATED=true` in adapter metadata

- [ ] **Upstream risk level confirmed**
  - Assess: How often does council change website design?
  - Check: Historical frequency of drift incidents (if applicable)
  - Document: Risk level (low/medium/high) in council registry
  - Note: High risk = requires more frequent synthetic checks

---

### ✅ Security Requirements

- [ ] **Amos (Security Team) review completed**
  - Required for: All browser-based adapters
  - Required for: Any adapter using third-party delegates
  - Approval documented in: PR comment or Slack thread
  - Checklist items reviewed:
    - XSS vectors in DOM manipulation
    - SSRF risks in URL construction
    - PII handling (GDPR compliance)

- [ ] **No secrets in adapter code**
  - Run: `detect-secrets scan src/adapters/{council-id}`
  - Verify: No API keys, tokens, credentials hardcoded
  - Verify: All secrets loaded from environment variables

- [ ] **Dependencies scanned**
  - Run: `npm audit --scope=@binday/adapter-{council-id}`
  - Verify: No high/critical vulnerabilities in adapter dependencies
  - Verify: Playwright version up-to-date (if browser adapter)

- [ ] **SELECTORS_VALIDATED flag reviewed**
  - Verify: Flag set to `true` only if selectors tested against live site in last 7 days
  - Verify: Flag set to `false` if selectors untested or website changed
  - Impact: Affects confidence score calculation

---

## Post-Rollout Validation

After merging to `main` and deploying to production:

1. **Monitor for 24 hours:**
   - [ ] Check Grafana dashboard every 4 hours
   - [ ] Verify no spike in error rates
   - [ ] Verify confidence score remains >0.8

2. **Test synthetic check:**
   - [ ] Wait for first scheduled synthetic check (5 min interval)
   - [ ] Verify check succeeds
   - [ ] Verify metrics updated in Prometheus

3. **Test real acquisition:**
   - [ ] Use canary postcode via API: `POST /v1/collections?postcode={CANARY}`
   - [ ] Verify: Collection schedules returned
   - [ ] Verify: Evidence stored in blob storage
   - [ ] Verify: Audit log entry created

4. **Test kill switch:**
   - [ ] Enable kill switch via environment variable
   - [ ] Verify: Adapter stops processing requests
   - [ ] Verify: Health check reports "unavailable"
   - [ ] Disable kill switch and verify recovery

---

## Rollback Procedure

If adapter fails in production:

1. **Immediate:** Enable kill switch (< 5 minutes)
   ```bash
   # Set environment variable in production
   ADAPTER_KILL_SWITCH_{COUNCIL_ID}=true
   # Restart API/Worker pods
   kubectl rollout restart deployment/api -n binday-prod
   ```

2. **Within 1 hour:** Investigate root cause
   - Check logs: `kubectl logs -l app=worker --tail=1000 | grep {COUNCIL_ID}`
   - Check metrics: Grafana dashboard, filter by `council_id`
   - Check drift: Compare current page structure with selectors

3. **Within 24 hours:** Fix and redeploy OR extend kill switch
   - If fixable: PR with fix + tests
   - If complex: Leave kill switch on, schedule fix for next sprint
   - Document: Post-incident review in `.squad/decisions/inbox/`

---

## Checklist Summary

**Total Items:** 35

**Pass Criteria:** All 35 items checked before production release.

**Responsible Parties:**
- Code Requirements: Adapter Developer
- Infrastructure: DevOps Engineer (Drummer)
- Testing: QA + Adapter Developer
- Monitoring: DevOps Engineer (Drummer)
- Documentation: Adapter Developer
- Security: Security Team (Amos) + Adapter Developer
- Post-Rollout: DevOps Engineer (Drummer)

---

## Automation Opportunities

**Future improvements:**
- CI job to auto-check 80% of checklist items
- Terraform validation to ensure domain added before adapter merge
- Pre-commit hook to verify README.md exists
- Automated selector validation via headless browser test

**Tracking:** Add GitHub issue template for "New Adapter Rollout" that generates this checklist.
