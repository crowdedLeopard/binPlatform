# Phase 4 Security Sign-Off — Hampshire Bin Platform

**Version:** 1.0  
**Security Engineer:** Amos  
**Date:** 2026-03-25  
**Classification:** Internal  

---

## Executive Summary

This document provides the formal security review and sign-off for the Hampshire Bin Collection Data Platform Phase 4 pre-production security hardening.

**SECURITY ASSESSMENT: CONDITIONAL APPROVAL**

**PRODUCTION READINESS STATUS: ❌ BLOCKED**

The platform demonstrates **strong foundational security architecture** with comprehensive threat modeling, defense-in-depth controls, and privacy-by-design principles. However, **2 critical gaps must be resolved** before production launch.

---

## Blocking Issues for Production

### P0-001: No Automated Dependency Scanning in CI/CD

**Risk:** Critical (Supply chain vulnerability)  
**Status:** ❌ BLOCKING  
**Owner:** Drummer (Infrastructure)

**Finding:**
- `npm audit` and `security:audit` scripts exist but are not integrated into CI/CD pipeline
- Critical/high vulnerabilities can be merged without detection
- No container image scanning (Trivy, Snyk, or equivalent)
- No automated blocking on CVE detection

**Required Actions:**
1. Implement GitHub Actions workflow with `npm audit` (blocks on critical/high CVEs)
2. Add Trivy container image scanning to CI pipeline
3. Define and document patching SLA (Critical=24h, High=7d, Medium=30d)
4. Generate SBOM in build pipeline (CycloneDX or SPDX format)

**Acceptance Criteria:**
- [ ] CI pipeline fails on critical/high npm vulnerabilities
- [ ] Container images scanned before deployment
- [ ] Patching SLA documented in runbooks
- [ ] SBOM artifact generated and stored

**Estimated Fix Time:** 3-5 days

---

### P0-002: No SIEM Integration or Centralized Security Monitoring

**Risk:** Critical (Security event blindness)  
**Status:** ❌ BLOCKING  
**Owner:** Drummer (Observability)

**Finding:**
- Comprehensive audit logging implemented BUT logs only in stdout (ephemeral)
- `shipToSiem()` method exists but is a placeholder (no implementation)
- No automated alerting on critical security events
- Incident auto-creation exists but no notification routing
- Audit logs may be lost on container restart

**Required Actions:**
1. Implement SIEM integration (Azure Sentinel, Splunk, or Datadog)
2. Configure real-time audit log forwarding
3. Set up automated alerting for critical security events
4. Configure on-call notification (PagerDuty, Opsgenie, or equivalent)
5. Configure immutable audit log storage (Azure Blob with WORM policy)

**Acceptance Criteria:**
- [ ] Audit events forwarded to SIEM in real-time
- [ ] Alerts configured for critical events (auth failures, injection attempts, enumeration)
- [ ] On-call rotation configured with notification routing
- [ ] Audit logs stored in immutable storage with 2-year retention
- [ ] Test alert delivered to on-call engineer within 5 minutes

**Estimated Fix Time:** 5-7 days

---

## High-Priority Fixes (Phase 4 - This Sprint)

### HP-001: Security Header Misconfigurations

**Risk:** High (Security misconfiguration)  
**Status:** ⚠️ REQUIRES FIX  
**Owner:** Holden (API Implementation)

**Findings:**
1. ❌ Permissions-Policy header not configured (should disable unused browser features)
2. ❌ Cache-Control not set for sensitive endpoints (API responses may be cached)
3. ❌ Server version header may be exposed in responses

**Required Actions:**
- Add Permissions-Policy to Helmet configuration
- Implement cache control middleware for sensitive endpoints
- Remove Server and X-Powered-By headers

**Code Changes Required:**
- `src/api/server.ts`: Add Permissions-Policy to Helmet config
- `src/api/server.ts`: Add onSend hook to remove server headers
- `src/api/middleware/cache-control.ts`: Implement cache control middleware (new file)

