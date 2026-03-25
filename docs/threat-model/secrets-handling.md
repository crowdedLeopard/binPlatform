# Secrets Handling Design — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

This document defines how secrets are managed across the Hampshire Bin Collection Data Platform. The goal is to ensure secrets are never exposed, are rotated regularly, and that compromise of one secret limits blast radius.

**Core Principles:**
1. Secrets are never stored in code, config files, or version control
2. Secrets are injected at runtime from a managed secrets store
3. Every secret has a rotation schedule
4. Compromise of one secret should not compromise others
5. Secret access is logged and auditable

---

## Secrets Inventory

| Secret | Classification | Owner | Rotation Schedule | Usage |
|--------|---------------|-------|------------------|-------|
| Database (PostgreSQL) credentials | Restricted | API Service, Internal Service | 90 days | Database connection |
| Redis credentials | Restricted | API Service, Cache Layer | 90 days | Cache connection |
| Blob storage credentials/SAS | Restricted | Adapter Workers, Evidence Service | 90 days | Evidence storage |
| JWT signing key | Restricted | Auth Layer | 180 days | Token signing |
| API key hashing pepper | Restricted | Auth Layer | 1 year (requires rehash) | API key storage |
| Service-to-service tokens | Restricted | Internal Services | 30 days | mTLS / service auth |
| Admin SSO integration secrets | Restricted | Admin Service | 180 days | SSO callback |
| Monitoring/APM tokens | Internal | All Services | 180 days | Telemetry export |
| CI/CD deployment credentials | Restricted | Pipeline | 90 days | Infrastructure deployment |
| Container registry credentials | Restricted | Pipeline, Runtime | 90 days | Image pull |
| DNS provider credentials | Restricted | Pipeline | 180 days | DNS management |
| Cloud provider credentials | Restricted | Pipeline, Admin | 90 days | Infrastructure management |

---

## Recommended Secrets Store

**Primary Recommendation: Azure Key Vault**

Rationale:
- Native Azure integration with Managed Identity
- HSM-backed storage available
- Audit logging built-in
- Secret versioning and rotation support
- Soft-delete with purge protection
- Access policies with least privilege

**Alternative Options:**
- AWS Secrets Manager (if deploying to AWS)
- HashiCorp Vault (if multi-cloud or on-premises)

---

