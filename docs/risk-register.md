# Production Risk Register — Hampshire Bin Platform

**Version:** 1.0  
**Owner:** Holden (Lead Architect)  
**Last Updated:** 2026-03-25  
**Review Frequency:** Monthly (first 3 months), Quarterly thereafter

---

## Risk Rating Matrix

**Likelihood:**
- **High:** >50% chance within 6 months
- **Medium:** 10-50% chance within 6 months
- **Low:** <10% chance within 6 months

**Impact:**
- **Critical:** Service outage, data breach, legal liability
- **High:** Significant degradation, loss of trust, major rework
- **Medium:** Limited degradation, user friction, minor rework
- **Low:** Minimal impact, cosmetic issues

**Risk Score:** Likelihood × Impact (1-9 scale)

---

## Active Risks

| ID | Risk | Likelihood | Impact | Score | Mitigations | Owner | Status |
|---|---|---|---|---|---|---|---|
| **R01** | Council changes page structure (browser adapters break) | **High** | **Medium** | 6 | Drift detection, selector validation, monitoring, kill switches | Naomi | ACCEPTED |
| **R02** | Bot protection added to currently accessible council | **Medium** | **Medium** | 4 | Postponed status workflow, manual review, partnership outreach | Naomi | ACCEPTED |
| **R03** | UPRN lookup returns incorrect property (boundary edge case) | **Low** | **High** | 3 | Confidence scoring, evidence retention, user confirmation UI, deduplication | Holden | MITIGATED |
| **R04** | Rate limiting insufficient for sustained abuse | **Medium** | **High** | 6 | Enumeration detection, per-IP limits, anomaly monitoring, kill switches | Amos | MITIGATED |
| **R05** | Dependency vulnerability in critical package (Playwright, Hono, etc.) | **Medium** | **High** | 6 | Trivy scanning, Dependabot, weekly dependency updates, security advisories | Drummer | MITIGATED |
| **R06** | Azure Blob storage outage impacts evidence storage | **Low** | **Low** | 1 | Evidence is non-critical to operations (diagnostic only), eventual consistency acceptable | Drummer | ACCEPTED |
| **R07** | PostgreSQL corruption / data loss | **Low** | **High** | 3 | Backup procedure (PITR enabled), managed PaaS recommended, monitoring | Drummer | OPEN |
| **R08** | Redis failure causes no caching, performance degradation | **Medium** | **Medium** | 4 | Graceful degradation (direct adapter calls), Redis cluster (HA mode), monitoring | Drummer | OPEN |
| **R09** | API key leaked in public repository or logs | **Low** | **High** | 3 | Secret scanning (GitHub Advanced Security), log redaction, key rotation, anomaly detection | Amos | MITIGATED |
| **R10** | Adapter infinite loop or resource exhaustion | **Medium** | **Medium** | 4 | Timeout enforcement (30s navigation, 30s parse), resource limits, container isolation | Naomi | MITIGATED |
| **R11** | Council website serves malicious content (XSS in evidence) | **Low** | **Medium** | 2 | Evidence served as text/plain, Content-Security-Policy, no direct rendering | Amos | MITIGATED |
| **R12** | Confidence score miscalculates (algorithm bug) | **Low** | **High** | 3 | Unit tests (≥80% coverage), confidence breakdown logged, ADR-006 review process | Holden | MITIGATED |
| **R13** | GDPR complaint — user claims PII stored inappropriately | **Low** | **Critical** | 3 | No PII stored (public data only), postcode prefix logging only, legal review, GDPR assessment | Amos | OPEN |
| **R14** | DDoS attack overwhelms API (volumetric or application-layer) | **Medium** | **High** | 6 | Azure Front Door (WAF), rate limiting, CDN, DDoS protection plan | Drummer | OPEN |
| **R15** | Adapter scraping detected as abuse, council demands shutdown | **Low** | **High** | 3 | Polite scraping (rate limits, User-Agent), evidence of public benefit, legal standing, partnership approach | Holden | ACCEPTED |
| **R16** | Browser adapter headless mode detected and blocked | **High** | **Medium** | 6 | Playwright Stealth (already implemented), user-agent rotation, fallback to headed mode | Naomi | MITIGATED |
| **R17** | OpenAPI spec diverges from implementation (breaking docs) | **Medium** | **Low** | 2 | Spec-driven development, integration tests against spec, automated validation | Holden | MITIGATED |
| **R18** | Multi-council overlap deduplication fails (wrong property) | **Low** | **High** | 3 | UPRN-based deduplication (ADR-007), confidence penalties, user confirmation, logging | Holden | MITIGATED |
| **R19** | Kill switch accidentally left active, council unavailable | **Low** | **Medium** | 2 | Kill switch dashboard, auto-disable after N hours (configurable), alerts, audit logging | Amos | MITIGATED |
| **R20** | Terraform/infrastructure code bug causes production outage | **Low** | **Critical** | 3 | Terraform plan review, staging deployment first, blue/green deployment, rollback plan | Drummer | OPEN |