**Acceptance Criteria:**
- [ ] Permissions-Policy header present in all responses
- [ ] Sensitive endpoints return Cache-Control: no-store
- [ ] Server header not present in responses
- [ ] Mozilla Observatory scan score: A or A+

**Estimated Fix Time:** 2-3 hours (code changes implemented in this phase)

---

## Controls Verified

| Control Category | Status | Notes |
|---|---|---|
| **Authentication & Authorization** | ✅ PASS | API key auth + RBAC implemented |
| **Input Validation** | ✅ PASS | Injection detection middleware, schema validation |
| **Output Encoding** | ✅ PASS | JSON responses, CSP headers |
| **Rate Limiting** | ✅ PASS + ENHANCED | Global + endpoint-specific limits (Phase 4 enhancement) |
| **Enumeration Detection** | ✅ PASS | Sliding window, soft/hard blocks |
| **Bot Detection** | ✅ ENHANCED | User-Agent analysis added (Phase 4 enhancement) |
| **Audit Logging** | ✅ PASS | Comprehensive structured logging with HMAC signatures |
| **Secrets Management** | ✅ PASS | No secrets in code, environment variable config |
| **Security Headers** | ⚠️ PARTIAL | Core headers present, minor fixes required |
| **Egress Controls** | ✅ PASS | Per-adapter allowlists (infrastructure layer) |
| **Container Hardening** | ✅ PASS | Non-root, resource limits, read-only filesystem |
| **Kill Switches** | ✅ PASS | Per-adapter kill switches implemented |
| **Data Retention** | ✅ PASS | Automated purge with 90-day evidence limit |
| **Incident Response** | ✅ DOCUMENTED | Playbook and breach containment guide complete |
| **Dependency Scanning** | ❌ FAIL | **P0 BLOCKER** - Not in CI/CD |
| **SIEM Integration** | ❌ FAIL | **P0 BLOCKER** - Not implemented |

---

## OWASP Top 10 Assessment Summary

| Category | Status | Blocker? | Notes |
|---|---|---|---|
| A01: Broken Access Control | ✅ PASS | No | API key auth + RBAC enforced |
| A02: Cryptographic Failures | ✅ PASS | No | TLS 1.2+, HSTS, secrets in Key Vault |
| A03: Injection | ✅ PASS | No | Parameterized queries, injection detection middleware |
| A04: Insecure Design | ✅ PASS | No | Comprehensive threat modeling, defense in depth |
| A05: Security Misconfiguration | ⚠️ PARTIAL | No | Security headers need minor fixes |
| A06: Vulnerable Components | ❌ FAIL | **YES** | **No automated dependency scanning** |
| A07: Auth Failures | ✅ PASS | No | High-entropy keys, bcrypt hashing, rate limiting |
| A08: Integrity Failures | ⚠️ PARTIAL | No | Lockfile committed, no image signing |
| A09: Logging Failures | ❌ PARTIAL FAIL | **YES** | **No SIEM integration** |
| A10: SSRF | ✅ PASS | No | Egress allowlists, no user-provided URLs |

**OWASP Score: 7/10 PASS, 1/10 PARTIAL, 2/10 FAIL (2 blockers)**

---

## Security Enhancements Delivered (Phase 4)

### 1. Endpoint-Specific Rate Limiting ✅

**Implementation:** `src/api/middleware/endpoint-rate-limiting.ts`

**Rationale:**
Address resolution and property lookup are expensive operations requiring upstream queries. These endpoints are now protected with stricter rate limits than cheap cached endpoints.

**Configuration:**
- Expensive endpoints (address resolution): 20 req/15min per IP
- Moderate endpoints (property lookup): 30 req/15min per IP
- Cheap endpoints (collections, health): 100 req/15min per IP

**Benefits:**
- Protects expensive operations from abuse
- Prevents resource exhaustion
- Maintains good UX for legitimate usage

