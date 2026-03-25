# Security Controls Checklist — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

This checklist documents all security controls required for the Hampshire Bin Collection Data Platform. Controls are organized by category and assigned to team members with target implementation phases.

**Phases:**
- **Phase 0:** Foundation (before any code)
- **Phase 1:** MVP Security (minimum for first deployment)
- **Phase 2:** Production Hardening (before public launch)
- **Phase 3:** Operational Maturity (first 3 months post-launch)
- **Phase 4:** Continuous Improvement (ongoing)

**Owners:**
- **Holden:** API design and implementation
- **Naomi:** Adapter development
- **Amos:** Security architecture and review
- **Drummer:** Infrastructure and CI/CD
- **Bobbie:** Testing and QA

---

## API Security

### Authentication
- [ ] **API key authentication for protected endpoints** — Owner: Holden — Phase 1
- [ ] **API key validation on every request** — Owner: Holden — Phase 1
- [ ] **Constant-time API key comparison** — Owner: Holden — Phase 1
- [ ] **API key hashing with pepper (bcrypt/argon2)** — Owner: Holden — Phase 1
- [ ] **Key rotation capability with grace period** — Owner: Holden — Phase 2
- [ ] **IP allowlisting option for API keys** — Owner: Holden — Phase 2
- [ ] **Key tier separation (public/premium)** — Owner: Holden — Phase 2

### Rate Limiting
- [ ] **Per-IP rate limiting (unauthenticated)** — Owner: Holden — Phase 1
- [ ] **Per-API-key rate limiting** — Owner: Holden — Phase 1
- [ ] **Daily quota enforcement per key** — Owner: Holden — Phase 2
- [ ] **Rate limit headers in responses** — Owner: Holden — Phase 1
- [ ] **Exponential backoff on rate limit** — Owner: Holden — Phase 2
- [ ] **Rate limit at WAF layer** — Owner: Drummer — Phase 2
- [ ] **Anomaly detection for enumeration** — Owner: Amos — Phase 3

### Transport Security
- [ ] **TLS 1.2+ only (no TLS 1.0/1.1)** — Owner: Drummer — Phase 1
- [ ] **HSTS header with long max-age** — Owner: Drummer — Phase 1
- [ ] **Strong cipher suites only** — Owner: Drummer — Phase 1
- [ ] **Certificate monitoring and auto-renewal** — Owner: Drummer — Phase 2

### Request/Response Security
- [ ] **Request size limits** — Owner: Holden — Phase 1
- [ ] **Response size limits** — Owner: Holden — Phase 1
- [ ] **Request timeout enforcement** — Owner: Holden — Phase 1
- [ ] **No sensitive data in URLs** — Owner: Holden — Phase 1
- [ ] **Security headers (X-Content-Type-Options, X-Frame-Options)** — Owner: Holden — Phase 1
- [ ] **CORS configuration (restrictive)** — Owner: Holden — Phase 1
- [ ] **No server version in headers** — Owner: Drummer — Phase 1

---

## Authentication and Authorisation

### API Authentication
- [ ] **API key required for address resolution** — Owner: Holden — Phase 1
- [ ] **Public endpoints clearly defined** — Owner: Holden — Phase 1
- [ ] **Authentication failure logging** — Owner: Holden — Phase 1
- [ ] **Brute force protection** — Owner: Holden — Phase 2

### Admin Authentication
- [ ] **SSO integration (Azure AD/Okta)** — Owner: Drummer — Phase 2
- [ ] **MFA required for admin access** — Owner: Drummer — Phase 2
- [ ] **No local admin passwords** — Owner: Drummer — Phase 2
- [ ] **Session timeout (15 minutes)** — Owner: Holden — Phase 2
- [ ] **Concurrent session detection** — Owner: Holden — Phase 3

### Authorisation
- [ ] **Role-based access control (RBAC)** — Owner: Holden — Phase 2
- [ ] **Authorization check on every endpoint** — Owner: Holden — Phase 1
- [ ] **Principle of least privilege** — Owner: Amos — Phase 1
- [ ] **Admin endpoints on internal network only** — Owner: Drummer — Phase 2
- [ ] **Break-glass procedure documented** — Owner: Amos — Phase 2

---

## Input Validation

### API Input Validation
- [ ] **Postcode format validation** — Owner: Holden — Phase 1
- [ ] **UPRN format validation** — Owner: Holden — Phase 1
- [ ] **Input length limits** — Owner: Holden — Phase 1
- [ ] **Character allowlist validation** — Owner: Holden — Phase 1
- [ ] **Reject malformed requests early** — Owner: Holden — Phase 1
- [ ] **JSON schema validation** — Owner: Holden — Phase 1
- [ ] **No SQL injection (parameterized queries)** — Owner: Holden — Phase 1

