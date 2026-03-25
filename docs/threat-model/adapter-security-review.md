# Adapter Security Review — Hampshire Bin Collection Data Platform

**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Version:** 1.0  
**Status:** For Holden's Review  

---

## Executive Summary

This document reviews the `CouncilAdapter` interface from `src/adapters/base/adapter.interface.ts` from a security perspective. The interface is well-designed from a functional standpoint but has several **security gaps** that must be addressed before Phase 2 production deployment.

**Critical Findings:**
1. **No output sanitisation enforcement** — Adapters can return unsanitised data
2. **State leakage risk** — No explicit isolation guarantees between requests
3. **Evidence path injection vulnerability** — Storage paths could be manipulated
4. **Incomplete security profile** — Missing runtime enforcement signals
5. **No input validation contract** — Trust boundary unclear

**Recommendation:** Propose ADR for interface enhancements (see Section 7).

---

## 1. Output Sanitisation Gap

### Current State
The interface defines output types (`AddressCandidate`, `CollectionEvent`, etc.) but does **not enforce** that adapters sanitise their output before returning it.

**Risk:**
- Malicious upstream HTML/JavaScript could be returned in `addressDisplay`, `serviceNameDisplay`, `notes` fields
- If these fields are rendered in admin UI or customer-facing apps without sanitisation, XSS vulnerability
- Adapter could return `<script>alert('XSS')</script>` in `notes` field

**Example Attack Vector:**
```typescript
// Malicious council response
const councilResponse = {
  address: "123 High St <script>alert(document.cookie)</script>"
};

// Adapter naively returns unsanitised data
return {
  addressDisplay: councilResponse.address, // XSS payload
};
```

### Recommendations

**Option 1: Enforce at interface level**
```typescript
export interface AddressCandidate {
  /** Display-friendly address (MUST be HTML-escaped) */
  addressDisplay: string;
  
  /** Additional metadata (MUST be sanitised, no HTML) */
  metadata?: Record<string, unknown>;
}
```

Add to interface documentation:
> **CRITICAL:** All output fields must be sanitised. HTML-escape all text fields. Never return raw upstream content.

**Option 2: Enforce at platform boundary**
- Implement a `SanitisationLayer` that wraps all adapter responses
- Automatically HTML-escape all string fields before returning to API
- Pro: Adapters can't bypass
- Con: Performance overhead, may over-sanitise

**Recommendation:** **Option 1** (documentation + code review) for Phase 1, **Option 2** (enforcement layer) for Phase 2.

---

## 2. State Leakage Risk

### Current State
Interface documentation states adapters "must be stateless" but does not enforce this architecturally.

**Risk:**
- Adapter developer might cache council session state in instance variables
- State from Request A (Property X) could leak into Request B (Property Y)
- Example: Adapter caches `currentPropertyId` and accidentally returns data for wrong property

**Example Attack Vector:**
```typescript
class BadAdapter implements CouncilAdapter {
  private cachedData: any; // UNSAFE: shared state
  
  async getCollectionEvents(input: PropertyIdentity) {
    // Bug: returns cached data from previous request
    if (this.cachedData) {
      return this.cachedData; // Leak!
    }
    // ...
  }
}
```

### Recommendations

**Architectural Enforcement:**
1. **Fresh adapter instance per request** — Do not reuse adapter instances across requests
2. **Container isolation** — Each adapter runs in separate container (already planned)
3. **State detection tests** — Add integration tests that run concurrent requests and detect state leakage

**Interface Enhancement:**
Add to `CouncilAdapter` documentation:
> **CRITICAL:** Adapters MUST NOT store request-specific state in instance variables. All state must be passed explicitly through method parameters. Adapters may be shared across concurrent requests.

**Code Review Checklist:**
- [ ] No instance variables storing request data
- [ ] No shared mutable state (caches, session tokens)
- [ ] All inputs explicitly passed as parameters
- [ ] Thread-safe if language allows concurrency

---