---

### 2. User-Agent Bot Detection ✅

**Implementation:** `src/api/middleware/bot-detection.ts`

**Rationale:**
Many bots use identifiable User-Agent strings. Blocking obvious bot signatures reduces automated abuse without impacting legitimate users.

**Detection Patterns:**
- Headless browsers (HeadlessChrome, Puppeteer, Playwright)
- CLI tools (curl, wget, python-requests)
- Web scrapers (Scrapy, BeautifulSoup)
- Generic bot keywords

**Actions:**
- Block with 403 Forbidden (generic error, no detection logic revealed)
- Log to audit trail as ADAPTER_BOT_BLOCKED
- Allowlist for legitimate monitoring tools (configurable)

**Benefits:**
- Blocks unsophisticated bots immediately
- Reduces load from automated scrapers
- Complements behavioral detection

---

### 3. Security Documentation Complete ✅

**Documents Produced:**
1. `docs/security/owasp-top10-assessment.md` - Comprehensive OWASP Top 10 review
2. `docs/security/abuse-resistance-review.md` - Abuse controls assessment with improvements
3. `docs/security/security-headers-audit.md` - Header-by-header security analysis
4. `docs/security/secrets-handling-review.md` - Secrets management audit
5. `docs/runbooks/security-incident-response.md` - P0/P1/P2 incident playbook
6. `docs/runbooks/breach-containment.md` - Data breach containment procedures
7. `docs/security/phase4-security-signoff.md` - This document

**Total Documentation:** 7 comprehensive security documents

---

## Recommended Future Enhancements

### Phase 4.1 (Pre-Production Hardening)

**Not Blockers, But Strongly Recommended:**

1. **Per-API-Key Rate Limiting**
   - Track rate limits by API key in addition to IP
   - Prevent IP rotation bypass attacks
   - Estimated effort: 2 days

2. **Per-API-Key Enumeration Tracking**
   - Track unique postcodes per API key
   - Detect abuse even with IP rotation
   - Estimated effort: 1 day

3. **Application-Layer IP Allowlisting**
   - Add IP allowlist field to API key records
   - Enforce at application layer (defense in depth)
   - Estimated effort: 1 day

4. **Externalize Injection Detection Patterns**
   - Move patterns to JSON config file
   - Update patterns without code deployment
   - Estimated effort: 0.5 days

5. **Container Image Signing**
   - Sign images with Cosign
   - Verify signatures at deployment
   - Estimated effort: 2 days

6. **Enforce Signed Commits**
   - Require GPG signatures on main branch
   - GitHub branch protection rule
   - Estimated effort: 0.5 days

### Phase 4.2 (Post-Launch)

7. **Penetration Testing**
   - External security assessment
   - OWASP Top 10 validation
   - Estimated effort: External vendor (1-2 weeks)

8. **Circuit Breaker Implementation**
   - Automatic upstream request throttling
   - Prevent council site amplification attacks
   - Estimated effort: 2 days

9. **Request Timing Analysis**
   - Detect too-regular bot request intervals
   - Behavioral bot detection enhancement
   - Estimated effort: 3 days

10. **CAPTCHA Integration**
    - Challenge-response for soft-blocked IPs
    - hCaptcha or reCAPTCHA
    - Estimated effort: 2 days

---

## Production Readiness Checklist

### Critical (Must Complete Before Launch)

- [ ] **P0-001:** Automated dependency scanning in CI/CD
- [ ] **P0-002:** SIEM integration with alerting
- [✅] **HP-001:** Security header fixes (implemented in this phase)
- [ ] **CI/CD Pipeline:** Dependency scanning integrated
- [ ] **CI/CD Pipeline:** Container image scanning integrated
- [ ] **Monitoring:** SIEM receiving audit events
- [ ] **Monitoring:** Alerts configured and tested
- [ ] **On-Call:** Rotation defined and notification tested

### Recommended (Strongly Encouraged)