### Adapter Input Validation
- [ ] **Response size limits (10MB)** — Owner: Naomi — Phase 1
- [ ] **Parsing timeouts (30s)** — Owner: Naomi — Phase 1
- [ ] **Schema validation on extracted data** — Owner: Naomi — Phase 1
- [ ] **Data type validation** — Owner: Naomi — Phase 1
- [ ] **Field length limits** — Owner: Naomi — Phase 1
- [ ] **Reject invalid records** — Owner: Naomi — Phase 1
- [ ] **Encoding validation (UTF-8)** — Owner: Naomi — Phase 1

---

## Output Encoding

- [ ] **JSON encoding for API responses** — Owner: Holden — Phase 1
- [ ] **No user input reflection without encoding** — Owner: Holden — Phase 1
- [ ] **Content-Type headers set correctly** — Owner: Holden — Phase 1
- [ ] **Evidence served as text/plain** — Owner: Holden — Phase 2
- [ ] **X-Content-Type-Options: nosniff** — Owner: Holden — Phase 1
- [ ] **Content-Disposition: attachment for downloads** — Owner: Holden — Phase 2

---

## Secrets Management

### Storage
- [ ] **Azure Key Vault for all secrets** — Owner: Drummer — Phase 1
- [ ] **No secrets in code** — Owner: Amos — Phase 0
- [ ] **No secrets in config files** — Owner: Amos — Phase 0
- [ ] **No secrets in container images** — Owner: Drummer — Phase 1
- [ ] **No secrets in git history** — Owner: Amos — Phase 0

### Access
- [ ] **Managed Identity for Key Vault access** — Owner: Drummer — Phase 1
- [ ] **Least privilege access policies** — Owner: Drummer — Phase 1
- [ ] **Secret access logging** — Owner: Drummer — Phase 1
- [ ] **Secret access alerting** — Owner: Drummer — Phase 2

### Rotation
- [ ] **Database credential rotation (90 days)** — Owner: Drummer — Phase 2
- [ ] **JWT signing key rotation (180 days)** — Owner: Drummer — Phase 2
- [ ] **Rotation runbook documented** — Owner: Drummer — Phase 2
- [ ] **Automated rotation where possible** — Owner: Drummer — Phase 3

### Validation
- [ ] **Startup validation of required secrets** — Owner: Holden/Naomi — Phase 1
- [ ] **Fail safely if secrets missing** — Owner: Holden/Naomi — Phase 1
- [ ] **Connection validation at startup** — Owner: Holden/Naomi — Phase 1

---

## Network Controls

### Segmentation
- [ ] **DMZ subnet for public traffic** — Owner: Drummer — Phase 1
- [ ] **Application subnet (internal)** — Owner: Drummer — Phase 1
- [ ] **Adapter subnet (isolated)** — Owner: Drummer — Phase 1
- [ ] **Data subnet (restricted)** — Owner: Drummer — Phase 1

### Egress Control
- [ ] **Deny-all outbound by default** — Owner: Drummer — Phase 1
- [ ] **Per-adapter egress allowlist** — Owner: Drummer — Phase 1
- [ ] **Block cloud metadata endpoints** — Owner: Drummer — Phase 1
- [ ] **Block private IP ranges from adapters** — Owner: Drummer — Phase 1
- [ ] **Egress logging** — Owner: Drummer — Phase 2

### Ingress Control
- [ ] **Database not internet accessible** — Owner: Drummer — Phase 1
- [ ] **Redis not internet accessible** — Owner: Drummer — Phase 1
- [ ] **Admin service not internet accessible** — Owner: Drummer — Phase 2
- [ ] **Private endpoints for Azure services** — Owner: Drummer — Phase 2

### Internal Security
- [ ] **mTLS for service-to-service** — Owner: Drummer — Phase 2
- [ ] **Service mesh (Istio/Linkerd)** — Owner: Drummer — Phase 3
- [ ] **DNS security** — Owner: Drummer — Phase 2

---

## Container Hardening

### Image Security
- [ ] **Minimal base images (distroless/alpine)** — Owner: Drummer — Phase 1
- [ ] **No root user in containers** — Owner: Drummer — Phase 1
- [ ] **Read-only filesystem** — Owner: Drummer — Phase 2
- [ ] **No privileged containers** — Owner: Drummer — Phase 1
- [ ] **Image vulnerability scanning** — Owner: Drummer — Phase 1
- [ ] **Signed container images** — Owner: Drummer — Phase 2

