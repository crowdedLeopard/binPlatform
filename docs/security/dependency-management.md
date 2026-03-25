# Dependency Management Policy

## Overview

This document defines the Hampshire Bin Platform's approach to managing and securing third-party dependencies.

---

## Scanning

### Automated Scanning in CI

All pull requests and pushes to `main` trigger automated dependency scanning:

- **Trivy filesystem scan** (`trivy fs .`)
  - Scans for known vulnerabilities (CVEs) in npm/Node.js dependencies
  - Checks both direct and transitive dependencies
  - Results uploaded to GitHub Security tab as SARIF

- **npm audit** (`npm audit --audit-level=high --production`)
  - Native npm vulnerability scanning
  - Only scans production dependencies (excludes devDependencies)
  - Fails CI on HIGH or CRITICAL vulnerabilities

### Blocking Policy

| Severity | Action | SLA |
|----------|--------|-----|
| **CRITICAL** | ❌ Blocks CI/merge | Patch within 48 hours |
| **HIGH** | ❌ Blocks CI/merge | Patch within 5 business days |
| **MODERATE** | ⚠️ Warns (does not block) | Review within 30 days |
| **LOW** | ℹ️ Informational | Review quarterly |

### GitHub Security Integration

All scan results are automatically uploaded to the **GitHub Security** tab:
- Navigate to: `Security > Code scanning alerts`
- Trivy results tagged with category: `filesystem`
- Filter by severity, package, or CVE ID
- Alerts automatically close when vulnerabilities are patched

---

## Suppression Process

### When to Suppress

Suppressions are ONLY permitted for:
1. **False positives** (CVE does not apply to our usage)
2. **Accepted risks** (vulnerability acknowledged, mitigation documented)
3. **Unfixable vulnerabilities** (no patch available, workaround documented)

### How to Suppress

1. **Investigate the CVE**
   - Confirm the vulnerability is not exploitable in our context
   - Document why it does not affect the platform
   - Identify mitigating controls (if accepting risk)

2. **Add entry to `.trivyignore`**
   ```
   CVE-2023-12345  # 2025-01-15 | Not exploitable: PDF parser internal only, no external input | Reviewer: @amos
   ```
   - Format: `CVE-ID  # Date | Justification | Reviewer`
   - One CVE per line

3. **Submit PR with justification**
   - PR title: `security: suppress CVE-XXXX-XXXXX (false positive)`
   - PR description: detailed justification
   - **REQUIRED:** Security review approval from `@amos` (or designated security reviewer)

4. **Suppression expiry**
   - Maximum suppression age: **90 days**
   - After 90 days, re-review required (confirm still non-exploitable)
   - Expired suppressions removed during quarterly security review

### Suppression Review Checklist

Before approving a suppression:
- [ ] CVE details reviewed (read advisory, understand exploit scenario)
- [ ] Confirmed non-exploitability in our context
- [ ] Mitigation controls documented (if accepting risk)
- [ ] Justification is clear and specific (no generic "not applicable")
- [ ] Reviewer has security expertise (Amos or designated reviewer)

---

## Update Cadence

### Automated Updates (Dependabot)

See `.github/dependabot.yml`:
- **Weekly:** Monday 09:00 GMT (npm dependencies)
- **Weekly:** Monday 09:30 GMT (Docker base images)
- **Limit:** Max 5 open PRs at once (prevents noise)
- **Auto-merge:** Patch and minor versions (if all CI checks pass)
- **Manual review:** Major versions (breaking changes require team review)

### Manual Security Updates

When CRITICAL vulnerability detected:
1. **Immediate:** Security team notified via PagerDuty (P0 alert)
2. **Within 4 hours:** Impact assessment complete
3. **Within 48 hours:** Patch deployed to production
4. **Within 1 week:** Post-incident review (document timeline, prevention actions)

### Proactive Maintenance

- **Weekly:** Review Dependabot PRs (merge within 5 days)
- **Monthly:** Full Trivy rescan + review all HIGH findings (not just new ones)
- **Quarterly:** Review suppressed CVEs (remove expired, re-justify active)
- **Annually:** Dependency audit (remove unused, update outdated)

---

## Monitoring and Metrics

### Key Metrics

Tracked in Prometheus + Grafana:
- `dependency_scan_last_run_timestamp` — Time of last successful scan
- `dependency_vulnerabilities_total{severity="critical"}` — Count of CRITICAL CVEs
- `dependency_vulnerabilities_total{severity="high"}` — Count of HIGH CVEs
- `dependency_scan_duration_seconds` — Scan execution time

### Alerting Rules

- **BackupMissing:** No dependency scan in >26 hours → PagerDuty P1
- **CriticalVulnerability:** CRITICAL CVE detected → PagerDuty P0
- **HighVulnerabilityAging:** HIGH CVE open >5 days → Slack notification

### Audit Logging

All suppression changes logged:
- Git commit history (who added/removed suppression)
- PR review comments (justification and approval)
- Quarterly review log (`docs/security/suppression-review-log.md`)

---

## Roles and Responsibilities

| Role | Responsibility |
|------|----------------|
| **Developers** | Fix vulnerabilities in dependencies they own, propose suppressions |
| **DevOps (Drummer)** | Maintain scanning infrastructure, monitor alerts, coordinate patches |
| **Security (Amos)** | Review suppressions, approve exceptions, define security policies |
| **Tech Lead (crowdedLeopard)** | Approve major version bumps, prioritize security work |

---

## Escalation Path

1. **CRITICAL CVE detected** → PagerDuty P0 → Security team responds
2. **Suppression dispute** → Security team (Amos) makes final decision
3. **Unfixable vulnerability** → Tech lead + Security team assess risk acceptance
4. **Vendor unresponsive** → Consider alternative dependency (forking last resort)

---

## Related Documentation

- [Security Runbook](../runbooks/security-incident.md) — Incident response procedures
- [CI/CD Security](../../.github/workflows/ci.yml) — Dependency scan job configuration
- [Trivy Documentation](https://trivy.dev/latest/) — Scanner configuration reference
- [npm audit](https://docs.npmjs.com/cli/v10/commands/npm-audit) — npm security audit

---

**Last Updated:** 2025-01-15  
**Owner:** Drummer (DevOps)  
**Reviewers:** Amos (Security), crowdedLeopard (Tech Lead)