---

## Closed Risks

| ID | Risk | Resolution | Closed Date |
|---|---|---|---|
| R21 | No structured error codes (clients can't handle errors) | Implemented 12 standardized error codes (ADR, API docs) | 2026-03-25 |
| R22 | No confidence scoring (bad data presented as authoritative) | Implemented multi-factor confidence scoring (ADR-006) | 2026-03-25 |
| R23 | No audit logging (no forensics after incident) | Implemented audit log with HMAC integrity (Phase 3) | 2026-03-25 |

---

## Detailed Risk Analysis

### R01: Council Changes Page Structure (Browser Adapters Break)

**Description:**  
Browser-based adapters rely on CSS selectors to extract data from council websites. When councils redesign their websites or change HTML structure, selectors may break, causing parsing failures.

**Likelihood: High**  
- 8 of 11 adapters use browser automation
- Councils redesign websites every 1-3 years
- No advance notice typically given
- Historical evidence: Winchester redesigned in 2025, broke scrapers

**Impact: Medium**  
- Single council affected (not platform-wide)
- Confidence scores drop, drift detection triggers alert
- Kill switch can disable adapter within minutes
- Users see cached data or "temporarily unavailable"
- Adapter can usually be fixed within 4-24 hours

**Mitigations:**
1. **Drift detection:** Automatic detection within 5 minutes of schema change
2. **Selector validation:** `SELECTORS_VALIDATED=true` requires live verification
3. **Fallback selectors:** Where possible, multiple selector paths
4. **Monitoring:** Synthetic checks every 5 minutes with canary postcodes
5. **Kill switches:** Immediate disablement if breaking drift detected
6. **Runbook:** Documented response procedures in `docs/runbooks/drift-response.md`
7. **Evidence capture:** Before/after HTML snapshots for forensic analysis

**Acceptance Rationale:**  
Browser automation is inherently brittle, but:
- Provides access to 8 councils with no public API
- Drift detection + kill switches limit blast radius
- Adapter fixes typically within 24 hours
- Cost of partnership approach (manual data entry) is higher

**Owner:** Naomi (Adapter Engineer)  
**Status:** ACCEPTED

---

### R03: UPRN Lookup Returns Incorrect Property

**Description:**  
UPRNs (Unique Property Reference Numbers) are canonical property identifiers, but in edge cases (e.g., postcode boundary overlaps, new developments, UPRN reassignment), UPRN lookup may return the wrong property.

**Likelihood: Low**  
- UPRNs are nationally standardized (OS AddressBase)
- Errors typically at postcode boundaries or new developments
- Estimated <0.1% of lookups affected
- Overlap postcodes documented (GU11, GU12, GU14, SO51)

**Impact: High**  
- User gets wrong bin collection dates
- Potential missed collection (user dissatisfaction)
- Trust in platform undermined
- No safety-critical impact (bins, not healthcare)

**Mitigations:**
1. **Confidence scoring:** Low-confidence results flagged clearly
2. **Evidence retention:** Every lookup logged with UPRN, postcode, address
3. **User confirmation:** Frontend should display full address for user to verify
4. **Deduplication:** ADR-007 multi-council overlap handling with UPRN dedup
5. **Logging:** Postcode prefix logged (not full address) for pattern analysis
6. **User feedback:** (Planned Month 2) Allow users to report incorrect data

**Acceptance Rationale:**
- UPRN is most reliable identifier available (better than address string matching)
- Confidence scoring ensures low-confidence results are flagged
- User confirmation UI is client responsibility (API provides data, client confirms)
- Impact is low (missed bin collection, not life-safety)

**Owner:** Holden (Lead Architect)  
**Status:** MITIGATED

---

### R04: Rate Limiting Insufficient for Sustained Abuse

**Description:**  
Current rate limiting design (per-IP, per-API-key) may not prevent sophisticated abuse patterns (distributed attacks, slow enumeration, API key sharing).

**Likelihood: Medium**  
- Public API with free tier attractive to abuse
- Postcode enumeration possible (Hampshire has ~760K households)
- IP rotation via VPN/Tor bypasses per-IP limits
- API key sharing among users

**Impact: High**  
- Excessive load on council websites (reputational risk)
- Platform costs increase (compute, egress)
- Legitimate users degraded service (slower responses)
- Potential council complaints or blocking

**Mitigations:**
1. **Enumeration detection:** Security events triggered on suspicious patterns (sequential postcodes, high volume)
2. **Per-IP limits:** 10 req/min for unauthenticated, configurable per key for authenticated
3. **Anomaly monitoring:** Prometheus metrics + Grafana alerts on unusual traffic patterns
4. **Kill switches:** Global adapter kill switch can halt all acquisitions
5. **API key revocation:** Abusive keys can be revoked immediately
6. **CAPTCHA (future):** Can add CAPTCHA for suspicious IPs (Month 3)
7. **Azure Front Door:** WAF with DDoS protection, rate limiting at edge (not yet deployed)

**Current Gap:**  
- Rate limiting not yet enforced (C3 critical gap in production readiness)
- Enumeration detection framework exists but thresholds not tuned

**Owner:** Amos (Security Engineer)  
**Status:** MITIGATED (but implementation incomplete)

**Action Items:**
- [ ] Wire rate limiting to Redis (Week 1)
- [ ] Tune enumeration thresholds (100 requests in 10 min = suspicious)
- [ ] Deploy Azure Front Door with WAF (Month 2)

---

### R07: PostgreSQL Corruption / Data Loss

**Description:**  
Database corruption, accidental deletion, or infrastructure failure could result in loss of council metadata, property mappings, or audit logs.

**Likelihood: Low**  
- Managed PaaS (Azure Database for PostgreSQL) has built-in HA
- PITR (Point-in-Time Recovery) enabled with 7-day retention
- Corruption rare on managed services
- Human error (DROP TABLE, etc.) more likely than hardware failure

**Impact: High**  
- Loss of council metadata disrupts adapter routing
- Loss of property mappings requires re-resolution (user friction)
- Loss of audit logs violates compliance requirements
- Loss of confidence logs loses historical trending

**Mitigations:**
1. **Backups:** Automated daily backups with 7-day retention (Azure managed)
2. **PITR:** Point-in-Time Recovery to any second within 7 days
3. **Least privilege:** Application role has no DDL permissions (cannot DROP TABLE)
4. **Audit logging:** Database audit logging enabled (logs to Azure Monitor)
5. **Staging testing:** All schema changes tested in staging before production
6. **Blue/green deployment:** Can rollback to previous deployment if migration fails

**Current Gap:**
- **Backup/restore not tested** (DR gap in production readiness)
- No runbook for restore procedure
- RTO/RPO not defined (target: RTO <1 hour, RPO <5 minutes)

**Owner:** Drummer (DevOps Lead)  
**Status:** OPEN

**Action Items:**
- [ ] Document backup/restore procedure (Week 2)
- [ ] Test restore in staging (Month 2)
- [ ] Define RTO/RPO SLA (Month 2)
- [ ] Schedule quarterly DR drills (Month 3+)

---

### R13: GDPR Complaint — PII Stored Inappropriately

**Description:**  
User claims platform stores personal identifiable information (PII) without consent, violating GDPR.

**Likelihood: Low**  
- Platform stores only public data (bin collection schedules)
- Postcodes are public information (not PII in UK GDPR interpretation)
- No names, emails, phone numbers, or sensitive data stored
- Evidence captures council website HTML (already public)

**Impact: Critical**  
- Legal liability (GDPR fines up to €20M or 4% revenue)
- Reputational damage
- Platform shutdown pending investigation
- Trust undermined

**Mitigations:**
1. **No PII stored:** Platform stores postcodes, UPRNs (public), bin types, dates (public)
2. **Postcode prefix logging:** Logs contain postcode prefix only (SO50, not SO50 1AA)
3. **Opaque identifiers:** Property IDs are UUIDs, not PII
4. **Data classification:** Documented in `docs/threat-model/data-classification.md`
5. **Legal review:** (Planned Month 2) Legal counsel review of data handling
6. **GDPR assessment:** (Planned Month 2) Formal DPIA (Data Protection Impact Assessment)
7. **Right to be forgotten:** No personal data stored, so no erasure needed (public data)
8. **Privacy Policy:** (Planned Month 2) Clear explanation of data handling

**Current Gap:**
- **GDPR impact assessment not formal** (H-priority gap)
- Privacy Policy not published
- Legal review not scheduled

**Owner:** Amos (Security Engineer) + Legal (external counsel)  
**Status:** OPEN

**Action Items:**
- [ ] Engage legal counsel for GDPR review (Month 2)
- [ ] Complete formal DPIA (Month 2)
- [ ] Draft Privacy Policy (Month 2)
- [ ] Publish Terms of Service (Month 2)

---

### R14: DDoS Attack Overwhelms API

**Description:**  
Volumetric DDoS (network flood) or application-layer DDoS (valid requests at high volume) overwhelms API, causing degraded service or outage.

**Likelihood: Medium**  
- Public API is exposed to internet
- No DDoS protection currently deployed
- Free tier attractive to abuse
- Botnet attacks are common (HTTP/2 rapid reset, etc.)

**Impact: High**  
- Service outage for legitimate users
- Infrastructure costs spike (egress, compute)
- Reputational damage
- May trigger kill switches, further degrading service

**Mitigations:**
1. **Azure DDoS Protection Plan:** (Not yet deployed) Network-layer protection
2. **Azure Front Door:** (Not yet deployed) CDN with WAF, rate limiting at edge
3. **Rate limiting:** Application-layer rate limiting (per-IP, per-key)
4. **Autoscaling:** Container Apps can scale to handle burst traffic
5. **Global kill switch:** Can halt all adapter calls if overwhelmed
6. **Monitoring:** Prometheus metrics for request rate, error rate, latency

**Current Gap:**
- **No DDoS protection at network layer**
- **No CDN/WAF** (C3 critical gap partially)
- **Rate limiting not enforced** (C3 critical gap)

**Owner:** Drummer (DevOps Lead)  
**Status:** OPEN

**Action Items:**
- [ ] Enable Azure DDoS Protection Plan (Month 2)
- [ ] Deploy Azure Front Door with WAF (Month 2)
- [ ] Wire rate limiting (Week 1-2)
- [ ] Load testing to establish baseline (Month 2)

---

## Risk Trends

### Increasing Risks

- **R14 (DDoS):** As platform becomes public, attack surface increases
- **R01 (Drift):** More adapters = more drift surface area

### Decreasing Risks

- **R05 (Dependencies):** Trivy scanning + Dependabot reduce exposure
- **R04 (Rate limiting):** Implementation in progress (Week 1-2)

### Stable Risks

- **R03 (UPRN):** Inherent to UPRN system, mitigations stable
- **R15 (Scraping abuse):** Polite scraping + public benefit narrative stable

---

## Risk Mitigation Roadmap

### Week 1-2 (Critical)

- [ ] **R04, R14:** Wire rate limiting (Redis integration)
- [ ] **R07:** Document backup/restore procedure
- [ ] **R08:** Deploy Redis in HA mode (cluster)

### Month 2 (High Priority)

- [ ] **R13:** Legal review + GDPR assessment
- [ ] **R14:** Deploy Azure Front Door + DDoS Protection
- [ ] **R07:** Test disaster recovery restore
- [ ] **R01:** Selector validation for all browser adapters

### Month 3 (Medium Priority)

- [ ] **R04:** Tune enumeration detection thresholds
- [ ] **R14:** Load testing + capacity planning
- [ ] **R13:** Publish ToS + Privacy Policy
- [ ] **R20:** Terraform module audit

### Ongoing

- [ ] **R05:** Weekly dependency updates (Dependabot)
- [ ] **R01:** Monthly drift monitoring + selector review
- [ ] **All:** Quarterly risk register review

---

## Risk Acceptance Sign-Off

The following risks are **ACCEPTED** for production launch (limited beta):

- **R01:** Browser adapter brittleness (drift detection + kill switches mitigate)
- **R02:** Bot protection may be added (postponed status workflow in place)
- **R06:** Azure Blob outage (evidence non-critical)
- **R15:** Scraping abuse complaints (polite scraping + public benefit)

**Signed:**  
- Holden (Lead Architect) — 2026-03-25  
- Amos (Security Engineer) — ⏳ PENDING (R04, R13 concerns)  
- Drummer (DevOps Lead) — ⏳ PENDING (R07, R08, R14 concerns)

**Condition:** Limited beta (3 councils) acceptable with identified gaps. Full launch requires:
- R04, R08, R14 mitigated (rate limiting, Redis HA, DDoS protection)
- R07 tested (disaster recovery)
- R13 assessed (GDPR legal review)

---

## Risk Escalation

### When to Escalate

- **New critical risk identified** (Impact: Critical)
- **Existing risk materializes** (incident occurs)
- **Risk score increases >2 points** (e.g., Likelihood changes Low → High)
- **Mitigation fails** (e.g., drift detection missed breaking change)

### Escalation Path

1. **Identify risk** (anyone on team)
2. **Document in incident log** (if materialized) or risk register (if new)
3. **Notify Lead Architect (Holden)** within 1 hour for critical, 24 hours for high
4. **Risk review meeting** (Holden, Amos, Drummer, Product Owner)
5. **Mitigation plan** documented with owner, ETA
6. **Risk register updated** with new status

---

## Metrics & Monitoring

### Risk Indicators (KPIs)

| Indicator | Target | Alert Threshold | Dashboard |
|-----------|--------|-----------------|-----------|
| Drift alerts | <5 per week | >10 per week | Grafana / Admin |
| Kill switch activations | <2 per week | >5 per week | Admin dashboard |
| Security events | 0 critical | >1 critical | Security dashboard |
| Average confidence | ≥0.75 | <0.6 for >24h | Prometheus |
| API error rate | <5% | >10% | Grafana |
| Dependency vulnerabilities | 0 critical/high | >1 critical | Trivy CI |

### Risk Dashboard

(Planned Month 2 — Grafana dashboard)

- Risk heatmap (likelihood × impact)
- Trend analysis (risk score over time)
- Mitigation progress (action items completed %)
- Incident correlation (which risks materialized)

---

## References

- **Threat Model:** `docs/threat-model/threat-model.md`
- **Security Controls:** `docs/threat-model/security-controls.md`
- **Kill Switch Strategy:** `docs/threat-model/kill-switch-strategy.md`
- **Drift Response:** `docs/runbooks/drift-response.md`
- **Incident Response:** `docs/threat-model/incident-triggers.md`
- **ADRs:** `docs/adr/ADR-001` through `ADR-007`

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Holden | Initial production risk register (20 risks identified) |
