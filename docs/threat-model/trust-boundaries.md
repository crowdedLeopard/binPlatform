# Trust Boundaries — Hampshire Bin Collection Platform

This document defines the trust boundaries in the system architecture. Each boundary represents a transition between components with different trust levels, and specifies the security controls required at each crossing.

## Trust Level Definitions

| Level | Name | Description |
|-------|------|-------------|
| 0 | Untrusted | External internet, unknown actors, potentially malicious |
| 1 | Public | Authenticated API clients with limited privileges |
| 2 | Internal | Internal services within the application boundary |
| 3 | Privileged | Admin services with elevated access |
| 4 | Data | Database and storage layer |
| 5 | Secrets | Key vault and cryptographic material |

---

## Trust Boundary 1: Public Client → API Gateway

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Public Internet (browsers, mobile apps, third-party integrators) |
| **Destination Component** | API Gateway (Azure API Management / Cloudflare) |
| **Source Trust Level** | 0 (Untrusted) |
| **Destination Trust Level** | 1 (Public) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Credentials | API key in `X-API-Key` header | Inbound |
| Data | HTTP request (method, path, query params, body) | Inbound |
| Data | User-Agent, client IP, request headers | Inbound |
| Data | HTTP response (JSON body, headers) | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| TLS 1.3 | Enforced at edge, HSTS enabled | Encryption in transit |
| DDoS Protection | Azure Front Door / Cloudflare | Availability |
| WAF | OWASP Core Rule Set | Common attack prevention |
| Rate Limiting (Global) | 1000 req/min per IP | Resource protection |
| Request Validation | Size limits, content-type validation | Input sanitisation |
| Geo-blocking | Optional UK-only restriction | Attack surface reduction |
| Bot Detection | Challenge pages for suspicious patterns | Abuse prevention |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| DDoS attack | Service unavailability | Traffic spike alerts | Auto-scaling, rate limiting, null routing |
| WAF bypass | Malicious payload reaches API | Security event logging | Block pattern, incident response |
| Invalid TLS | Man-in-the-middle possible | Certificate monitoring | Automatic certificate renewal |
| Rate limit bypass | Resource exhaustion | Per-IP tracking | Adaptive blocking |

---

## Trust Boundary 2: API Gateway → Internal API Service

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | API Gateway |
| **Destination Component** | Public API Service (Hono) |
| **Source Trust Level** | 1 (Public - authenticated) |
| **Destination Trust Level** | 2 (Internal) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Credentials | Validated API key claims (key ID, scopes, rate limit) | Inbound |
| Data | Request context (correlation ID, client IP hash) | Inbound |
| Data | Request payload (validated at gateway) | Inbound |
| Data | Response payload | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| API Key Validation | Gateway validates against key registry | Authentication |
| Scope Enforcement | Gateway injects validated scopes | Authorisation |
| Rate Limiting (Per-Key) | 60 req/min default per API key | Fair use |
| Request Schema Validation | OpenAPI schema validation | Input integrity |
| Correlation ID | Injected by gateway | Traceability |
| Internal TLS | mTLS between gateway and service | Internal encryption |
| IP Allowlist | Only gateway IPs can reach API service | Network isolation |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Stolen API key | Unauthorised data access | Usage anomaly detection | Key revocation, security event |
| Scope escalation | Access to privileged endpoints | Scope validation | Request rejection, audit log |
| Gateway bypass | Direct access to API service | Network monitoring | Request rejection (allowlist) |
| Request tampering | Invalid data in service | Schema validation | 400 response, security event |

---

## Trust Boundary 3: Internal API Service → Adapter Orchestrator

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Public API Service |
| **Destination Component** | Adapter Orchestrator (BullMQ Queue) |
| **Source Trust Level** | 2 (Internal) |
| **Destination Trust Level** | 2 (Internal) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Commands | Acquisition job request | Inbound to queue |
| Data | Council ID, postcode, property ID | Inbound |
| Data | Acquisition results (addresses, events) | Outbound |
| Data | Acquisition metadata (confidence, warnings) | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| Input Validation | Zod schema validation before enqueue | Data integrity |
| Job Signing | HMAC signature on job payload | Tamper detection |
| Queue Authentication | Redis AUTH with strong password | Access control |
| Job Timeout | 60 second maximum execution | Resource protection |
| Rate Limiting | Per-council job rate limits | Upstream protection |
| Dead Letter Queue | Failed jobs captured for analysis | Debugging, abuse detection |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Job injection | Malicious adapter execution | Signature validation | Job rejection |
| Queue poisoning | Service disruption | Job validation, metrics | Queue purge, incident |
| Redis compromise | Data exposure, job manipulation | Access logging | Credential rotation |
| Job flooding | Worker exhaustion | Queue depth monitoring | Rate limiting, alerting |

---

