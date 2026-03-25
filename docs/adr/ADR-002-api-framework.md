# ADR-002: API Framework — Express + Hono

**Status:** Proposed  
**Date:** 2026-03-25  
**Author:** Holden (Lead Architect)  
**Deciders:** Project Team

## Context

The platform requires an HTTP API framework for:

- Public API serving collection schedules
- Admin API for operations and monitoring
- Webhook receivers (future: council push notifications)
- Health check and observability endpoints

The framework choice impacts request handling performance, middleware ecosystem, security defaults, and developer experience.

## Options Considered

### Option A: Express.js

**Pros:**
- De facto Node.js standard, massive ecosystem
- Extensive middleware library (helmet, cors, rate-limit)
- Well-understood security model
- Excellent documentation and community support

**Cons:**
- Callback-based API (though async wrappers exist)
- Larger attack surface due to age and middleware sprawl
- Performance not optimised for edge/serverless

### Option B: Hono

**Pros:**
- Modern, TypeScript-first design
- Tiny bundle size, fast performance
- Built-in middleware for common patterns
- Edge runtime compatible (Cloudflare, Deno, Bun, Node)
- First-class Zod integration for validation

**Cons:**
- Younger project, smaller ecosystem
- Fewer battle-tested production deployments
- Some Express middleware not directly compatible

### Option C: Fastify

**Pros:**
- High performance (benchmarks faster than Express)
- Schema-based validation built-in
- Plugin architecture

**Cons:**
- Different plugin model requires learning curve
- Schema system overlaps with Zod (redundant)
- Less TypeScript-native than Hono

### Option D: NestJS

**Pros:**
- Full framework with dependency injection
- Built-in support for many patterns

**Cons:**
- Heavy abstraction, decorator-based
- Overkill for focused API service
- Harder to reason about request flow (security implication)

## Decision

**Hono as primary framework**, with Express-compatible middleware where needed via `@hono/node-server`.

```typescript
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'

const app = new Hono()
  .use('*', secureHeaders())
  .use('*', cors({ origin: ['https://approved-domain.com'] }))
```

## Rationale

1. **TypeScript-First** — Hono's types are excellent. Route handlers, middleware, and validators compose with full type inference.

2. **Security Defaults** — `secureHeaders()` middleware sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, etc. by default.

3. **Zod Integration** — `@hono/zod-validator` validates request bodies and parameters at the edge of handlers, preventing invalid data from entering business logic.

4. **Performance** — Hono's trie-based router is faster than Express. Lower latency for public API.

5. **Small Surface** — Minimal framework means fewer dependencies, fewer CVEs to track.

6. **Edge Compatibility** — If we deploy to Azure Container Apps or edge workers later, Hono runs anywhere.

7. **Express Escape Hatch** — `@hono/node-server` allows using battle-tested Express middleware (helmet, express-rate-limit) when Hono equivalents are immature.

## Security Implications

### Framework Security Features

| Feature | Implementation |
|---------|----------------|
| Security headers | `hono/secure-headers` middleware (CSP, HSTS, X-Frame-Options) |
| CORS | Explicit `hono/cors` with allowed origins whitelist |
| Request validation | Zod schemas via `@hono/zod-validator` |
| Rate limiting | `hono-rate-limiter` with Redis backing |
| Request size limits | Configure in `@hono/node-server` |
| Timeout | Implement via middleware wrapper |

### Security Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Middleware ordering | Document and test middleware order; security middleware first |
| Route parameter injection | Zod validation on all params |
| Path traversal | Hono router is strict; no path normalisation vulnerabilities |
| Missing auth on routes | Auth middleware at app level; explicit `noAuth` marker for public routes |
| Error information leakage | Custom error handler; production mode hides stack traces |

### Comparison to Express Security Posture

| Concern | Express | Hono |
|---------|---------|------|
| Default headers | None (requires helmet) | `secureHeaders()` built-in |
| Type safety | Weak (`any` everywhere) | Strong (full type inference) |
| Validation | Manual or ajv | Native Zod integration |
| CVE history | Many (older, larger surface) | Few (young, small surface) |

## Consequences

### Positive

- Modern, type-safe request handling
- Built-in security headers
- Excellent Zod integration for input validation
- High performance for public API
- Small dependency footprint

### Negative

- Team may need Hono onboarding
- Some Express middleware requires adaptation
- Smaller community for troubleshooting

### Neutral

- Different testing patterns than Express (but well-documented)
- Error handling patterns differ slightly