## 3. Evidence Storage Path Injection

### Current State
The `SourceEvidence.storagePath` field is returned by adapters. If this path is used directly for blob storage writes, **path traversal vulnerability** exists.

**Risk:**
- Malicious adapter (or compromised adapter) sets `storagePath = "../../sensitive-config.json"`
- Storage layer writes evidence to unexpected location
- Could overwrite sensitive files or escape evidence directory

**Example Attack Vector:**
```typescript
// Malicious adapter
return {
  sourceEvidenceRef: "evidence-123",
  storagePath: "../../../etc/passwd", // Path traversal attempt
};
```

### Recommendations

**Mitigation:**
1. **Platform constructs storage paths** — Adapters should NOT set `storagePath`
2. **Deterministic path generation** — Platform generates path from: `{councilId}/{year}/{month}/{evidenceRef}.{extension}`
3. **Path validation** — If adapters must suggest paths, validate:
   - No `..` components
   - No absolute paths
   - Matches expected pattern: `^[a-z0-9-]+/[0-9]{4}/[0-9]{2}/[a-z0-9-]+\.[a-z]+$`

**Proposed Interface Change:**
```typescript
export interface SourceEvidence {
  evidenceRef: string;      // Platform-generated UUID
  evidenceType: 'html' | 'json' | 'screenshot' | 'pdf' | 'har';
  // storagePath: REMOVED — platform controls this
  contentHash: string;
  sizeBytes: number;
  capturedAt: string;
  expiresAt: string;
  containsPii: boolean;
}
```

Platform logic:
```typescript
function generateStoragePath(councilId: string, evidenceRef: string, type: string): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  
  // Safe path construction
  return `evidence/${councilId}/${year}/${month}/${evidenceRef}.${type}`;
}
```

---

## 4. Security Profile Incompleteness

### Current State
`AdapterSecurityProfile` returns useful metadata but is **missing runtime enforcement signals**.

**Missing Fields:**
1. **Maximum execution time** — How long should adapter be allowed to run before hard kill?
2. **Memory limit** — What is safe memory allocation for this adapter?
3. **Network egress requirements** — Exact domains, not just list (for allowlist enforcement)
4. **Credential usage flag** — Does this adapter require council credentials? (GDPR/audit requirement)
5. **PII handling declaration** — Does adapter process PII? What types?

### Recommendations

**Enhanced SecurityProfile:**
```typescript
export interface AdapterSecurityProfile {
  councilId: string;
  riskLevel: ExecutionRiskLevel;
  
  // Execution limits
  maxExecutionTimeSeconds: number;      // Hard timeout
  maxMemoryMb: number;                   // Container memory limit
  maxConcurrentExecutions: number;       // Prevent resource exhaustion
  
  // Network requirements
  allowedDomains: string[];              // Exact domains for allowlist
  allowedIpRanges?: string[];            // Optional IP allowlist
  requiresTls: boolean;                  // Enforce HTTPS only
  
  // Security flags
  requiresBrowserAutomation: boolean;
  executesJavaScript: boolean;
  handlesCredentials: boolean;
  
  // Privacy flags
  processesPii: boolean;                 // Any PII handling
  piiTypes: ('address' | 'uprn' | 'name' | 'email' | 'phone')[];
  retentionDays: number;                 // Evidence retention override
  
  // Audit
  securityConcerns: string[];
  lastSecurityReview?: string;
  
  // Runtime enforcement
  isSandboxed: boolean;
  networkIsolation: 'none' | 'egress_filtered' | 'allowlist_only';
  requiredPermissions: string[];
  
  // Monitoring
  alertOnFailure: boolean;               // Alert security team on failure?
  requiresManualReview: boolean;         // Phase 1 adapters need review
}
```

**Usage:**
- Platform reads `maxExecutionTimeSeconds` and sets container timeout
- Platform reads `allowedDomains` and configures egress firewall
- Platform reads `processesPii` and enforces retention policies

---

## 5. Input Validation Contract Missing

