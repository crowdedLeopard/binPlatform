# Phase 2 Security Implementation — Integration Guide

**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**For:** Holden (API/Architecture Lead)

---

## What Was Delivered

Phase 2 security infrastructure is complete and ready for integration. All code is production-ready TypeScript.

### Files Created

**Observability:**
- `src/observability/audit.ts` — Structured audit logging with IP anonymisation, HMAC signing, 18 event types

**Storage:**
- `src/storage/db/security-events.ts` — Async persistence for queryable security events
- `src/storage/db/migrations/003_security_events.sql` — PostgreSQL table with optimised indexes

**Middleware:**
- `src/api/middleware/injection-detection.ts` — SQL injection, XSS, path traversal, null byte, CRLF detection
- `src/api/middleware/enumeration-detection.ts` — Sliding window rate limiting, soft/hard blocking

**Admin Routes:**
- `src/api/routes/admin/security-events.ts` — 5 query endpoints for security event retrieval

**Documentation:**
- `docs/threat-model/adapter-security-review.md` — Critical security gaps in adapter interface + proposed ADR
- `.squad/decisions/inbox/amos-phase2-security.md` — Mandatory security patterns for all adapters

---

## Integration Steps

### 1. Middleware Registration

Add to your main app setup (e.g., `src/api/app.ts`):

```typescript
import { injectionDetection } from './middleware/injection-detection.js';
import { enumerationDetection } from './middleware/enumeration-detection.js';

// Apply injection detection to ALL routes
app.use('*', injectionDetection);

// Apply enumeration detection to address resolution endpoints
app.use('/v1/postcodes/:postcode/addresses', enumerationDetection);
app.use('/v1/addresses', enumerationDetection);
```

**Order matters:** Injection detection should run BEFORE other middleware/routes.

---

### 2. Admin Security Routes

Add to your admin routes setup (e.g., `src/api/routes/admin.ts` or `src/api/routes/admin/index.ts`):

```typescript
import { registerSecurityEventRoutes } from './admin/security-events.js';

// Your existing admin app setup
const adminApp = new Hono();
adminApp.use('*', requireAdminAuth); // Your auth middleware

// Register security event routes
registerSecurityEventRoutes(adminApp);

// Existing admin routes...
```

This adds:
- `GET /v1/admin/security/events` — Paginated query with filters
- `GET /v1/admin/security/events/critical` — Critical events
- `GET /v1/admin/security/events/council/:councilId` — Per-council events
- `GET /v1/admin/security/events/ip/:ip` — IP abuse events
- `GET /v1/admin/security/stats` — Aggregated statistics

---

### 3. Database Client Injection

The security event storage needs a database connection. Inject your existing DB pool:

```typescript
import { setDatabaseClient } from './storage/db/security-events.js';

// After you initialize your database pool
const dbPool = createDatabasePool(); // Your existing DB setup

setDatabaseClient(dbPool);
```

**Note:** Security event writes are async and best-effort. Failures are logged but don't throw.

---

### 4. Redis Client Injection

Enumeration detection needs Redis for distributed tracking:

```typescript
import { setRedisClient } from './api/middleware/enumeration-detection.js';

// After you initialize your Redis client
const redis = createRedisClient(); // Your existing Redis setup

setRedisClient(redis);
```

**Note:** If Redis is unavailable, enumeration detection is disabled (logged as warning).

---

### 5. Run Database Migration

Apply the security events table migration:

```bash
psql $DATABASE_URL -f src/storage/db/migrations/003_security_events.sql
```

Or use your migration tool (e.g., `node-pg-migrate`, Knex).

---

### 6. Environment Variables

Add to `.env` or secrets management:

```bash
# Audit log signing (CHANGE IN PRODUCTION)
AUDIT_HMAC_SECRET=your-secret-here-min-32-chars

# Address hashing pepper (CHANGE IN PRODUCTION)
ADDRESS_HASH_PEPPER=your-pepper-here-min-32-chars
```

**CRITICAL:** Generate strong random values for production. These are used for tamper evidence and PII hashing.

---

## Using the Audit Logger

Import and use anywhere in your codebase:

