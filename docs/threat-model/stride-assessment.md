# STRIDE Assessment — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

This document applies the STRIDE threat model to each major component of the Hampshire Bin Collection Data Platform.

**STRIDE Categories:**
- **S**poofing — Impersonating something or someone else
- **T**ampering — Modifying data or code
- **R**epudiation — Claiming to not have performed an action
- **I**nformation Disclosure — Exposing information to unauthorized parties
- **D**enial of Service — Denying or degrading service to users
- **E**levation of Privilege — Gaining capabilities without authorization

---

## Component Assessments

### 1. API Gateway

The entry point for all external traffic. Handles TLS termination, rate limiting, and request routing.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Attacker presents forged requests appearing to come from legitimate clients | Medium | Validate API keys on every request; IP allowlisting for sensitive keys; request signing for critical operations |
| **Tampering** | Man-in-the-middle modifies requests between client and gateway | High | TLS 1.2+ only; HSTS header; certificate pinning for critical clients |
| **Repudiation** | Client denies making a request | Low | Request logging with correlation IDs; API key identifies client |
| **Information Disclosure** | Gateway exposes internal error details, headers, or routing information | Medium | Sanitize error responses; remove internal headers before returning; generic error messages |
| **Denial of Service** | Gateway overwhelmed by volumetric or application-layer attack | High | CDN/WAF (Cloudflare/AWS Shield); rate limiting; connection limits; request timeout; auto-scaling |
| **Elevation of Privilege** | Attacker bypasses gateway to reach internal services directly | Critical | Internal services not internet-accessible; network segmentation; gateway is only ingress path |

---

### 2. Auth Layer

Validates API keys, manages sessions, and enforces authorization.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Attacker uses stolen or forged API key | High | API key rotation; key revocation; anomaly detection on key usage; short-lived tokens |
| **Tampering** | Modification of JWT or session token | Critical | Use signed JWTs (RS256 or ES256); validate signatures; reject unsigned tokens |
| **Repudiation** | API key holder denies actions taken with their key | Medium | Audit log all authenticated actions with key ID; immutable log storage |
| **Information Disclosure** | Auth layer leaks valid key existence via timing or error messages | Medium | Constant-time comparison; generic error messages; rate limit failed attempts |
| **Denial of Service** | Auth layer CPU-bound by many authentication attempts | Medium | Rate limit authentication; caching of key validation results (short TTL) |
| **Elevation of Privilege** | Regular API key grants admin access; role bypass | Critical | Separate key types for different access levels; authorization checks on every operation; principle of least privilege |

---

### 3. Internal API Service

Handles business logic, data access, and internal operations.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Another internal service impersonates API service requests | Medium | Service mesh with mTLS; verify service identity on all internal calls |
| **Tampering** | Request data modified between gateway and API service | Medium | TLS for internal traffic; integrity checks on sensitive payloads |
| **Repudiation** | Operations performed without audit trail | Medium | Comprehensive audit logging; structured logs with request context |
| **Information Disclosure** | API returns more data than authorized; verbose errors | High | Field-level authorization; response filtering; generic errors to clients; detailed errors to logs only |
| **Denial of Service** | Expensive queries or operations exhaust resources | High | Query complexity limits; pagination required; async processing for heavy operations; circuit breakers |
| **Elevation of Privilege** | Insecure direct object references allow access to other tenants' data | Critical | Authorization check on every data access; tenant ID from token not request body |

---

### 4. Adapter Worker

