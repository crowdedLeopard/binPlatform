# Security Headers Audit — Hampshire Bin Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  
**Classification:** Internal  

---

## Executive Summary

This audit verifies that all recommended security headers are properly configured for the Hampshire Bin Collection Data Platform API.

**Status:** PARTIAL PASS - Requires 3 fixes before production

**Critical Fixes Required:**
1. Add Permissions-Policy header
2. Add Cache-Control: no-store for sensitive endpoints
3. Remove server version disclosure

---

## Header-by-Header Analysis

### Content-Security-Policy (CSP)

**Status:** ✅ PASS

**Current Configuration:**
```typescript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'self'"],
    frameSrc: ["'none'"]
  }
}
```

**Evidence:** `src/api/server.ts` lines 29-41

**Analysis:**
- `default-src 'self'`: ✅ Restrictive default (only same-origin)
- `object-src 'none'`: ✅ Blocks Flash/Java plugins
- `frame-src 'none'`: ✅ Prevents embedding in frames
- `style-src 'unsafe-inline'`: ⚠️ Allows inline styles (acceptable for API responses)

**Verdict:** PASS (appropriate for JSON API)

---

### Strict-Transport-Security (HSTS)

**Status:** ✅ PASS

**Current Configuration:**
```typescript
hsts: {
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}
```

**Evidence:** `src/api/server.ts` lines 47-51

**Analysis:**
- `max-age=31536000`: ✅ 1 year (recommended minimum: 6 months)
- `includeSubDomains`: ✅ Covers all subdomains
- `preload`: ✅ Eligible for browser preload lists

**Recommendation:**
- Submit domain to HSTS preload list: https://hstspreload.org/

**Verdict:** PASS

---

### X-Content-Type-Options

**Status:** ✅ PASS

**Current Configuration:**
```typescript
noSniff: true
```

**Rendered Header:**
```
X-Content-Type-Options: nosniff
```

**Evidence:** `src/api/server.ts` line 53

**Analysis:**
- Prevents MIME-sniffing attacks
- Forces browsers to respect declared Content-Type
- Especially important for JSON APIs

**Verdict:** PASS

---

### X-Frame-Options

**Status:** ✅ PASS

**Current Configuration:**
```typescript
frameguard: { action: 'deny' }
```

**Rendered Header:**
```
X-Frame-Options: DENY
```

**Evidence:** `src/api/server.ts` line 46

**Analysis:**
- Prevents clickjacking attacks
- API responses should never be framed
- Redundant with `frame-ancestors 'none'` in CSP but provides defense in depth

**Verdict:** PASS

---

### X-XSS-Protection

**Status:** ⚠️ WARNING (deprecated header)

**Current Configuration:**
```typescript
xssFilter: true
```

**Rendered Header:**
```
X-XSS-Protection: 1; mode=block
```

**Evidence:** `src/api/server.ts` line 57

**Analysis:**
- **DEPRECATED:** This header is obsolete in modern browsers
- Modern browsers rely on CSP for XSS protection
- Can cause issues in older browsers
- Recommendation: Remove or set to `0` (disables legacy XSS filter)

**Verdict:** WARNING - Should be removed

---

### Referrer-Policy

**Status:** ✅ PASS

**Current Configuration:**
```typescript
referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
```

**Rendered Header:**
```
Referrer-Policy: strict-origin-when-cross-origin
```

**Evidence:** `src/api/server.ts` line 56

**Analysis:**
- Sends origin (not full URL) on cross-origin requests
- Prevents leaking sensitive URL parameters
- Appropriate for API

**Alternative:** Consider `no-referrer` for maximum privacy

**Verdict:** PASS

---

### Permissions-Policy

**Status:** ❌ FAIL - NOT CONFIGURED

**Current Configuration:** None

**Required Header:**
```
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=(), usb=()
```

**Analysis:**
- **MISSING:** This header is not configured
- Should disable all browser features not needed by API
- Modern replacement for Feature-Policy
- Prevents abuse of browser APIs

**Recommendation:**
```typescript
// Add to Helmet configuration
permissionsPolicy: {
  features: {
    geolocation: ["'none'"],
    microphone: ["'none'"],
    camera: ["'none'"],
    payment: ["'none'"],
    usb: ["'none'"],
    accelerometer: ["'none'"],
    gyroscope: ["'none'"],
    magnetometer: ["'none'"],
  }
}
```

**Verdict:** FAIL - Must implement before production

---

### Cache-Control

**Status:** ❌ FAIL - NOT CONFIGURED FOR SENSITIVE ENDPOINTS

**Current Configuration:** None (defaults to cacheable)

**Required Configuration:**
- Sensitive endpoints (API keys, addresses, UPRNs): `Cache-Control: no-store, max-age=0`
- Public endpoints (councils list, health): `Cache-Control: public, max-age=300`
- Moderate endpoints (collections): `Cache-Control: private, max-age=60`

**Analysis:**
- **MISSING:** No explicit cache control headers
- Sensitive data may be cached by browsers/proxies
- API responses containing addresses/UPRNs should never be cached
- Public data can be cached to reduce load

**Recommendation:**
Implement cache control middleware by endpoint type:
```typescript
// Sensitive endpoints
c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
c.header('Pragma', 'no-cache'); // HTTP/1.0 compat
c.header('Expires', '0');

// Public endpoints
c.header('Cache-Control', 'public, max-age=300');

// Private data (per-user)
c.header('Cache-Control', 'private, max-age=60');
```

**Verdict:** FAIL - Must implement before production

---

### Cross-Origin Headers

**Status:** ✅ PASS

**Current Configuration:**
```typescript
crossOriginEmbedderPolicy: true,
crossOriginOpenerPolicy: true,
crossOriginResourcePolicy: { policy: 'same-origin' },
```