```typescript
import { auditLogger } from './observability/audit.js';

// Log authentication attempt
auditLogger.logAuth(
  success: true,
  apiKeyIdHash: hashApiKeyId(apiKeyId),
  ip: clientIp,
);

// Log adapter acquisition
auditLogger.logAdapterAcquisition(
  councilId: 'basingstoke-deane',
  input: { postcode: 'RG21 4AF', correlationId: req.id },
  outcome: { success: true, durationMs: 1234, cacheHit: false },
  actorIp: clientIp,
);

// Log admin action
auditLogger.logAdminAction(
  action: 'adapter.disable',
  actor: { type: 'admin', id: adminUserId, ip: adminIp },
  target: { type: 'adapter', councilId: 'basingstoke-deane' },
  outcome: 'success',
  metadata: { reason: 'Schema drift detected' },
);

// Log security event
auditLogger.logSecurityEvent(
  type: 'upstream_anomaly',
  severity: 'critical',
  context: {
    councilId: 'basingstoke-deane',
    description: 'Unexpected redirect to external domain',
    upstreamStatusCode: 302,
  },
);
```

All audit events are:
- Logged to structured log stream (`audit: true` field)
- Persisted to database asynchronously (if DB client set)
- Signed with HMAC for tamper detection
- IP addresses automatically anonymised

---

## Testing the Implementation

### Test Injection Detection

```bash
# Should return 400 INVALID_INPUT
curl "http://localhost:3000/v1/postcodes/RG21%20%27OR%201=1/addresses"

# Should succeed
curl "http://localhost:3000/v1/postcodes/RG21%204AF/addresses"
```

Check logs for `AUDIT: security.injection_attempt`.

### Test Enumeration Detection

```bash
# Make 60+ unique postcode requests from same IP
for i in {1..60}; do
  curl "http://localhost:3000/v1/postcodes/RG21%20${i}XX/addresses"
done

# After 50: soft block (artificial delay)
# After 100: hard block (429 response)
```

Check logs for `AUDIT: abuse.enumeration_detected`.

### Test Admin Endpoints

```bash
# Get critical events
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/v1/admin/security/events/critical?hours=24"

# Get security stats
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "http://localhost:3000/v1/admin/security/stats"
```

---

## Critical Decisions Required

I've documented several **security gaps in the adapter interface** that need your review:

1. **BREAKING CHANGE:** Remove `storagePath` from `SourceEvidence` interface
   - **Why:** Path traversal vulnerability if adapters control storage paths
   - **Impact:** Adapters can't set storage paths (platform generates them)
   - **See:** `docs/threat-model/adapter-security-review.md` Section 3

2. **Add mandatory output sanitisation requirement** to interface docs
   - **Why:** Prevent XSS from malicious upstream HTML
   - **Impact:** All adapters must HTML-escape output fields
   - **See:** `.squad/decisions/inbox/amos-phase2-security.md` Pattern 1

3. **Document input validation contract** in interface
   - **Why:** Adapters need to know what validation platform guarantees
   - **Impact:** Platform must validate inputs before calling adapters
   - **See:** `.squad/decisions/inbox/amos-phase2-security.md` Pattern 4

**Action:** Please review and propose timeline for:
- Accepting/rejecting the `storagePath` removal
- Implementing input validation middleware
- Updating interface documentation

Full details in: `.squad/decisions/inbox/amos-phase2-security.md`

---

## Production Readiness Checklist

Before deploying to production:

- [ ] Database migration `003_security_events.sql` applied
- [ ] `AUDIT_HMAC_SECRET` set to strong random value (min 32 chars)
- [ ] `ADDRESS_HASH_PEPPER` set to strong random value (min 32 chars)
- [ ] Redis client injected (or enumeration detection disabled)
- [ ] Database client injected (or security events not persisted)
- [ ] Middleware registered in correct order (injection detection first)
- [ ] Admin routes protected with authentication
- [ ] SIEM transport configured (currently stub in `audit.ts`)
- [ ] Log aggregation configured (audit events should go to separate stream)

---

## Future Enhancements (Phase 3)

Deferred to Phase 3 for operational maturity:

1. **SIEM Integration:** Implement transport in `audit.ts` to ship events to Azure Sentinel/Splunk/Datadog
2. **Anomaly Detection:** Machine learning on security events to detect novel attack patterns
3. **Enhanced Health Metrics:** Add degradation signals to `AdapterHealth` (see adapter security review)
4. **Automated Compliance Scanning:** Scan adapters for security pattern compliance in CI

---

## Questions?

Contact: **Amos** (Security Engineer)

All code is production-ready. Integration should take ~2 hours.
