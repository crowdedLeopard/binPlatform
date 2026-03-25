# ADR-001: Language Choice — TypeScript

**Status:** Proposed  
**Date:** 2026-03-25  
**Author:** Holden (Lead Architect)  
**Deciders:** Project Team

## Context

The Hampshire Bin Collection Data Platform requires a primary implementation language for:

- API service handling public requests
- Background workers executing adapter code
- 13+ council-specific adapters (scraping, API calls, browser automation)
- Shared domain model and validation logic
- Admin service for operations

The choice impacts type safety, security posture, developer velocity, and long-term maintainability.

## Options Considered

### Option A: TypeScript (Node.js)

**Pros:**
- Strong static typing with `strict` mode prevents runtime type errors
- Native Playwright support — browser automation is a TypeScript-first library
- Single language across API, workers, and adapters
- Rich ecosystem: Zod (validation), Drizzle (ORM), pino (logging), BullMQ (queues)
- Excellent async/await support for I/O-heavy adapter work
- npm audit, Snyk, socket.dev provide mature dependency security scanning
- Wide developer familiarity accelerates adapter authoring

**Cons:**
- Node.js single-threaded event loop requires careful worker isolation
- JavaScript prototype pollution vulnerabilities require vigilance
- Less mature than Python for data science (not required here)

### Option B: Python (3.11+)

**Pros:**
- FastAPI provides excellent auto-generated OpenAPI docs
- Strong data science ecosystem (if ML parsing needed — it's not)
- Type hints with mypy/pyright for static analysis
- Playwright has Python bindings

**Cons:**
- Type hints are not enforced at runtime by default
- GIL limits true parallelism (workers would need multiprocessing)
- Async ecosystem less mature than Node.js
- Two languages if we ever add a frontend (TypeScript anyway)
- Poetry/pip dependency resolution less deterministic than npm

### Option C: Go

**Pros:**
- Compiled binary with excellent performance
- Strong concurrency primitives (goroutines)
- Memory-safe by default

**Cons:**
- No Playwright support — browser automation would require external process
- Less expressive type system (no generics until recently)
- Smaller web service ecosystem
- Higher barrier for adapter authors

## Decision

**TypeScript with strict mode enabled.**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true
  }
}
```

## Rationale

1. **Type Safety at Contract Boundaries** — Every adapter must implement `CouncilAdapter` interface. TypeScript catches violations at compile time.

2. **Playwright Native** — Browser automation adapters (likely 6+ councils) benefit from first-class TypeScript support, not language bindings.

3. **Single Language** — API handlers, worker jobs, adapter code, and domain models share types. No JSON serialisation boundary bugs.

4. **Security Posture** — TypeScript's type system prevents many injection vulnerabilities (no `eval`, typed SQL queries with Drizzle, validated input with Zod). Dependency security tooling is mature.

5. **Async Excellence** — Node.js event loop is ideal for I/O-bound adapter work (HTTP requests, browser automation). We're not CPU-bound.

6. **Adapter Author Velocity** — TypeScript is widely known. Onboarding contributors to write council adapters is faster than Python or Go.

## Security Implications

### Mitigations Required

| Risk | Mitigation |
|------|------------|
| Prototype pollution | Enable `--frozen-intrinsics` in Node.js; use `Object.create(null)` for dictionaries |
| Dependency supply chain | npm audit in CI; socket.dev for typosquatting detection; lockfile integrity |
| Type coercion | `strict` mode + Zod validation at all input boundaries |
| Eval/Function injection | ESLint rules banning `eval`, `Function`, `vm` except in sandboxed workers |
| Node.js memory | Configure `--max-old-space-size`; implement request timeouts |

### Security Advantages

- Compiled TypeScript means no dynamic `require()` at runtime
- Zod schemas provide runtime validation matching TypeScript types
- Drizzle ORM prevents SQL injection via parameterised queries
- Strict null checks prevent undefined reference vulnerabilities

## Consequences

### Positive

- Compile-time type safety across entire codebase
- Single language for all components
- Native Playwright support for browser automation
- Mature security tooling ecosystem

### Negative

- Node.js process model requires explicit worker isolation (addressed in ADR-004)
- JavaScript quirks (NaN, type coercion) require discipline
- Some team members may need TypeScript upskilling

### Neutral

- Build step required (tsc / esbuild)
- Node.js version management (use `.nvmrc`)