### Current State
Interface defines input types (`PropertyLookupInput`, `PropertyIdentity`) but does **not specify** what validation adapters can assume.

**Risk:**
- Adapter assumes postcode is already validated
- Adapter receives malicious input and crashes
- No clear contract on: character limits, format validation, encoding

**Example:**
```typescript
// Who validates this?
const input: PropertyLookupInput = {
  postcode: "'; DROP TABLE properties; --", // SQL injection attempt
  correlationId: "x".repeat(1000000), // DoS via huge correlation ID
};
```

### Recommendations

**Define Validation Contract:**

1. **Platform validates before calling adapter:**
   - Postcode: UK format, max 8 chars
   - UPRN: Numeric, max 12 digits
   - Address fragment: Max 100 chars, no control characters
   - Correlation ID: UUID format only

2. **Adapter can trust inputs are pre-validated**

3. **Document in interface:**
```typescript
/**
 * Input for property/address lookup operations.
 * 
 * VALIDATION CONTRACT:
 * - All inputs are pre-validated by platform before adapter receives them
 * - Postcode: UK format (e.g., "SO16 7NP"), max 8 chars
 * - UPRN: Numeric string, max 12 digits (if provided)
 * - Address fragment: Max 100 chars, alphanumeric + spaces/punctuation only
 * - Correlation ID: UUID v4 format
 * 
 * Adapters SHOULD still perform defensive validation but MAY assume basic format correctness.
 */
export interface PropertyLookupInput {
  // ...
}
```

**Proposed ADR Topic:** "Input Validation Responsibility Boundary"

---

## 6. Missing: Adapter Health Degradation Signals

### Current State
`AdapterHealth` reports binary status but lacks **degradation signals** for gradual failure detection.

**Missing:**
- Upstream response time trend (detecting slowdown before failure)
- Schema drift confidence score (0-1, how much has schema changed?)
- Error rate by type (network vs. parse vs. validation)
- Cache hit rate (detecting upstream changes)

### Recommendations

**Enhanced Health:**
```typescript
export interface AdapterHealth {
  // Existing fields...
  
  // Performance trends
  avgResponseTimeMs24h: number;
  avgResponseTimeMs7d: number;        // Trend comparison
  p95ResponseTimeMs24h: number;       // Detect outliers
  
  // Error breakdown
  errorBreakdown24h: {
    network: number;
    parse: number;
    validation: number;
    upstream: number;
  };
  
  // Schema drift
  schemaDriftDetected: boolean;
  schemaDriftConfidence: number;      // 0-1, how severe is drift?
  schemaChangesSince: Date;           // When did schema last change?
  
  // Cache effectiveness
  cacheHitRate24h: number;            // 0-1
  cacheInvalidationRate24h: number;   // How often cache invalidated?
  
  // Anomaly flags
  anomalyDetected: boolean;
  anomalyDescription?: string;
}
```

**Usage:**
- Alert when `p95ResponseTimeMs24h` exceeds `avgResponseTimeMs7d` by 2x
- Kill switch when `schemaDriftConfidence > 0.8`

---

## 7. Proposed ADR: Adapter Security Enhancements

### Title
**ADR-XXX: Adapter Interface Security Enhancements (Phase 2)**

### Status
**Proposed** — For Holden's review

### Context
Phase 1 adapter interface is functional but has security gaps identified in security review.

### Decision
Enhance `CouncilAdapter` interface with:

1. **Output Sanitisation Requirement**
   - Document mandatory sanitisation in all output fields
   - Platform adds sanitisation layer in Phase 2

2. **State Isolation Enforcement**
   - Document stateless requirement more prominently
   - Add integration tests for state leakage detection
   - Platform creates fresh adapter instances per request

3. **Evidence Path Security**
   - Remove `storagePath` from `SourceEvidence`
   - Platform constructs all storage paths deterministically