**Rendered Headers:**
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

**Evidence:** `src/api/server.ts` lines 42-44

**Analysis:**
- COEP: Requires explicit opt-in for cross-origin resources
- COOP: Isolates browsing context from cross-origin windows
- CORP: Only same-origin can read resources
- Provides defense against Spectre-like attacks

**Verdict:** PASS

---

### DNS Prefetch Control

**Status:** ✅ PASS

**Current Configuration:**
```typescript
dnsPrefetchControl: { allow: false }
```

**Rendered Header:**
```
X-DNS-Prefetch-Control: off
```

**Evidence:** `src/api/server.ts` line 45

**Analysis:**
- Disables DNS prefetching
- Prevents privacy leakage via DNS queries
- Appropriate for API (no user-facing links)

**Verdict:** PASS

---

### Server Version Disclosure

**Status:** ❌ FAIL - VERSION POTENTIALLY EXPOSED

**Current Behavior:**
- Fastify may expose version in error responses
- Server header may include "Fastify" identifier
- Provides attack surface information to attackers

**Evidence:**
- Error handler in `src/api/server.ts` returns error objects
- No explicit server header removal

**Recommendation:**
```typescript
// Remove server header
server.addHook('onSend', async (request, reply) => {
  reply.removeHeader('Server');
  reply.removeHeader('X-Powered-By');
});
```

**Verdict:** FAIL - Must fix before production

---

## Summary Table

| Header | Status | Priority | Action Required |
|---|---|---|---|
| Content-Security-Policy | ✅ PASS | N/A | None |
| Strict-Transport-Security | ✅ PASS | Low | Submit to HSTS preload list |
| X-Content-Type-Options | ✅ PASS | N/A | None |
| X-Frame-Options | ✅ PASS | N/A | None |
| X-XSS-Protection | ⚠️ WARNING | Medium | Remove or set to 0 |
| Referrer-Policy | ✅ PASS | Low | Consider no-referrer |
| Permissions-Policy | ❌ FAIL | **HIGH** | **Must implement** |
| Cache-Control | ❌ FAIL | **HIGH** | **Must implement** |
| Cross-Origin Headers | ✅ PASS | N/A | None |
| DNS Prefetch Control | ✅ PASS | N/A | None |
| Server Version | ❌ FAIL | **MEDIUM** | **Must remove** |

---

## Required Code Changes

### 1. Add Permissions-Policy Header

**File:** `src/api/server.ts`

**After line 57, add:**
```typescript
    permissionsPolicy: {
      features: {
        geolocation: [],
        microphone: [],
        camera: [],
        payment: [],
        usb: [],
        accelerometer: [],
        gyroscope: [],
        magnetometer: [],
      }
    }
```

---

### 2. Remove Server Version Header

**File:** `src/api/server.ts`

**After buildServer() function, before return statement, add:**
```typescript
  // Remove server identification headers
  server.addHook('onSend', async (request, reply) => {
    reply.removeHeader('Server');
    reply.removeHeader('X-Powered-By');
  });
```

---

### 3. Implement Cache Control Middleware

**File:** `src/api/middleware/cache-control.ts` (new file)

```typescript
import type { Context, Next } from 'hono';

export async function cacheControlSensitive(c: Context, next: Next): Promise<void> {
  await next();
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
}

export async function cacheControlPublic(c: Context, next: Next): Promise<void> {
  await next();
  c.header('Cache-Control', 'public, max-age=300');
}

export async function cacheControlPrivate(c: Context, next: Next): Promise<void> {
  await next();
  c.header('Cache-Control', 'private, max-age=60');
}
```

**Apply to routes:**
- `/v1/postcodes/:postcode/addresses` → cacheControlSensitive
- `/v1/properties/:uprn` → cacheControlSensitive
- `/v1/councils` → cacheControlPublic
- `/v1/collections/:councilId/:uprn` → cacheControlPrivate

---

### 4. Remove X-XSS-Protection (Optional)

**File:** `src/api/server.ts`

**Change line 57:**
```typescript
// Before
xssFilter: true

// After (removes deprecated header)
xssFilter: false
```

---

## Testing Commands

### Verify Headers with curl

```bash
# Check security headers
curl -I https://api.hampshire-bins.example.com/health

# Should include:
# Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
# X-Content-Type-Options: nosniff
# X-Frame-Options: DENY
# Permissions-Policy: geolocation=(), microphone=(), camera=()
# Cross-Origin-Embedder-Policy: require-corp
# Cross-Origin-Opener-Policy: same-origin

# Check cache control on sensitive endpoint
curl -I https://api.hampshire-bins.example.com/v1/postcodes/SO501AA/addresses

# Should include:
# Cache-Control: no-store, no-cache, must-revalidate, max-age=0

# Verify server header removed
curl -I https://api.hampshire-bins.example.com/health | grep -i server

# Should NOT return "Server: " header
```

### Automated Header Scan

```bash
# Using Mozilla Observatory
https://observatory.mozilla.org/analyze/api.hampshire-bins.example.com

# Target Score: A+ (90+)
```

---

## Production Readiness Checklist

- [ ] Permissions-Policy header added
- [ ] Cache-Control configured for all endpoint types
- [ ] Server version header removed
- [ ] X-XSS-Protection removed or set to 0
- [ ] Headers tested with curl
- [ ] Mozilla Observatory scan score: A+ or A
- [ ] HSTS preload submission (optional)
- [ ] Documentation updated

---

## Sign-Off

**Security Headers Status:** REQUIRES FIXES  
**Production Blocker:** YES (3 critical fixes required)  
**Estimated Fix Time:** 2-3 hours  

**Security Engineer:** Amos  
**Date:** 2026-03-25  

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial security headers audit |