## Secrets Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Azure Key Vault                              │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  Secrets:                                                     │  │
│  │  - postgresql-connection-string                               │  │
│  │  - redis-connection-string                                    │  │
│  │  - blob-storage-sas-key                                       │  │
│  │  - jwt-signing-key                                            │  │
│  │  - api-key-pepper                                             │  │
│  │  - service-to-service-keys/*                                  │  │
│  │  - admin-sso-client-secret                                    │  │
│  │  - monitoring-api-key                                         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    (Managed Identity)
                                │
        ┌───────────────────────┴───────────────────────┐
        │                                               │
        ▼                                               ▼
┌───────────────────┐                     ┌───────────────────────┐
│   API Service     │                     │   Adapter Workers     │
│   (Managed ID:    │                     │   (Managed ID:        │
│    api-service)   │                     │    adapter-worker)    │
│                   │                     │                       │
│   Has access to:  │                     │   Has access to:      │
│   - postgresql    │                     │   - blob-storage-sas  │
│   - redis         │                     │   - adapter-specific  │
│   - jwt-signing   │                     │                       │
└───────────────────┘                     └───────────────────────┘
```

---

## How Secrets Reach Running Processes

### Container/Kubernetes Deployment

1. **At deployment time:**
   - Container is assigned a Managed Identity
   - Managed Identity has Key Vault access policy for specific secrets only

2. **At startup:**
   - Application initializes Key Vault client using Managed Identity
   - Application fetches required secrets from Key Vault
   - Secrets are held in memory only (never written to disk)
   - Application validates all required secrets are present

3. **At runtime:**
   - Secrets used for database connections, signing, etc.
   - Secrets can be refreshed periodically for rotation

### Environment Variable Pattern (Alternative for Simpler Deployments)

1. **At deployment time:**
   - CI/CD pipeline fetches secrets from Key Vault
   - Secrets injected as environment variables into container

2. **At startup:**
   - Application reads environment variables
   - Variables validated at startup

**⚠️ Important:** Environment variables should be injected by orchestrator (Kubernetes Secrets, Azure Container Apps secrets), never stored in container images or config files.

### Secret Injection Code Pattern

```typescript
// Example: Secret validation at startup
import { SecretClient } from "@azure/keyvault-secrets";
import { DefaultAzureCredential } from "@azure/identity";

const REQUIRED_SECRETS = [
  "postgresql-connection-string",
  "redis-connection-string",
  "jwt-signing-key"
];

async function loadSecrets(): Promise<Map<string, string>> {
  const client = new SecretClient(
    process.env.KEY_VAULT_URL!,
    new DefaultAzureCredential()
  );
  
  const secrets = new Map<string, string>();
  const errors: string[] = [];
  
  for (const name of REQUIRED_SECRETS) {
    try {
      const secret = await client.getSecret(name);
      if (!secret.value) {
        errors.push(`Secret ${name} is empty`);
      } else {
        secrets.set(name, secret.value);
      }
    } catch (error) {
      errors.push(`Failed to load secret ${name}: ${error}`);
    }
  }
  
  if (errors.length > 0) {
    console.error("Secret loading failed:", errors);
    process.exit(1); // Fail safely - do not start with missing secrets
  }
  
  return secrets;
}
```

---

## Secret Rotation Procedures

### Database Credentials (PostgreSQL)

**Rotation Period:** 90 days

**Procedure:**
1. Generate new password meeting complexity requirements
2. Update password in PostgreSQL: `ALTER ROLE appuser PASSWORD 'newpassword';`
3. Update secret in Key Vault (creates new version)
4. Rolling restart of services (graceful - they'll pick up new secret)
5. Verify connections succeed with new credentials
6. Verify old credential no longer works
7. Monitor for connection failures

**Automation:** Use Azure Key Vault auto-rotation or external rotation Lambda/Function

### Redis Credentials

**Rotation Period:** 90 days

**Procedure:**
1. If using Azure Cache for Redis: rotate access keys via Azure portal/CLI
2. Update secret in Key Vault
3. Rolling restart of services
4. Verify cache operations succeed

### JWT Signing Key

**Rotation Period:** 180 days

**Procedure:**
1. Generate new signing key
2. Add new key to Key Vault as primary
3. Keep old key in Key Vault as secondary (for validation)
4. Update services to sign with new key, validate with both
5. Wait for all old tokens to expire (token lifetime + buffer)
6. Remove old key from Key Vault

**Note:** JWT validation should accept multiple keys during rotation window

### API Key Pepper

**Rotation Period:** 1 year (requires data migration)

**Procedure:**
1. Generate new pepper
2. Add new pepper to Key Vault (keep old)
3. Update auth layer to validate against both peppers
4. Background job re-hashes all API keys with new pepper
5. Once complete, remove old pepper
6. Remove dual-validation logic

**⚠️ High Risk:** Requires careful coordination. Schedule during maintenance window.

---

## Handling Secret Compromise

### Immediate Response (within 1 hour)

1. **Identify scope:** Which secret was compromised?
2. **Revoke immediately:**
   - Database: change password, kill existing connections
   - Redis: rotate access keys
   - JWT signing key: rotate key, invalidate all tokens
   - API keys: revoke compromised keys
3. **Rotate to new secret** in Key Vault
4. **Deploy/restart** affected services
5. **Monitor** for unauthorized access attempts

### Investigation (within 24 hours)

1. Review audit logs for secret access
2. Identify how compromise occurred
3. Assess data exposure
4. Document timeline

### Remediation (within 7 days)

1. Fix root cause (code fix, access policy tightening)
2. Review for similar vulnerabilities
3. Update rotation procedures if needed
4. Incident report to stakeholders

### Secret-Specific Runbooks

| Secret | Compromise Indicator | Kill Switch |
|--------|---------------------|-------------|
| Database credentials | Unexpected queries, data exfiltration | Change password, terminate connections |
| Redis credentials | Unexpected KEYS operations | Rotate access key |
| JWT signing key | Invalid tokens appearing valid | Rotate key, invalidate all sessions |
| Blob storage SAS | Unauthorized blob access | Regenerate storage account key |
| CI/CD credentials | Unauthorized deployments | Revoke token, review recent deployments |

---

## What Must Never Contain Secrets

### Absolutely Prohibited

- **Source code:** No hardcoded secrets, no default passwords
- **Git history:** If secret was committed, consider it compromised
- **Config files:** Environment-specific config must not contain secrets
- **Container images:** Images must not bake in secrets
- **Test fixtures:** Use fake/mock secrets in tests
- **Documentation:** Never include actual secrets in docs
- **Error messages:** Never include secrets in user-facing errors
- **Log output:** Never log secrets (see redaction rules below)
- **API responses:** Never return secrets to clients
- **URL parameters:** Never put secrets in URLs (logged by proxies)
- **Browser local storage:** Never store secrets client-side

### Log Redaction Rules

The logging system MUST automatically redact:
- Any string matching `password`, `secret`, `token`, `key`, `credential`, `auth`
- Connection strings
- Authorization headers
- Bearer tokens
- Base64-encoded strings over 32 characters (likely tokens)

```typescript
// Example: Secret redaction in logging
const REDACT_PATTERNS = [
  /password[=:]["']?[^"'\s]*/gi,
  /secret[=:]["']?[^"'\s]*/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /authorization[=:]\s*["']?[^"'\s]*/gi,
  /[a-zA-Z0-9+/]{40,}={0,2}/g, // Base64 strings
];