Executes scraping logic for specific councils. Makes outbound HTTP requests.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Council website spoofed to serve malicious content; adapter identity forged | Medium | TLS certificate validation; adapter runs with unique identity; egress to specific domains only |
| **Tampering** | Upstream content modified in transit; adapter logic manipulated | Medium | TLS for all upstream requests; immutable adapter code; signed container images |
| **Repudiation** | Adapter execution without record | Low | Log all adapter runs with evidence hash; immutable evidence storage |
| **Information Disclosure** | Adapter leaks credentials or internal data to upstream | High | Adapters have no access to secrets store; no credentials in request headers to councils; egress filtering |
| **Denial of Service** | Adapter hung by slow/malicious upstream; resource exhaustion | High | Request timeouts; response size limits; resource quotas per adapter; circuit breaker after failures |
| **Elevation of Privilege** | Adapter escapes container; accesses other adapters' data | Critical | Container isolation; network segmentation; no shared credentials; adapter cannot reach database directly |

---

### 5. Browser Automation Environment (Playwright)

Executes headless browser sessions for councils requiring JavaScript rendering.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Malicious site presents fake login page; browser identity spoofed | Medium | No credentials entered in browser automation; browser fingerprint controlled |
| **Tampering** | Malicious JavaScript modifies DOM/data before extraction; browser state corrupted | High | Fresh browser context per run; no persistent state; validate extracted data against schema |
| **Repudiation** | Browser actions not recorded | Low | Screenshot/trace on failure; structured logging of navigation steps |
| **Information Disclosure** | Browser leaks data via side channels; local storage persisted | High | No persistent browser profile; clear all state between runs; isolated network (no access to internal services) |
| **Denial of Service** | Browser hung by heavy pages; cryptocurrency mining in browser; memory exhaustion | High | CPU/memory limits; navigation timeout (30s); kill after timeout; one browser per adapter max |
| **Elevation of Privilege** | Chromium vulnerability exploited to escape sandbox | Critical | Rootless container; seccomp profile; AppArmor; no GPU access; no /dev access; read-only filesystem; regular Chromium updates |

---

### 6. Evidence Store (Blob Storage)

Stores raw HTML/JSON evidence from scraping operations.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Unauthorized party uploads fake evidence | Medium | Write access only from adapter workers via signed URLs; no direct write from internet |
| **Tampering** | Evidence modified after storage | High | Immutable storage configuration (WORM); content hash stored in database; integrity verification on read |
| **Repudiation** | Evidence deletion without record | Medium | Soft delete with retention period; audit log of all deletes; admin approval for permanent delete |
| **Information Disclosure** | Evidence accessed by unauthorized parties; public access misconfigured | High | Private by default; no public URLs; SAS tokens with short expiry; access logged |
| **Denial of Service** | Storage quota exhausted; excessive read operations | Medium | Quota alerts; lifecycle policies to delete old evidence; rate limiting on evidence API |
| **Elevation of Privilege** | Storage credentials allow access to other containers | Medium | Least privilege: evidence service has access only to evidence container; no root storage keys in application |

---

### 7. Database (PostgreSQL)

Stores normalised collection schedules, API keys, and operational data.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Connection impersonation; unauthorized application connects | High | TLS required for connections; certificate-based authentication; managed identity where available |
| **Tampering** | Data modified directly in database bypassing application | Critical | Application-only database access (no direct admin access in production); row-level security; change audit triggers |
| **Repudiation** | Data changes without attribution | Medium | Audit columns (created_by, updated_at); database audit logging; change capture |
| **Information Disclosure** | SQL injection returns unauthorized data; backups exposed | Critical | Parameterized queries only; ORM with query builder; encrypted backups; backup access logging |
| **Denial of Service** | Connection exhaustion; slow queries; storage exhaustion | High | Connection pooling; query timeout; query plan analysis; storage alerts; auto-scaling (read replicas) |
| **Elevation of Privilege** | Application role gains DBA privileges; schema modification | Critical | Least privilege database roles; no DDL permissions for application; separate migration role |

---

### 8. Cache (Redis)

