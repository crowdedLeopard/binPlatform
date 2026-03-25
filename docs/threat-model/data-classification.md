# Data Classification Matrix — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Classification Levels

| Level | Definition | Examples |
|-------|------------|----------|
| **Public** | Data intended for public access, no sensitivity | Collection schedules, public documentation |
| **Internal** | Data for internal use only, low sensitivity | System logs, adapter configurations |
| **Sensitive** | Data requiring protection, moderate business impact if disclosed | API keys, addresses, UPRNs |
| **Restricted** | Highly sensitive data, significant impact if disclosed | Database credentials, admin credentials |

---

## Data Classification Table

### API Keys

| Attribute | Value |
|-----------|-------|
| **Data Type** | API Keys |
| **Classification** | Sensitive |
| **What It Is** | Client authentication tokens issued to API consumers |
| **Where Stored** | PostgreSQL (hashed), Redis (validation cache) |
| **Who Can Access** | API service (validate), Admin service (manage), Owner (view own) |
| **Encryption Requirement** | At rest: Yes (database encryption). In transit: Yes (TLS). Storage: Hash with bcrypt/argon2, not reversible |
| **Retention Recommendation** | Active: indefinite. Revoked: 90 days for audit, then delete |
| **Deletion Procedure** | Soft delete with revocation timestamp → hard delete after 90 days via scheduled job |

---

### Internal Service Credentials

| Attribute | Value |
|-----------|-------|
| **Data Type** | Internal Service Credentials |
| **Classification** | Restricted |
| **What It Is** | Service-to-service authentication tokens, JWT signing keys, mTLS certificates |
| **Where Stored** | Managed secrets store (Azure Key Vault), injected at runtime |
| **Who Can Access** | Specific service only (via managed identity), platform operators (break-glass) |
| **Encryption Requirement** | At rest: HSM-backed. In transit: Never transmitted (injected locally) |
| **Retention Recommendation** | Active: until rotation. Rotated: 30 days overlap, then delete |
| **Deletion Procedure** | Rotate to new credential → wait overlap period → delete old version from secrets store |

---

### Database Connection Strings

| Attribute | Value |
|-----------|-------|
| **Data Type** | Database Connection Strings |
| **Classification** | Restricted |
| **What It Is** | PostgreSQL connection credentials including host, port, username, password |
| **Where Stored** | Managed secrets store (Azure Key Vault), injected at runtime |
| **Who Can Access** | API service, internal services requiring database access |
| **Encryption Requirement** | At rest: HSM-backed. In transit: TLS to database required |
| **Retention Recommendation** | Active only. Delete immediately upon rotation |
| **Deletion Procedure** | Rotate credential in database → update secrets store → verify services reconnect → delete old version |

---

### Property UPRNs

| Attribute | Value |
|-----------|-------|
| **Data Type** | Property UPRNs (Unique Property Reference Numbers) |
| **Classification** | Sensitive |
| **What It Is** | Official UK property identifiers, links to Ordnance Survey AddressBase |
| **Where Stored** | PostgreSQL, API responses |
| **Who Can Access** | API service, API consumers (via authenticated requests) |
| **Encryption Requirement** | At rest: database-level encryption. In transit: TLS |
| **Retention Recommendation** | Active: indefinite (reference data). Unused: 1 year of no queries, then flag for review |
| **Deletion Procedure** | Mark inactive → archive after 1 year → delete after 2 years if not referenced |

---

### Addresses (Full)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Addresses (Full) |
| **Classification** | Sensitive |
| **What It Is** | Complete property addresses including house number, street, town, postcode |
| **Where Stored** | PostgreSQL, API responses, raw evidence (context) |
| **Who Can Access** | API service, authenticated API consumers |
| **Encryption Requirement** | At rest: database-level encryption. In transit: TLS |
| **Retention Recommendation** | Active: indefinite. Evidence containing addresses: 90 days |
| **Deletion Procedure** | Database: cascade from property record. Evidence: lifecycle policy |

---

### Addresses (Partial)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Addresses (Partial) |
| **Classification** | Internal |
| **What It Is** | Partial addresses in logs or metrics (e.g., postcode only, street name only) |
| **Where Stored** | Application logs, metrics |
| **Who Can Access** | Platform operators, developers |
| **Encryption Requirement** | At rest: log encryption. In transit: TLS |
| **Retention Recommendation** | 30 days in hot storage, 1 year in archive |
| **Deletion Procedure** | Automatic lifecycle policy |