function redactSecrets(message: string): string {
  let result = message;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}
```

---

## Startup Validation

Every service MUST validate secrets at startup and fail safely if secrets are missing or invalid.

### Validation Checklist

1. **Presence:** All required secrets are present
2. **Non-empty:** Secrets are not empty strings
3. **Format:** Secrets match expected format (e.g., connection string structure)
4. **Connectivity:** Secrets work (e.g., database connection succeeds)
5. **Permissions:** Credentials have required permissions

### Failure Behavior

- If validation fails: **Exit with non-zero code**
- Do not start serving traffic with missing secrets
- Log which secrets are missing (not the values)
- Alert on failed startup

```typescript
async function validateStartup(): Promise<void> {
  const secrets = await loadSecrets();
  
  // Test database connection
  try {
    const db = createConnection(secrets.get("postgresql-connection-string")!);
    await db.query("SELECT 1");
    await db.close();
  } catch (error) {
    console.error("Database connection validation failed");
    process.exit(1);
  }
  
  // Test Redis connection
  try {
    const redis = createRedisClient(secrets.get("redis-connection-string")!);
    await redis.ping();
    await redis.quit();
  } catch (error) {
    console.error("Redis connection validation failed");
    process.exit(1);
  }
  
  console.log("All secrets validated successfully");
}
```

---

## Access Control Matrix

| Secret | API Service | Adapter Worker | Admin Service | CI/CD Pipeline |
|--------|-------------|----------------|---------------|----------------|
| postgresql-connection-string | ✅ Read | ❌ | ✅ Read | ❌ |
| redis-connection-string | ✅ Read | ❌ | ❌ | ❌ |
| blob-storage-sas | ❌ | ✅ Read | ✅ Read | ❌ |
| jwt-signing-key | ✅ Read | ❌ | ✅ Read | ❌ |
| api-key-pepper | ✅ Read | ❌ | ❌ | ❌ |
| admin-sso-client-secret | ❌ | ❌ | ✅ Read | ❌ |
| monitoring-api-key | ✅ Read | ✅ Read | ✅ Read | ❌ |
| deployment-credentials | ❌ | ❌ | ❌ | ✅ Read |

---

## Audit and Monitoring

### Key Vault Audit Logging

Enable Key Vault diagnostic logs to capture:
- All secret access events
- Failed access attempts
- Secret modifications

### Alerting Rules

| Event | Severity | Action |
|-------|----------|--------|
| Failed secret access | Warning | Investigate if repeated |
| Secret accessed by unexpected identity | Critical | Immediate investigation |
| Secret modified outside rotation window | Critical | Verify legitimate change |
| High volume of secret reads | Warning | Check for credential stuffing |
| Secret access from unusual IP | Critical | Verify legitimate access |

---

## Key Vault Configuration

```bicep
// Example: Azure Key Vault configuration (Bicep)
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: 'binday-secrets-${environment}'
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard' // Use 'premium' for HSM-backed
    }
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: true
    enableRbacAuthorization: true
    networkAcls: {
      defaultAction: 'Deny'
      bypass: 'AzureServices'
      virtualNetworkRules: [
        {
          id: vnetSubnetId
        }
      ]
    }
  }
}

// API Service identity access
resource apiServiceAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiServiceIdentity.id, 'KeyVaultSecretsUser')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: apiServiceIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial secrets handling design |