## Trust Boundary 4: Adapter Worker → External Council Sites

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Adapter Worker Process / Container |
| **Destination Component** | External Council Websites |
| **Source Trust Level** | 2 (Internal - sandboxed) |
| **Destination Trust Level** | 0 (Untrusted) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Data | HTTP requests (postcode lookup, property query) | Outbound |
| Data | HTTP responses (HTML, JSON, PDF) | Inbound |
| Code | JavaScript (executed in browser automation) | Inbound |
| Data | Cookies, session tokens (council-provided) | Bidirectional |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| SSRF Prevention | Egress allowlist (*.gov.uk) | Network isolation |
| Internal IP Blocking | Block RFC 1918, loopback ranges | SSRF prevention |
| Response Size Limit | 10MB maximum | Resource protection |
| Request Timeout | 30 seconds per request | Resource protection |
| TLS Verification | Certificate validation required | MITM prevention |
| Browser Sandbox | Container isolation for automation | Code execution isolation |
| Network Namespace | No access to internal services | Lateral movement prevention |
| Evidence Capture | HAR, HTML, screenshots captured | Audit trail |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Malicious JavaScript | Container compromise | Container isolation | Container termination, no persistence |
| SSRF attempt | Internal service access | Egress filtering | Request blocked, security event |
| Data exfiltration | Sensitive data leaked | Egress monitoring | Alert, investigation |
| Council site compromise | Malicious content served | Schema validation, anomaly detection | Adapter disable, evidence review |

---

## Trust Boundary 5: Adapter Worker → Evidence Store

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Adapter Worker |
| **Destination Component** | Blob Storage (Evidence Store) |
| **Source Trust Level** | 2 (Internal - sandboxed) |
| **Destination Trust Level** | 4 (Data) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Data | HTML content | Outbound (write) |
| Data | JSON responses | Outbound (write) |
| Data | Screenshots (PNG) | Outbound (write) |
| Data | HAR files | Outbound (write) |
| Metadata | Content hash, size, MIME type | Outbound (write) |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| Write-Only Access | SAS token with write-only scope | Least privilege |
| Content Hash | SHA-256 of content | Integrity verification |
| Size Limits | Maximum blob size enforced | Resource protection |
| Immutable Storage | Immutable blob tier | Tamper prevention |
| Retention Policy | 90-day automatic expiry | Data hygiene |
| PII Detection | Flag potential PII in evidence | Privacy compliance |
| Encryption | Azure-managed encryption at rest | Data protection |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Malicious file write | Storage abuse | Size/type validation | Write rejected |
| Evidence tampering | Audit integrity loss | Immutable storage prevents | N/A (immutable) |
| PII in evidence | Privacy violation | PII scanning | Flagging, shorter retention |
| Storage credential leak | Unauthorised access | Managed identity audit | Credential rotation |

---

## Trust Boundary 6: Adapter Worker → Database

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Adapter Worker |
| **Destination Component** | PostgreSQL Database |
| **Source Trust Level** | 2 (Internal) |
| **Destination Trust Level** | 4 (Data) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Credentials | Database connection string | Outbound |
| Data | Acquisition results (structured) | Outbound (write) |
| Data | Property data, events | Bidirectional |
| Commands | SQL queries (parameterised) | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| Parameterised Queries | Drizzle ORM | SQL injection prevention |
| Minimal Permissions | Worker role: INSERT on specific tables | Least privilege |
| Connection Pooling | PgBouncer with connection limits | Resource protection |
| TLS | Required for all connections | Encryption in transit |
| Private Endpoint | No public internet access | Network isolation |
| Query Timeout | 30 second query timeout | Resource protection |
| Audit Logging | PostgreSQL audit extension | Accountability |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| SQL injection | Data breach/manipulation | Parameterised queries prevent | N/A (prevented) |
| Connection exhaustion | Service disruption | Pool monitoring | Connection limits, alerting |
| Privilege escalation | Unauthorised data access | Role-based permissions | Request denied |
| Database credential leak | Full data access | Secret rotation, access logging | Immediate rotation |

---

## Trust Boundary 7: Admin Client → Admin Service

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Admin Users (internal operators) |
| **Destination Component** | Admin API Service |
| **Source Trust Level** | 1 (Public) → 3 (Privileged after auth) |
| **Destination Trust Level** | 3 (Privileged) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Credentials | JWT bearer token | Inbound |
| Data | Admin operations (adapter control, audit queries) | Inbound |
| Data | Sensitive data (security events, audit logs) | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| JWT Validation | RS256 signature, exp/nbf claims | Authentication |
| RBAC Enforcement | Role-based access control | Authorisation |
| MFA Required | OAuth 2.0 flow with MFA | Strong authentication |
| Session Timeout | 1 hour token expiry | Session management |
| Audit Logging | All admin actions logged | Accountability |
| IP Restriction | VPN or corporate network only | Network access control |
| Separate Deployment | Admin service isolated from public API | Blast radius reduction |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Token theft | Privileged access | Short expiry, anomaly detection | Token revocation |
| Role escalation | Unauthorised admin actions | RBAC enforcement | Access denied, security event |
| Admin account compromise | Full system access | MFA, behaviour analysis | Account lockout, incident |

---

