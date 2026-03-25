# ADR-004: Adapter Isolation Model — Process Isolation via Worker Queue

**Status:** Proposed  
**Date:** 2026-03-25  
**Author:** Holden (Lead Architect)  
**Deciders:** Project Team

## Context

The platform executes adapter code that:

- Makes HTTP requests to council websites
- Parses untrusted HTML/JSON responses
- Executes browser automation via Playwright
- May run attacker-controlled JavaScript (in browser context)

Adapters are attack surface. A compromised or buggy adapter must not:

- Access other adapters' data
- Crash the API service
- Exfiltrate secrets
- Consume unbounded resources

## Options Considered

### Option A: In-Process Execution

**Description:** Adapters run directly in API service process.

**Pros:**
- Simple architecture
- Low latency

**Cons:**
- No isolation — adapter crash crashes API
- No resource limits — runaway adapter affects all requests
- Shared memory — secrets accessible to adapter code
- Browser automation blocks event loop

### Option B: Worker Threads (Node.js)

**Description:** Adapters run in worker_threads with shared memory.

**Pros:**
- Some CPU isolation
- Can transfer data via SharedArrayBuffer

**Cons:**
- Shared process — memory limits are process-wide
- No network isolation
- Worker crash doesn't crash main thread, but cleanup is complex
- Browser automation still problematic

### Option C: Child Process per Adapter

**Description:** Each adapter execution spawns a child process.

**Pros:**
- Process isolation (separate memory space)
- Resource limits via OS (ulimit, cgroups)
- Crash isolation

**Cons:**
- Process spawn overhead (~50ms)
- Complex IPC for results
- Doesn't scale well for high-throughput

### Option D: Worker Queue with Dedicated Worker Processes

**Description:** Adapters are jobs in a queue (BullMQ). Dedicated worker processes consume jobs. Each worker handles one adapter at a time.

**Pros:**
- Full process isolation
- Resource limits configurable
- Crash recovery automatic (job retry)
- Horizontal scaling (add workers)
- Observability (job status, duration, failures)
- Rate limiting per adapter

**Cons:**
- More complex architecture
- Added latency (queue + worker)

### Option E: Container per Adapter Execution

**Description:** Each adapter execution runs in a fresh container.

**Pros:**
- Maximum isolation (network namespace, filesystem)
- Reproducible environment
- Container orchestration handles crashes

**Cons:**
- Very high latency (container startup ~1-5s)
- Operational complexity
- Overkill for most adapters

## Decision

**Option D: Worker Queue with Dedicated Worker Processes**, with **Option E (container isolation) reserved for browser automation adapters**.

