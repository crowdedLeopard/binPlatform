# ADR-003: Storage Architecture — PostgreSQL + Redis + Blob

**Status:** Proposed  
**Date:** 2026-03-25  
**Author:** Holden (Lead Architect)  
**Deciders:** Project Team

## Context

The platform requires persistent storage for:

- **Relational data:** Councils, properties, collection schedules, acquisition attempts
- **Caching:** API response caching, rate limit counters, session data
- **Evidence:** Raw HTML, screenshots, JSON responses from adapters (audit trail)
- **Queues:** Acquisition job queue (may use Redis or separate service)

Storage choices impact data integrity, query performance, operational complexity, and security posture.

## Options Considered

### Primary Database

#### Option A: PostgreSQL

**Pros:**
- ACID transactions for data integrity
- Rich query capabilities (JSON, full-text search)
- Excellent TypeScript support via Drizzle/Prisma
- Azure Flexible Server provides managed hosting
- Row-level security for multi-tenant patterns
- Mature security model (TLS, auth, encryption at rest)

**Cons:**
- Requires managed service or operational expertise
- Connection pooling needed at scale

#### Option B: SQLite

**Pros:**
- Zero operational overhead
- Single file, easy backup

**Cons:**
- Single-writer limitation prevents concurrent workers
- No network access (can't scale horizontally)
- Not suitable for production multi-instance deployment

### Caching Layer

#### Option A: Redis

**Pros:**
- Industry standard for caching and rate limiting
- Pub/sub for real-time notifications
- BullMQ integration for job queues
- Azure Cache for Redis provides managed hosting

**Cons:**
- Additional infrastructure component
- Memory costs for large cache sizes

#### Option B: In-Memory (per-process)

**Pros:**
- No additional infrastructure

**Cons:**
- Cache inconsistency across instances
- Lost on restart
- Rate limits not enforced across instances

### Evidence Storage

#### Option A: Azure Blob Storage / S3

**Pros:**
- Designed for large binary objects
- Immutable storage tiers available
- Low cost for cold storage
- Separate security boundary from application data

**Cons:**
- Additional SDK and configuration

#### Option B: PostgreSQL BYTEA

**Pros:**
- Single database for everything

**Cons:**
- Database bloat
- Poor performance for large blobs
- Backups become huge

## Decision

**PostgreSQL + Redis + Azure Blob Storage** as a three-tier storage architecture.

```
┌─────────────────────────────────────────────────────────────┐
│                     Storage Architecture                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ PostgreSQL  │  │    Redis    │  │  Blob Storage       │  │
│  │             │  │             │  │                     │  │
│  │ • Councils  │  │ • API Cache │  │ • HTML Evidence     │  │
│  │ • Properties│  │ • Rate Lim  │  │ • Screenshots       │  │
│  │ • Events    │  │ • Sessions  │  │ • JSON Responses    │  │
│  │ • Attempts  │  │ • Queues    │  │ • PDF Calendars     │  │
│  │ • Audit     │  │             │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Data | Retention | Sensitivity |
|-----------|------|-----------|-------------|
| PostgreSQL | Relational domain data, audit logs, security events | Permanent (with archival) | Internal to Restricted |
| Redis | Ephemeral cache, rate limits, job queues | TTL-based (hours to days) | Internal |
| Blob Storage | Evidence artifacts for audit/debugging | 90 days (configurable) | Restricted |

## Rationale

### PostgreSQL for Relational Data

1. **ACID Compliance** — Collection schedules must be consistent. No partial writes or phantom reads.

2. **Query Power** — Join properties to events, filter by council, aggregate by date range. PostgreSQL excels at this.

3. **Drizzle ORM** — Type-safe queries prevent SQL injection. Schema migrations are version-controlled.

4. **Row-Level Security** — Future multi-tenancy (per-council admin access) can use RLS policies.

5. **Azure Flexible Server** — Managed PostgreSQL with TLS, private endpoints, automated backups, encryption at rest.

### Redis for Caching and Queues

1. **API Response Cache** — Cache collection schedules per property. Invalidate on acquisition.

2. **Rate Limiting** — Redis-backed rate limiter ensures limits enforced across all API instances.

3. **BullMQ** — Redis-backed job queue for acquisition workers. Reliable, observable, with retry logic.

4. **Session Storage** — Admin sessions stored in Redis, not cookies (shorter attack window).

### Blob Storage for Evidence

1. **Audit Trail** — Every adapter acquisition captures raw HTML/JSON/screenshots. Stored immutably.

2. **Cost Efficiency** — Blob storage is cheap for large objects. Cool tier for older evidence.

3. **Security Isolation** — Evidence store is separate from application database. Different access controls.

4. **Compliance** — Immutable storage tier prevents evidence tampering.

## Security Implications

### PostgreSQL Security

| Control | Implementation |
|---------|----------------|
| Encryption at rest | Azure-managed encryption (AES-256) |
| Encryption in transit | TLS 1.2+ required |
| Authentication | Azure AD authentication for admin; connection string for app |
| Network isolation | Private endpoint within VNet |
| Connection pooling | PgBouncer or Drizzle pool; prevents connection exhaustion DoS |
| Query safety | Drizzle parameterised queries prevent SQL injection |
| Audit logging | PostgreSQL audit extension enabled |

### Redis Security

| Control | Implementation |
|---------|----------------|
| Encryption in transit | TLS required |
| Authentication | Redis AUTH with rotated password |
| Network isolation | Private endpoint |
| Data sensitivity | No PII in cache keys; values are non-sensitive |
| Memory limits | Configured max memory with eviction policy |

### Blob Storage Security

| Control | Implementation |
|---------|----------------|
| Encryption at rest | Azure-managed or customer-managed keys |
| Access control | SAS tokens with short expiry; service principal for app |
| Immutability | Immutable blob policy for evidence |
| Network isolation | Private endpoint; no public access |
| Retention policy | 90-day retention; auto-delete old evidence |

### Data Classification by Storage

| Classification | PostgreSQL | Redis | Blob |
|---------------|------------|-------|------|
| Public | Council metadata | Response cache | — |
| Internal | Property addresses, events | Rate limit state | — |
| Sensitive | — | — | Raw HTML (may contain addresses) |
| Restricted | Audit logs, security events | — | Screenshots, full page captures |

## Consequences

### Positive

- Clear separation of concerns (relational, cache, blob)
- Each storage optimised for its use case
- Evidence audit trail is immutable and isolated
- Scalable caching layer
- Strong security posture with private endpoints

### Negative

- Three infrastructure components to manage
- More complex backup strategy
- Cross-storage transactions impossible (eventual consistency for evidence)

### Neutral

- Standard modern architecture pattern
- Well-documented Azure services
- Team familiarity with PostgreSQL/Redis expected