- [✅] Phase 4 security enhancements (bot detection, endpoint rate limiting)
- [✅] Security documentation complete
- [✅] Incident response playbook
- [✅] Breach containment guide
- [ ] Penetration testing scheduled
- [ ] Pre-commit secret scanning (Husky + gitleaks)
- [ ] Container image signing (Cosign)
- [ ] Signed commits enforced (GitHub branch protection)

### Post-Launch (First 30 Days)

- [ ] External penetration test
- [ ] Incident response drill (tabletop exercise)
- [ ] Threat model review
- [ ] Security metric baseline establishment
- [ ] Quarterly security review scheduled

---

## Conditions for Production Approval

**The platform SHALL NOT be deployed to production until:**

1. ✅ **All P0 blocking issues are resolved** (P0-001, P0-002)
2. ✅ **All high-priority fixes are implemented** (HP-001)
3. ✅ **SIEM integration is tested** (test alert delivered within 5 min)
4. ✅ **On-call rotation is configured** (escalation path verified)
5. ✅ **Dependency scanning is operational** (CI pipeline blocks on critical CVE)
6. ✅ **Container scanning is operational** (images scanned before deployment)
7. ✅ **Incident response plan is reviewed** (team trained on playbook)

**Estimated Time to Production Readiness:** 7-10 working days

---

## Security Sign-Off

**I, Amos (Security Engineer), have reviewed the Hampshire Bin Collection Data Platform and provide the following security assessment:**

**Security Posture:** STRONG with identified gaps  
**Production Readiness:** ❌ BLOCKED (2 critical issues)  
**Approval Status:** CONDITIONAL APPROVAL  

**Conditions:**
- P0-001 (Dependency Scanning) MUST be resolved before launch
- P0-002 (SIEM Integration) MUST be resolved before launch
- HP-001 (Security Headers) fixes implemented and verified

**Post-Resolution:**
Upon successful resolution of P0 and HP issues, I will provide **UNCONDITIONAL APPROVAL** for production deployment.

**Next Steps:**
1. Drummer to implement P0-001 (dependency scanning in CI/CD)
2. Drummer to implement P0-002 (SIEM integration with alerting)
3. Holden to verify HP-001 security header fixes
4. Amos to conduct final security verification
5. Sign-off revision with UNCONDITIONAL APPROVAL

---

**Signature:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Review Cycle:** 30 days post-launch, then quarterly  

---

## Appendices

### Appendix A: Security Documentation Index

1. Threat Model (`docs/threat-model/threat-model.md`)
2. STRIDE Assessment (`docs/threat-model/stride-assessment.md`)
3. Abuse Cases (`docs/threat-model/abuse-cases.md`)
4. Security Controls (`docs/threat-model/security-controls.md`)
5. Data Classification (`docs/threat-model/data-classification.md`)
6. OWASP Top 10 Assessment (`docs/security/owasp-top10-assessment.md`)
7. Abuse Resistance Review (`docs/security/abuse-resistance-review.md`)
8. Security Headers Audit (`docs/security/security-headers-audit.md`)
9. Secrets Handling Review (`docs/security/secrets-handling-review.md`)
10. Incident Response Playbook (`docs/runbooks/security-incident-response.md`)
11. Breach Containment Guide (`docs/runbooks/breach-containment.md`)
12. Phase 4 Security Sign-Off (`docs/security/phase4-security-signoff.md`)

### Appendix B: Security Contact Information

**Security Team:**
- Security Engineer: Amos
- Platform Lead: Holden
- Infrastructure Lead: Drummer

**Incident Response:**
- Primary On-Call: [Rotating weekly]
- Escalation: [CTO]
- Legal: [Legal team contact]

**External Resources:**
- Penetration Testing: [TBD]
- Security Advisory: [TBD]
- CERT: [UK CERT contact]

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial Phase 4 security sign-off - CONDITIONAL APPROVAL |