---

### Postcode Inputs

| Attribute | Value |
|-----------|-------|
| **Data Type** | Postcode Inputs |
| **Classification** | Internal |
| **What It Is** | User-provided postcodes in API requests |
| **Where Stored** | Request logs, cache keys |
| **Who Can Access** | Platform operators |
| **Encryption Requirement** | At rest: log encryption. In transit: TLS |
| **Retention Recommendation** | 30 days (logs) |
| **Deletion Procedure** | Automatic log rotation |

---

### Collection Schedules (Council Public Data)

| Attribute | Value |
|-----------|-------|
| **Data Type** | Collection Schedules |
| **Classification** | Public |
| **What It Is** | Bin collection dates and bin types, sourced from public council websites |
| **Where Stored** | PostgreSQL, API responses, Redis cache |
| **Who Can Access** | Anyone (public API) |
| **Encryption Requirement** | In transit: TLS. At rest: standard database encryption (not mandatory) |
| **Retention Recommendation** | Historical: 2 years. Current: indefinite |
| **Deletion Procedure** | Archive old schedules, no immediate deletion required |

---

### Raw HTML Evidence

| Attribute | Value |
|-----------|-------|
| **Data Type** | Raw HTML Evidence |
| **Classification** | Internal |
| **What It Is** | HTML pages fetched from council websites, stored for debugging and audit |
| **Where Stored** | Blob storage (Azure Blob / S3) |
| **Who Can Access** | Adapters (write), platform operators (read), admin service (read) |
| **Encryption Requirement** | At rest: blob-level encryption. In transit: TLS |
| **Retention Recommendation** | 90 days maximum |
| **Deletion Procedure** | Automated lifecycle policy deletes after 90 days |

---

### Raw XHR Evidence

| Attribute | Value |
|-----------|-------|
| **Data Type** | Raw XHR Evidence |
| **Classification** | Internal |
| **What It Is** | JSON/XHR responses captured during scraping, stored for debugging |
| **Where Stored** | Blob storage (Azure Blob / S3) |
| **Who Can Access** | Adapters (write), platform operators (read), admin service (read) |
| **Encryption Requirement** | At rest: blob-level encryption. In transit: TLS |
| **Retention Recommendation** | 90 days maximum |
| **Deletion Procedure** | Automated lifecycle policy deletes after 90 days |

---

### Audit Logs

| Attribute | Value |
|-----------|-------|
| **Data Type** | Audit Logs |
| **Classification** | Internal |
| **What It Is** | Records of significant system events, admin actions, data changes |
| **Where Stored** | Centralized logging (Azure Monitor / CloudWatch / ELK), immutable archive |
| **Who Can Access** | Platform operators (read), security team (read), no write access |
| **Encryption Requirement** | At rest: Yes. In transit: TLS. Integrity: append-only |
| **Retention Recommendation** | 2 years minimum (compliance), 7 years for financial/legal |
| **Deletion Procedure** | Automated after retention period; deletion requires security approval |

---

### Error Logs

| Attribute | Value |
|-----------|-------|
| **Data Type** | Error Logs |
| **Classification** | Internal |
| **What It Is** | Application error messages, stack traces, diagnostic information |
| **Where Stored** | Centralized logging, application monitoring |
| **Who Can Access** | Developers, platform operators |
| **Encryption Requirement** | At rest: standard. In transit: TLS |
| **Retention Recommendation** | 30 days hot, 1 year archive |
| **Deletion Procedure** | Automatic lifecycle policy |

---

### User Input History

| Attribute | Value |
|-----------|-------|
| **Data Type** | User Input History |
| **Classification** | Sensitive |
| **What It Is** | Record of API requests including postcodes and addresses queried |
| **Where Stored** | Request logs (anonymized or pseudonymized recommended) |
| **Who Can Access** | Platform operators (for debugging only) |
| **Encryption Requirement** | At rest: log encryption. In transit: TLS |
| **Retention Recommendation** | 30 days for debugging; anonymize for longer analytics |
| **Deletion Procedure** | Automatic log rotation; anonymization on archive |