4. **Enhanced Security Profile**
   - Add runtime enforcement fields: `maxExecutionTimeSeconds`, `maxMemoryMb`, `allowedDomains`
   - Add privacy fields: `processesPii`, `piiTypes`, `retentionDays`

5. **Input Validation Contract**
   - Document platform validation guarantees
   - Adapters can trust pre-validated inputs

6. **Health Degradation Signals**
   - Add performance trends and error breakdown to `AdapterHealth`

### Consequences

**Positive:**
- Clearer security contract for adapter developers
- Platform can enforce security controls automatically
- Early detection of adapter degradation

**Negative:**
- Breaking changes to interface (Phase 2 only)
- More complex `SecurityProfile` (but necessary)
- Adapters need updates to return enhanced health

**Migration:**
- Phase 1: Document requirements, no breaking changes
- Phase 2: Implement interface changes, migrate existing adapters

### Implementation Owners
- **Holden:** Interface changes, platform enforcement
- **Naomi:** Adapter migrations, testing
- **Amos:** Security validation, code review

---

## 8. Immediate Phase 2 Actions

### Critical (Before Production)
- [ ] **Document output sanitisation requirement** in interface comments
- [ ] **Remove `storagePath` from `SourceEvidence`** — platform controls paths
- [ ] **Add state leakage integration tests** — detect shared state bugs
- [ ] **Implement input validation layer** before adapter calls

### High Priority (Phase 2)
- [ ] **Enhance `AdapterSecurityProfile`** with runtime limits
- [ ] **Add sanitisation enforcement layer** for all adapter outputs
- [ ] **Implement schema drift detection** with confidence scoring

### Medium Priority (Phase 3)
- [ ] **Add health degradation metrics** to monitoring
- [ ] **Implement anomaly detection** on adapter performance

---

## 9. Security Patterns All Adapters Must Follow

### Mandatory Patterns (Phase 1)

1. **Never trust upstream content**
   - All council responses are hostile until proven otherwise
   - Validate all extracted data against schema
   - HTML-escape all text before returning

2. **No secrets in adapter code**
   - Council credentials must come from Key Vault
   - Never hardcode URLs, tokens, or session IDs

3. **Defensive parsing**
   - Set parsing timeouts (30s max)
   - Limit response sizes (10MB max)
   - Reject malformed HTML/JSON early

4. **Evidence capture**
   - Always capture raw response before parsing
   - Hash evidence for tamper detection
   - Never store PII in evidence metadata

5. **Error handling**
   - Never leak internal errors to logs/responses
   - Classify failures correctly (`FailureCategory`)
   - Return generic errors to API layer

### Recommended Patterns (Phase 2)

6. **Rate limit awareness**
   - Respect upstream rate limits
   - Implement exponential backoff on 429/503
   - Circuit breaker after 5 consecutive failures

7. **Schema versioning**
   - Return detected schema version in health check
   - Alert on schema changes
   - Support multiple schema versions if possible

8. **Session isolation**
   - Fresh browser context per request (Playwright)
   - No persistent cookies across requests
   - Clear all state after execution

---

## 10. Code Review Checklist for Adapters

When reviewing adapter PRs, check:

**Security:**
- [ ] No secrets in code/config
- [ ] All output fields HTML-escaped
- [ ] No instance variables storing request data
- [ ] Upstream responses validated before parsing
- [ ] Evidence paths not constructed from user input
- [ ] Error messages do not leak internal details

**Isolation:**
- [ ] No shared mutable state
- [ ] Fresh context per execution
- [ ] Resource limits configured (timeout, memory)

**Evidence:**
- [ ] Raw responses captured
- [ ] Evidence hashed
- [ ] No PII in metadata

**Error Handling:**
- [ ] Failures classified correctly
- [ ] Timeouts enforced
- [ ] Circuit breaker logic

**Testing:**
- [ ] Concurrent request tests (state leakage)
- [ ] Malicious input tests (injection, XSS)
- [ ] Upstream anomaly tests (hostile HTML)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial security review of adapter interface |