### Runtime Security
- [ ] **Resource limits (CPU/memory)** — Owner: Drummer — Phase 1
- [ ] **Seccomp profiles** — Owner: Drummer — Phase 2
- [ ] **AppArmor/SELinux policies** — Owner: Drummer — Phase 3
- [ ] **No host network access** — Owner: Drummer — Phase 1
- [ ] **No host PID access** — Owner: Drummer — Phase 1
- [ ] **Drop all capabilities** — Owner: Drummer — Phase 2

---

## Storage Hardening

### Database
- [ ] **Encryption at rest** — Owner: Drummer — Phase 1
- [ ] **TLS for connections** — Owner: Drummer — Phase 1
- [ ] **Parameterized queries only** — Owner: Holden — Phase 1
- [ ] **Application role with least privilege** — Owner: Drummer — Phase 1
- [ ] **No DDL permissions for application** — Owner: Drummer — Phase 1
- [ ] **Audit logging enabled** — Owner: Drummer — Phase 2
- [ ] **Backup encryption** — Owner: Drummer — Phase 1

### Redis
- [ ] **Authentication required** — Owner: Drummer — Phase 1
- [ ] **TLS for connections** — Owner: Drummer — Phase 1
- [ ] **Dangerous commands disabled** — Owner: Drummer — Phase 1
- [ ] **Memory limits configured** — Owner: Drummer — Phase 1
- [ ] **No sensitive data in cache** — Owner: Holden — Phase 1

### Blob Storage
- [ ] **Encryption at rest** — Owner: Drummer — Phase 1
- [ ] **Private access only (no public URLs)** — Owner: Drummer — Phase 1
- [ ] **SAS tokens with short expiry** — Owner: Drummer — Phase 1
- [ ] **Lifecycle policies (90 day retention)** — Owner: Drummer — Phase 2
- [ ] **Access logging** — Owner: Drummer — Phase 2
- [ ] **WORM configuration for evidence** — Owner: Drummer — Phase 3

---

## CI/CD Security

### Pipeline Security
- [ ] **Branch protection on main** — Owner: Drummer — Phase 0
- [ ] **Require code review for merge** — Owner: Drummer — Phase 0
- [ ] **Signed commits required** — Owner: Drummer — Phase 2
- [ ] **Separate runners for production** — Owner: Drummer — Phase 2
- [ ] **Production deployment approval** — Owner: Drummer — Phase 2

### Secrets in Pipeline
- [ ] **Secrets masked in logs** — Owner: Drummer — Phase 1
- [ ] **Secrets in secure storage** — Owner: Drummer — Phase 1
- [ ] **No secrets in code/config** — Owner: Drummer — Phase 0
- [ ] **Secrets injected at deploy time** — Owner: Drummer — Phase 1

### Build Security
- [ ] **Dependency pinning (lockfiles)** — Owner: Drummer — Phase 0
- [ ] **npm audit / pip-audit in CI** — Owner: Drummer — Phase 1
- [ ] **SBOM generation** — Owner: Drummer — Phase 2
- [ ] **Build provenance tracking** — Owner: Drummer — Phase 3

---

## Dependency Management

- [ ] **Lockfile committed** — Owner: Holden/Naomi — Phase 0
- [ ] **Dependabot enabled** — Owner: Drummer — Phase 1
- [ ] **Security advisories monitored** — Owner: Amos — Phase 1
- [ ] **Critical vulnerabilities blocked in CI** — Owner: Drummer — Phase 1
- [ ] **Dependency review on updates** — Owner: Amos — Phase 2
- [ ] **Minimal dependency footprint** — Owner: Holden/Naomi — Phase 1
- [ ] **Regular unused dependency cleanup** — Owner: Holden/Naomi — Phase 3
- [ ] **Patching SLA defined** — Owner: Amos — Phase 2

---

## Logging and Audit

### Application Logging
- [ ] **Structured logging (JSON)** — Owner: Holden/Naomi — Phase 1
- [ ] **Correlation IDs in requests** — Owner: Holden — Phase 1
- [ ] **No secrets in logs** — Owner: Holden/Naomi — Phase 1
- [ ] **Secret redaction patterns** — Owner: Amos — Phase 1
- [ ] **Log levels appropriate** — Owner: Holden/Naomi — Phase 1

### Security Logging
- [ ] **Authentication events logged** — Owner: Holden — Phase 1
- [ ] **Authorization failures logged** — Owner: Holden — Phase 1
- [ ] **Admin actions logged** — Owner: Holden — Phase 2
- [ ] **Security events to SIEM** — Owner: Drummer — Phase 2
- [ ] **Immutable audit log storage** — Owner: Drummer — Phase 2

### Monitoring
- [ ] **Error rate monitoring** — Owner: Drummer — Phase 1
- [ ] **Security alert thresholds** — Owner: Amos — Phase 2
- [ ] **Log anomaly detection** — Owner: Drummer — Phase 3
- [ ] **Dashboards for security metrics** — Owner: Drummer — Phase 2