---

### Adapter Configuration

| Attribute | Value |
|-----------|-------|
| **Data Type** | Adapter Configuration |
| **Classification** | Internal |
| **What It Is** | Per-adapter settings: council URL, polling interval, selectors, feature flags |
| **Where Stored** | Configuration files (version controlled), database |
| **Who Can Access** | Adapters (read), platform operators (read/write), developers (read) |
| **Encryption Requirement** | At rest: standard. In transit: TLS. No secrets in config (separate storage) |
| **Retention Recommendation** | Current: indefinite. Historical: version control retention |
| **Deletion Procedure** | Remove from config, retain in version control history |

---

### Admin User Identities

| Attribute | Value |
|-----------|-------|
| **Data Type** | Admin User Identities |
| **Classification** | Restricted |
| **What It Is** | Admin user accounts, roles, permissions, SSO identifiers |
| **Where Stored** | Identity provider (Azure AD / Okta), admin database |
| **Who Can Access** | Admin service (authenticate), identity admins (manage) |
| **Encryption Requirement** | At rest: IdP-managed. In transit: TLS |
| **Retention Recommendation** | Active: indefinite. Offboarded: 90 days, then delete |
| **Deletion Procedure** | Deactivate in IdP → remove roles → delete after 90 days |

---

### Security Event Logs

| Attribute | Value |
|-----------|-------|
| **Data Type** | Security Event Logs |
| **Classification** | Restricted |
| **What It Is** | Authentication failures, authorization violations, anomaly detections, security alerts |
| **Where Stored** | SIEM (Azure Sentinel / Splunk), immutable archive |
| **Who Can Access** | Security team (read), incident responders (read), no write access |
| **Encryption Requirement** | At rest: Yes. In transit: TLS. Integrity: cryptographic signing |
| **Retention Recommendation** | 2 years minimum, 7 years for forensic capability |
| **Deletion Procedure** | Security team approval required; deletion logged |

---

## Summary Matrix

| Data Type | Classification | Encryption at Rest | Retention | Primary Owner |
|-----------|---------------|-------------------|-----------|---------------|
| API Keys | Sensitive | Yes (hashed) | Active + 90 days | Holden (API) |
| Internal Service Credentials | Restricted | HSM-backed | Until rotation | Drummer (Ops) |
| Database Connection Strings | Restricted | HSM-backed | Active only | Drummer (Ops) |
| Property UPRNs | Sensitive | Yes | 2 years inactive | Holden (API) |
| Addresses (Full) | Sensitive | Yes | Active + evidence 90d | Holden (API) |
| Addresses (Partial) | Internal | Yes | 30 days | Drummer (Ops) |
| Postcode Inputs | Internal | Yes | 30 days | Drummer (Ops) |
| Collection Schedules | Public | Standard | Indefinite | Holden (API) |
| Raw HTML Evidence | Internal | Yes | 90 days | Naomi (Adapters) |
| Raw XHR Evidence | Internal | Yes | 90 days | Naomi (Adapters) |
| Audit Logs | Internal | Yes | 2-7 years | Amos (Security) |
| Error Logs | Internal | Standard | 1 year | Drummer (Ops) |
| User Input History | Sensitive | Yes | 30 days | Holden (API) |
| Adapter Configuration | Internal | Standard | Version controlled | Naomi (Adapters) |
| Admin User Identities | Restricted | IdP-managed | Active + 90 days | Amos (Security) |
| Security Event Logs | Restricted | Yes (signed) | 2-7 years | Amos (Security) |

---

## Handling Rules by Classification

### Public Data
- May be returned via public API without authentication
- May be cached at edge/CDN
- No encryption requirements beyond standard transport

### Internal Data
- Not exposed via public API
- Access logged
- Standard encryption at rest
- Access requires authentication

### Sensitive Data
- Encrypted at rest and in transit
- Access logged and auditable
- Minimal data returned (need-to-know)
- Retention limits enforced
- Regular access review

### Restricted Data
- HSM-backed encryption where possible
- Strict access controls (role-based)
- All access logged and alerted
- Rotation policies enforced
- Break-glass procedures documented
- Regular access review (quarterly)
- Incident response procedures for exposure

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial data classification matrix |
