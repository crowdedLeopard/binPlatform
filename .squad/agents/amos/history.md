# Project Context

- **Owner:** crowdedLeopard
- **Project:** Hampshire Bin Collection Data Platform — a production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.
- **Stack:** TypeScript or Python, FastAPI or Node.js, PostgreSQL, Redis, Playwright (browser automation), Terraform/Bicep, Docker, OpenAPI
- **Created:** 2026-03-25

## Learnings
<!-- Append new learnings below. -->

### 2026-03-25: Security Architecture Package Complete

**Key Threats Identified:**

1. **Highest-risk threats** requiring immediate controls:
   - Supply chain compromise (npm/pip dependencies) — requires lockfile pinning, audit in CI, and dependency review
   - Browser automation escape (Playwright/Chromium vulnerabilities) — requires container isolation, seccomp profiles, and regular updates
   - SSRF via adapter redirects — requires egress allowlists and blocking of cloud metadata endpoints
   - Cross-adapter trust boundary failures — requires database row-level isolation and network segmentation

2. **Likely abuse patterns:**
   - Mass address enumeration by bots for data resale — API key authentication + rate limiting + anomaly detection required
   - Using platform as scraping proxy — cache-first responses, no user-triggerable upstream refresh
   - Admin account compromise — SSO with MFA mandatory, internal network only

3. **Upstream content is adversarial:**
   - Council websites could serve hostile HTML/JS (compromised or intentional)
   - Must never execute scraped content, must validate all extracted data against schema
   - Raw evidence must never be rendered without sanitization

**Critical Controls Established:**

1. **Network architecture:** Deny-all default, per-adapter egress allowlists, database/Redis never internet-accessible
2. **Secrets management:** Azure Key Vault with managed identity, no secrets in code/config/logs, rotation schedules defined
3. **Adapter isolation:** Each adapter in separate container, no shared credentials, separate blob storage paths
4. **Kill switch strategy:** Per-adapter and global kill switches, < 60 second activation, state preserved during disable
5. **Incident triggers:** 15 specific trigger conditions defined with severity and immediate actions

**Security Decisions Made:**

- Azure Key Vault selected as secrets store (HSM-backed, managed identity support)
- 90-day retention limit on raw evidence (privacy risk mitigation)
- Browser automation runs rootless with seccomp, no GPU, isolated container per session
- Admin service accessible only via internal network + VPN
- API keys hashed with pepper (bcrypt/argon2), constant-time comparison
- Break-glass procedures defined for emergency access

**Documents Produced:**
- `docs/threat-model/threat-model.md` — 25 specific threats catalogued with CVSS-style analysis
- `docs/threat-model/stride-assessment.md` — STRIDE for 10 major components
- `docs/threat-model/abuse-cases.md` — 20 abuse cases documented
- `docs/threat-model/data-classification.md` — 15 data types classified with retention policies
- `docs/threat-model/secrets-handling.md` — Complete secrets lifecycle design
- `docs/threat-model/network-policy.md` — Network segmentation and egress rules
- `docs/threat-model/security-controls.md` — 150+ controls checklist with owners and phases
- `docs/threat-model/incident-triggers.md` — 15 incident types with response procedures
- `docs/threat-model/kill-switch-strategy.md` — Per-adapter and global kill switch design