## Trust Boundary 8: CI/CD → Deployment Target

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | GitHub Actions CI/CD |
| **Destination Component** | Azure Container Apps / AKS |
| **Source Trust Level** | 3 (Privileged - automated) |
| **Destination Trust Level** | 2 (Internal) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Credentials | Deployment credentials (OIDC) | Outbound |
| Code | Container images | Outbound |
| Configuration | Environment variables, secrets references | Outbound |
| Commands | Deployment commands | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| OIDC Authentication | Federated identity, no stored secrets | Secure deployment auth |
| Image Signing | Sigstore/Notation signatures | Image integrity |
| Vulnerability Scanning | Trivy scan in pipeline | Security assurance |
| Branch Protection | Main branch requires PR approval | Change control |
| Deployment Approval | Manual approval for production | Human oversight |
| Rollback Capability | Automatic rollback on failure | Availability |
| Secret Injection | Azure Key Vault references (not values) | Secret hygiene |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Malicious code merge | Compromised deployment | Code review, scanning | Blocked merge |
| Supply chain attack | Vulnerable dependencies | Dependency scanning | Build failure |
| CI credential theft | Unauthorised deployment | OIDC (no persistent creds) | N/A (OIDC mitigates) |
| Image tampering | Malicious container deployed | Image signature verification | Deployment rejected |

---

## Trust Boundary 9: Secrets Manager → All Components

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Azure Key Vault |
| **Destination Component** | API Service, Workers, Admin Service |
| **Source Trust Level** | 5 (Secrets) |
| **Destination Trust Level** | 2-3 (Internal/Privileged) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Credentials | Database connection strings | Outbound |
| Credentials | Redis passwords | Outbound |
| Credentials | API signing keys | Outbound |
| Credentials | TLS certificates | Outbound |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| Managed Identity | Workload identity for access | No stored credentials |
| RBAC | Per-component secret access | Least privilege |
| Secret Rotation | Automated rotation policies | Credential hygiene |
| Access Logging | All secret access logged | Audit trail |
| Soft Delete | 90-day recovery window | Accidental deletion protection |
| Network Restriction | Private endpoint only | Network isolation |
| Versioning | Secret versions tracked | Change history |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Managed identity compromise | Secret access | Access logging, anomaly detection | Identity review |
| Secret exfiltration | Credential exposure | Access logging | Rotation, incident |
| Key Vault compromise | All secrets exposed | Azure security alerts | Full rotation, incident |

---

## Trust Boundary 10: Browser Automation Sandbox → Network

### Overview

| Property | Value |
|----------|-------|
| **Source Component** | Browser Automation Container |
| **Destination Component** | Network (External + Internal) |
| **Source Trust Level** | 0-2 (Untrusted code in trusted container) |
| **Destination Trust Level** | Mixed (0 for external, 2-4 for internal) |

### What Crosses the Boundary

| Type | Data | Direction |
|------|------|-----------|
| Data | HTTP/HTTPS requests | Outbound (restricted) |
| Code | JavaScript from council sites | Inbound (executed in browser) |
| Data | Rendered page content | Captured for evidence |

### Security Controls

| Control | Implementation | Purpose |
|---------|----------------|---------|
| Egress Filtering | Only *.gov.uk domains allowed | Network isolation |
| Internal Blocking | No access to 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 | SSRF prevention |
| DNS Resolution | Only public DNS, no internal names | Isolation |
| Container Isolation | Separate network namespace | Process isolation |
| Resource Limits | 1GB memory, 1 CPU, 60s timeout | Resource protection |
| No Privileged Mode | Non-root, no capabilities | Privilege limitation |
| Ephemeral | Container destroyed after execution | No persistence |

### Boundary Violation Scenarios

| Scenario | Impact | Detection | Response |
|----------|--------|-----------|----------|
| Container escape | Host access | Container security monitoring | Investigation, patching |
| Network filter bypass | Internal access | Network monitoring | Block, security event |
| Malicious JS execution | Container compromise | Container isolation | Destruction (ephemeral) |
| Data exfiltration | Sensitive data leak | Egress monitoring | Alert, investigation |

---

## Summary Matrix

| Boundary | Source → Dest | Key Risk | Primary Control |
|----------|---------------|----------|-----------------|
| 1 | Internet → Gateway | DDoS, WAF bypass | Edge security, rate limiting |
| 2 | Gateway → API | Key theft, scope escalation | API key validation, RBAC |
| 3 | API → Queue | Job injection | Job signing, validation |
| 4 | Worker → Council | SSRF, malicious content | Egress filtering, sandbox |
| 5 | Worker → Evidence | Tampering, abuse | Write-only, immutable |
| 6 | Worker → Database | SQL injection, privilege escalation | Parameterised queries, minimal role |
| 7 | Admin → Admin API | Token theft, privilege abuse | JWT, MFA, audit logging |
| 8 | CI/CD → Deployment | Supply chain, credential theft | OIDC, image signing, scanning |
| 9 | Key Vault → Services | Secret exfiltration | Managed identity, rotation |
| 10 | Browser Container → Network | Container escape, SSRF | Network namespace, egress filter |