---

## Incident Response

- [ ] **Incident response plan documented** — Owner: Amos — Phase 2
- [ ] **On-call rotation defined** — Owner: Drummer — Phase 2
- [ ] **Incident severity definitions** — Owner: Amos — Phase 2
- [ ] **Escalation procedures** — Owner: Amos — Phase 2
- [ ] **Post-incident review process** — Owner: Amos — Phase 2
- [ ] **Security contact published** — Owner: Amos — Phase 2
- [ ] **Credential rotation runbooks** — Owner: Drummer — Phase 2
- [ ] **Kill switch procedures documented** — Owner: Amos — Phase 2

---

## Adapter-Specific Controls

### Network Security
- [ ] **Egress limited to council URL** — Owner: Drummer — Phase 1
- [ ] **SSRF protection (no redirects to internal)** — Owner: Naomi — Phase 1
- [ ] **Block cloud metadata endpoints** — Owner: Drummer — Phase 1
- [ ] **Request timeout enforcement** — Owner: Naomi — Phase 1

### Execution Isolation
- [ ] **Each adapter in separate container** — Owner: Drummer — Phase 1
- [ ] **No shared credentials between adapters** — Owner: Drummer — Phase 1
- [ ] **Database row-level isolation** — Owner: Holden — Phase 2
- [ ] **Separate blob storage paths** — Owner: Naomi — Phase 1

### Data Handling
- [ ] **Schema validation on output** — Owner: Naomi — Phase 1
- [ ] **Evidence hashing** — Owner: Naomi — Phase 1
- [ ] **Anomaly detection on data changes** — Owner: Naomi — Phase 2
- [ ] **Rate limiting upstream requests** — Owner: Naomi — Phase 1

### Kill Switch
- [ ] **Per-adapter kill switch** — Owner: Naomi — Phase 1
- [ ] **Global adapter kill switch** — Owner: Drummer — Phase 1
- [ ] **Kill switch logging** — Owner: Naomi — Phase 1
- [ ] **Admin UI for kill switch** — Owner: Holden — Phase 2

---

## Browser Automation Controls

### Sandbox Hardening
- [ ] **Isolated container per browser** — Owner: Drummer — Phase 1
- [ ] **No GPU access** — Owner: Drummer — Phase 1
- [ ] **Read-only filesystem** — Owner: Drummer — Phase 2
- [ ] **Seccomp profile** — Owner: Drummer — Phase 2
- [ ] **Non-root user** — Owner: Drummer — Phase 1

### Resource Limits
- [ ] **CPU limit per browser** — Owner: Drummer — Phase 1
- [ ] **Memory limit per browser** — Owner: Drummer — Phase 1
- [ ] **Navigation timeout (30s)** — Owner: Naomi — Phase 1
- [ ] **Hard kill after timeout** — Owner: Naomi — Phase 1

### State Isolation
- [ ] **Fresh browser context per run** — Owner: Naomi — Phase 1
- [ ] **No persistent browser profile** — Owner: Naomi — Phase 1
- [ ] **Clear all state after run** — Owner: Naomi — Phase 1
- [ ] **No credentials in browser** — Owner: Naomi — Phase 1

### Updates
- [ ] **Playwright/Chromium auto-update** — Owner: Drummer — Phase 2
- [ ] **Weekly browser updates minimum** — Owner: Drummer — Phase 2

---

## Compliance and Governance

- [ ] **Data classification documented** — Owner: Amos — Phase 1
- [ ] **Retention policies implemented** — Owner: Drummer — Phase 2
- [ ] **GDPR considerations documented** — Owner: Amos — Phase 2
- [ ] **Access review process** — Owner: Amos — Phase 3
- [ ] **Security training for team** — Owner: Amos — Phase 2
- [ ] **Penetration testing scheduled** — Owner: Amos — Phase 3

---

## Summary by Phase

### Phase 0 (Foundation)
- No secrets in code/config/git
- Branch protection
- Lockfiles committed

### Phase 1 (MVP Security)
- TLS everywhere
- API key authentication
- Rate limiting (basic)
- Input validation
- Parameterized queries
- Container isolation
- Network segmentation
- Structured logging
- Startup validation

### Phase 2 (Production Hardening)
- SSO/MFA for admin
- mTLS internal
- Image signing
- Audit logging
- Kill switches
- Incident response plan
- Secret rotation

### Phase 3 (Operational Maturity)
- Anomaly detection
- Service mesh
- WORM storage
- Penetration testing
- Regular access review

### Phase 4 (Continuous Improvement)
- Ongoing vulnerability management
- Control effectiveness review
- Threat model updates
- Security metric tracking

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial security controls checklist |