Caches API responses, session state, and rate limiting counters.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Unauthorized client connects to Redis | High | Password authentication; TLS; network isolation (not internet accessible) |
| **Tampering** | Cache poisoning returns wrong data to users | High | Cache key includes version/hash; validate cached data schema; short TTL for sensitive data |
| **Repudiation** | Cache operations not logged | Low | Slowlog enabled; command logging for admin operations |
| **Information Disclosure** | Sensitive data cached without encryption; keys enumerable | Medium | No sensitive data in cache (no credentials, no PII); encrypt at rest if available; no KEYS command in production |
| **Denial of Service** | Memory exhaustion; connection exhaustion | High | maxmemory configuration with eviction policy; connection limits; rate limiting clients |
| **Elevation of Privilege** | Redis command injection; CONFIG access | Critical | Disable dangerous commands (CONFIG, DEBUG, FLUSHALL); rename-command in config; application uses read/write only |

---

### 9. Admin Service

Provides operational management, adapter control, and kill switches.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Attacker impersonates admin user | Critical | SSO integration with MFA required; no local admin accounts; session timeout (15 min) |
| **Tampering** | Admin requests modified in transit | High | TLS; request signing for destructive operations; CSRF tokens |
| **Repudiation** | Admin actions without audit trail | High | Immutable audit log of all admin actions; dual approval for critical operations |
| **Information Disclosure** | Admin interface exposes sensitive data; error messages verbose | High | Admin sees obfuscated secrets; role-based data visibility; generic errors |
| **Denial of Service** | Admin interface unavailable during incident | Medium | Admin service separate from API; health check endpoint; backup access method (CLI) |
| **Elevation of Privilege** | Non-admin accesses admin functions; role bypass | Critical | Admin service on internal network only; VPN/bastion required; RBAC enforced at every endpoint; no default admin account |

---

### 10. CI/CD Pipeline

Builds, tests, and deploys the platform.

| Threat Type | Description | Severity | Mitigation |
|-------------|-------------|----------|------------|
| **Spoofing** | Unauthorized commits trigger pipeline; attacker impersonates CI system | Critical | Signed commits required; branch protection; MFA on GitHub accounts; pipeline service identity verified |
| **Tampering** | Build artifacts modified; malicious code injected; dependencies substituted | Critical | Signed container images; SBOM generation; build provenance; dependency pinning; air-gapped build environment |
| **Repudiation** | Deployments without record; who approved what | Medium | Deployment approval workflow; immutable deployment logs; artifact retention |
| **Information Disclosure** | Secrets exposed in build logs; artifacts contain credentials | Critical | Secrets masked in logs; no secrets in code; secrets injected at deploy time only; build log review |
| **Denial of Service** | Pipeline blocked; infinite build loops | Medium | Resource limits on builds; build timeouts; parallel job limits; alert on stuck pipelines |
| **Elevation of Privilege** | Pipeline runner escapes to production; developer gains production access | Critical | Separate runners for prod; production deployment requires approval; no direct production access for developers; pipeline cannot access secrets until deployment |

---

## Summary Matrix

| Component | Highest Severity Threats | Priority Controls |
|-----------|-------------------------|-------------------|
| API Gateway | DoS, Elevation of Privilege | WAF/CDN, network segmentation |
| Auth Layer | Spoofing, Elevation of Privilege | Key rotation, role-based access |
| Internal API Service | Information Disclosure, Elevation of Privilege | Authorization checks, field filtering |
| Adapter Worker | Elevation of Privilege, DoS | Container isolation, egress filtering |
| Browser Automation | Elevation of Privilege, DoS | Sandbox hardening, resource limits |
| Evidence Store | Tampering, Information Disclosure | WORM storage, private access |
| Database | Tampering, Information Disclosure, Elevation | Parameterized queries, least privilege |
| Cache | Elevation of Privilege, Tampering | Disable dangerous commands, cache validation |
| Admin Service | Spoofing, Elevation of Privilege | MFA, internal network only |
| CI/CD Pipeline | Tampering, Spoofing, Elevation | Signed artifacts, branch protection |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial STRIDE assessment |