```
┌─────────────────────────────────────────────────────────────┐
│                    Adapter Isolation Model                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────┐    ┌─────────────┐    ┌──────────────────┐    │
│  │ API      │───>│ Redis Queue │───>│ Worker Process   │    │
│  │ Service  │    │ (BullMQ)    │    │                  │    │
│  └──────────┘    └─────────────┘    │ ┌──────────────┐ │    │
│                                      │ │ Adapter Code │ │    │
│                                      │ │ (sandboxed)  │ │    │
│                                      │ └──────────────┘ │    │
│                                      │        │         │    │
│                                      │        ▼         │    │
│                                      │ ┌──────────────┐ │    │
│                                      │ │ HTTP Client  │ │    │
│                                      │ │ (hardened)   │ │    │
│                                      │ └──────────────┘ │    │
│                                      └──────────────────┘    │
│                                               │               │
│                                               ▼               │
│                                      ┌──────────────────┐    │
│                                      │ Council Website  │    │
│                                      │ (external)       │    │
│                                      └──────────────────┘    │
│                                                               │
│  For browser automation:                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Sandboxed Container                                    │   │
│  │ ┌────────────┐  ┌────────────┐  ┌────────────┐       │   │
│  │ │ Playwright │  │ Chromium   │  │ Adapter    │       │   │
│  │ │ Server     │  │ (headless) │  │ Code       │       │   │
│  │ └────────────┘  └────────────┘  └────────────┘       │   │
│  │ • No network access to internal services              │   │
│  │ • Read-only filesystem (except /tmp)                  │   │
│  │ • Resource limits (CPU, memory, time)                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## Rationale

### Worker Queue (BullMQ)

1. **Decoupling** — API service doesn't execute untrusted code. It enqueues jobs and polls for results.

2. **Resource Limits** — Worker processes have configurable memory limits (`--max-old-space-size`), CPU affinity, and execution timeouts.

3. **Crash Recovery** — If a worker crashes, BullMQ retries the job on another worker. API service is unaffected.

4. **Observability** — Job status, duration, retry count, error messages are queryable. Dashboards show adapter health.

5. **Rate Limiting** — Queue supports rate limits per adapter (don't hammer council sites).

6. **Horizontal Scaling** — Add worker instances to increase throughput. No code changes.

### Container Isolation for Browser Automation

1. **JavaScript Execution** — Playwright executes JavaScript from council websites. This is attacker-controlled code.

2. **Network Namespace** — Container cannot access internal services (Redis, PostgreSQL, API). Only allowlisted council domains.

3. **Filesystem Isolation** — Read-only filesystem prevents persistence of malware.

4. **Resource Limits** — Container memory/CPU limits prevent resource exhaustion.

5. **Timeout Enforcement** — Container is killed after timeout, releasing all resources.

### Worker Process Hardening

```typescript
// Worker configuration
const workerConfig = {
  // Memory limit
  nodeOptions: '--max-old-space-size=512',
  
  // Execution timeout
  jobTimeout: 60_000, // 60 seconds
  
  // Retry policy
  maxRetries: 3,
  backoffType: 'exponential',
  
  // Concurrency
  concurrency: 5, // 5 jobs per worker
};
```

## Security Implications

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Adapter code executes malicious payload | Process isolation; no access to secrets |
| Adapter crashes exhaustively | Auto-restart worker; job retry logic |
| Adapter consumes unbounded memory | `--max-old-space-size` limit |
| Adapter consumes unbounded CPU | Job timeout; circuit breaker |
| Adapter makes requests to internal services | Network isolation (container for browser adapters) |
| Browser executes malicious JS | Container sandbox; no network to internals |
| Adapter exfiltrates data to external server | Egress filtering (future); audit logging |

### HTTP Client Hardening

```typescript
// Hardened HTTP client for adapters
const adapterHttpClient = {
  // Prevent SSRF
  allowedHostPatterns: [
    /\.gov\.uk$/,
    /\.council\.gov\.uk$/,
  ],
  
  // Block internal ranges
  blockedIpRanges: [
    '10.0.0.0/8',
    '172.16.0.0/12',
    '192.168.0.0/16',
    '169.254.0.0/16',
    '127.0.0.0/8',
  ],
  
  // Response limits
  maxResponseSize: 10 * 1024 * 1024, // 10MB
  timeout: 30_000, // 30 seconds
  
  // TLS verification
  rejectUnauthorized: true,
};
```

### Browser Automation Sandbox

```yaml
# Container security context
securityContext:
  runAsNonRoot: true
  runAsUser: 1000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop: [ALL]

resources:
  limits:
    memory: "1Gi"
    cpu: "1"
  requests:
    memory: "512Mi"
    cpu: "500m"
```

### Evidence Capture

Every adapter execution captures:

1. **Request/Response logs** — HTTP requests made, responses received
2. **Screenshots** (browser) — Visual evidence of page state
3. **HTML snapshots** — Raw HTML for parsing verification
4. **Execution metadata** — Duration, memory usage, warnings

Evidence is stored in blob storage with immutable retention policy.

## Consequences

### Positive

- API service cannot be crashed by adapter code
- Resource exhaustion is contained
- Browser automation is properly sandboxed
- Observable job queues aid debugging
- Horizontal scaling is straightforward
- Evidence capture supports audit requirements

### Negative

- Added latency (queue + worker)
- More complex deployment (API + workers)
- Container infrastructure for browser adapters
- Job queue adds operational surface area

### Neutral

- BullMQ is well-documented and production-proven
- Playwright sandbox is a known pattern
- Worker process model is familiar to Node.js developers
