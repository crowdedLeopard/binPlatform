# Performance Design Notes — Hampshire Bin Platform

**Version:** 1.0  
**Owner:** Holden (Lead Architect)  
**Last Updated:** 2026-03-25

---

## Overview

This document captures performance characteristics, design decisions, and tuning recommendations for the Hampshire Bin Platform. Target workload is modest (Hampshire-specific, ~580K households), but design supports horizontal scaling for future expansion.

---

## Expected Request Volumes

### Hampshire Market Size

| Metric | Estimate | Notes |
|--------|----------|-------|
| **Total Households** | 760,000 | Census 2021 data |
| **Covered by Platform** | 580,000 (76.3%) | 11 implemented councils |
| **Postponed** | 180,000 (23.7%) | New Forest, Southampton |
| **Unique Postcodes** | ~52,000 | Hampshire postcode prefixes covered |

### Traffic Projections

**Assumptions:**
- 10% penetration Year 1 (conservative)
- Average 1 lookup per user per week
- Peak traffic: Monday 8-10 AM (bin day reminder)

| Phase | Daily Users | Daily Requests | Peak RPS | Notes |
|-------|-------------|----------------|----------|-------|
| **Beta (3 councils)** | 500 | 2,000 | 1-2 | Eastleigh, Fareham, Portsmouth only |
| **Launch (11 councils)** | 5,000 | 20,000 | 10-15 | All implemented councils |
| **Year 1 (10% penetration)** | 58,000 | 230,000 | 100-150 | Steady state |
| **Year 2 (25% penetration)** | 145,000 | 580,000 | 250-350 | Growth scenario |

**Peak-to-Average Ratio:** 5x (Monday mornings vs. off-peak)

---

## Redis Cache TTLs

Caching strategy prioritizes **data freshness** (bin schedules change weekly) while minimizing **upstream load** (respect council rate limits).

### Cache TTLs by Acquisition Method

| Method | Data Type | TTL | Rationale |
|--------|-----------|-----|-----------|
| **API** | Property resolution | 24 hours | Addresses stable |
| **API** | Collection events | 4 hours | Bin schedules change weekly; 4h balances freshness vs. load |
| **API** | Collection services | 24 hours | Bin types rarely change |
| **Browser** | Property resolution | 24 hours | Same as API |
| **Browser** | Collection events | 6 hours | Browser slower; longer TTL reduces load |
| **Browser** | Collection services | 24 hours | Same as API |
| **PDF Calendar** | Property resolution | 24 hours | Same as API |
| **PDF Calendar** | Collection events | 24 hours | PDFs are static monthly calendars |
| **PDF Calendar** | Collection services | 24 hours | Same as API |

### Cache Keys

```
# Property resolution
cache:property:{postcode}:{houseIdentifier} → PropertyResult (24h)

# Collection events
cache:collections:{propertyId} → CollectionEventResult[] (4-24h depending on method)

# Collection services
cache:services:{propertyId} → CollectionServiceResult[] (24h)

# Council metadata (rarely changes)
cache:council:{councilId} → CouncilMetadata (5 minutes)

# Health status
cache:health:{councilId} → HealthStatus (1 minute)
```

### Cache Warming

**Strategy:** Lazy population (cache on first request, not proactive).

**Rationale:**
- 52,000 unique postcodes × 11 councils = 572,000 possible cache keys
- Proactive warming would overload councils
- Cache hit rate expected >80% (users check same postcodes weekly)

**Exception:** Canary postcodes warmed every 5 minutes for synthetic monitoring.

---

## Adapter Concurrency Limits

Browser automation is resource-intensive. Limit concurrent browser sessions to prevent exhaustion.

### Concurrency by Adapter Type

| Adapter Type | Max Concurrent | Per-Adapter | Total Platform | Rationale |
|--------------|----------------|-------------|----------------|-----------|
| **API** | 50 | 50 per council | 500 | API calls lightweight; council rate limits respected |
| **Browser** | 5 | 5 per council | 40 | Playwright headless consumes 200-500MB per session |
| **PDF Calendar** | 10 | 10 per council | 10 | PDF download + parsing is CPU-bound |

**Implementation:** BullMQ worker concurrency limits per queue.

```typescript
// API adapter queue
new Worker('adapter-api-queue', processorFn, { concurrency: 50 });

// Browser adapter queue
new Worker('adapter-browser-queue', processorFn, { concurrency: 5 });

// PDF adapter queue
new Worker('adapter-pdf-queue', processorFn, { concurrency: 10 });
```

### Browser Session Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ Request received                                            │
│   ↓                                                         │
│ Check Redis cache (4-6h TTL)                                │
│   ├─ Hit → Return cached data (p50: 50ms)                   │
│   └─ Miss → Enqueue job in BullMQ                           │
│       ↓                                                     │
│ Worker acquires job (wait time: p95 <5s)                    │
│   ↓                                                         │
│ Launch Playwright browser (2-3s)                            │
│   ↓                                                         │
│ Navigate to council website (5-10s)                         │
│   ↓                                                         │
│ Extract data + capture evidence (2-5s)                      │
│   ↓                                                         │
│ Close browser (1s)                                          │
│   ↓                                                         │
│ Store result in cache (4-6h TTL)                            │
│   ↓                                                         │
│ Return result to client (total: p95 ~20s)                   │
└─────────────────────────────────────────────────────────────┘
```

**Total duration:**
- **Cache hit:** p50 <200ms, p95 <500ms
- **Cache miss (browser):** p50 15s, p95 25s, p99 30s (timeout)
- **Cache miss (API):** p50 2s, p95 5s, p99 10s

---

## Database Connection Pool Sizing

PostgreSQL connection pooling prevents exhaustion and optimizes resource usage.

### Connection Pool Formula

```
connections_per_instance = (CPU_cores × 2) + effective_spindle_count
```

**For Azure Database for PostgreSQL (General Purpose, 4 vCores):**
```
connections = (4 × 2) + 1 = 9 connections per API instance
```

### Configuration

**API Service (per instance):**
- `min_pool_size: 2` — Always-on connections
- `max_pool_size: 9` — Maximum connections
- `idle_timeout: 30s` — Close idle connections after 30s
- `connection_timeout: 10s` — Fail fast if pool exhausted

**Worker Service (per instance):**
- `min_pool_size: 1` — Workers less frequent DB access
- `max_pool_size: 5` — Lower limit (workers use more CPU for parsing)
- `idle_timeout: 60s` — Workers can tolerate longer idle
- `connection_timeout: 10s` — Same timeout

### Total Connection Budget

**Azure PostgreSQL Limits:**
- **Basic Tier:** Max 50 connections
- **General Purpose (4 vCores):** Max 200 connections
- **General Purpose (8 vCores):** Max 400 connections

**Recommended Tier:** General Purpose, 4 vCores

**Connection Allocation:**
- API instances: 3 × 9 = 27 connections
- Worker instances: 2 × 5 = 10 connections
- Admin service: 1 × 5 = 5 connections
- Monitoring/migrations: 5 connections
- **Total:** 47 connections (well under 200 limit)

**Headroom:** 153 connections (76.5%) for scaling

---

## API Response Time SLOs

Service Level Objectives for response times by operation type.

### SLO Targets

| Operation | Cache Status | p50 | p95 | p99 | Timeout |
|-----------|-------------|-----|-----|-----|---------|
| **GET /councils** | Cached (5min) | <50ms | <200ms | <500ms | 5s |
| **GET /councils/:id** | Cached (5min) | <50ms | <200ms | <500ms | 5s |
| **GET /postcodes/:pc/addresses** | Hit (24h) | <100ms | <500ms | <1s | 10s |
| **GET /postcodes/:pc/addresses** | Miss (API adapter) | <1s | <3s | <5s | 10s |
| **GET /postcodes/:pc/addresses** | Miss (browser adapter) | <10s | <20s | <30s | 30s |
| **GET /properties/:id/collections** | Hit (4-6h) | <100ms | <500ms | <1s | 10s |
| **GET /properties/:id/collections** | Miss (API adapter) | <1s | <3s | <5s | 10s |
| **GET /properties/:id/collections** | Miss (browser adapter) | <10s | <20s | <30s | 30s |

### Beta SLO (3 councils, API-based)

**Realistic targets:**
- p50: <1s (most requests cached)
- p95: <3s (cache misses hit API)
- p99: <5s (slow API responses or cold cache)

**Acceptable:** p95 <5s for beta phase.

### Full Launch SLO (11 councils, 8 browser adapters)

**Realistic targets:**
- p50: <2s (cache hit rate ~80%)
- p95: <10s (browser cache misses)
- p99: <25s (slow browser, large pages)

**Goal:** p95 <5s for API councils, p95 <15s for browser councils.

---

## Scaling Strategy

### Vertical Scaling (Scale Up)

**When to use:**
- Single-instance workload too heavy
- Database CPU/memory constrained
- Redis memory exhausted

**Limits:**
- Azure Container Apps: Up to 4 vCPUs, 8GB RAM per instance
- Azure PostgreSQL: Up to 64 vCores, 432 GB RAM (General Purpose)
- Azure Redis: Up to 120 GB memory (Premium tier)

**Cost:** Higher tier pricing (linear scaling).

### Horizontal Scaling (Scale Out)

**When to use:**
- Request volume exceeds single-instance capacity
- Need higher availability (multi-instance)
- Geographic distribution (future)

**Implementation:**
- **API service:** Stateless, autoscale based on CPU (target: 70%)
- **Worker service:** Scale based on queue depth (target: <100 jobs pending)
- **Database:** Read replicas for read-heavy workloads (not needed initially)
- **Redis:** Redis Cluster for horizontal sharding (if >100GB memory needed)

**Autoscaling Rules (Azure Container Apps):**

```yaml
# API service
scale:
  minReplicas: 1  # Beta: 1, Production: 3
  maxReplicas: 10
  rules:
    - type: cpu
      value: 70  # Scale up at 70% CPU
    - type: http
      value: 100  # Scale up at 100 concurrent requests

# Worker service
scale:
  minReplicas: 1  # Beta: 1, Production: 2
  maxReplicas: 5
  rules:
    - type: queue-depth
      value: 50  # Scale up when >50 jobs pending
```

### Scaling Decision Matrix

| Metric | Current | Action | Implementation |
|--------|---------|--------|----------------|
| **API CPU** | <50% | No action | Adequate capacity |
| **API CPU** | 50-70% | Monitor | Warning threshold |
| **API CPU** | >70% | Scale out | Add 1 replica |
| **Worker CPU** | <70% | No action | Adequate capacity |
| **Worker CPU** | >70% | Scale out | Add 1 replica |
| **Queue depth** | <50 | No action | Processing healthy |
| **Queue depth** | 50-100 | Monitor | Warning threshold |
| **Queue depth** | >100 | Scale out | Add worker replica |
| **DB CPU** | <50% | No action | Adequate capacity |
| **DB CPU** | >70% | Scale up | Increase vCores |
| **Redis memory** | <80% | No action | Adequate capacity |
| **Redis memory** | >80% | Scale up | Increase tier or implement eviction |

---

## Caching Effectiveness

### Cache Hit Rate Targets

| Endpoint | Target Hit Rate | Rationale |
|----------|----------------|-----------|
| `/councils` | 99% | Metadata rarely changes |
| `/councils/:id/health` | 50% | 1-minute TTL, frequent checks |
| `/postcodes/:pc/addresses` | 80% | Users check same postcodes weekly |
| `/properties/:id/collections` | 85% | 4-6h TTL, weekly collection checks |

### Cache Eviction Strategy

**Redis eviction policy:** `volatile-lru` (Least Recently Used among keys with TTL)

**Rationale:**
- All cache keys have TTL (no infinite keys)
- LRU evicts least-used data first
- Protects frequently-accessed data (councils metadata)

### Cache Memory Sizing

**Estimated cache entry sizes:**
- Council metadata: ~1 KB per council × 13 = 13 KB
- Property result: ~500 bytes per property
- Collection events: ~2 KB per property (5-10 events)

**Memory calculation (Year 1, 10% penetration):**
```
58,000 daily users × 2 KB (property + collections) = 116 MB
+ 20% overhead = 140 MB
```

**Recommended Redis size:**
- **Beta:** 256 MB (Basic tier)
- **Year 1:** 1 GB (Standard tier)
- **Year 2:** 2.5 GB (Standard tier)

**Note:** Redis is overprovisioned (10x buffer) to handle spikes and prevent evictions.

---

## Performance Monitoring

### Key Metrics

| Metric | Dashboard | Alert Threshold | Action |
|--------|-----------|-----------------|--------|
| **API response time (p95)** | Grafana | >5s | Investigate slow endpoints |
| **Cache hit rate** | Grafana | <70% | Review TTLs, check evictions |
| **Queue depth** | Grafana | >100 | Scale workers |
| **Worker processing time (p95)** | Grafana | >30s | Investigate slow adapters |
| **Database CPU** | Azure Portal | >70% | Scale up or optimize queries |
| **Redis memory** | Azure Portal | >80% | Scale up or tune eviction |
| **Error rate** | Grafana | >5% | Kill switch review |

### Prometheus Metrics

```promql
# API response time histogram
http_request_duration_seconds{endpoint="/v1/properties/:id/collections"}

# Cache hit rate
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Queue depth (BullMQ)
adapter_queue_depth{queue="browser"}

# Worker processing time
adapter_acquisition_duration_seconds{council_id="basingstoke-deane"}

# Database connection pool usage
db_pool_connections_active / db_pool_connections_max

# Error rate by endpoint
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

### Grafana Dashboards

**Planned (Month 1):**
1. **API Performance Dashboard**
   - Request rate (RPS)
   - Response time (p50, p95, p99) by endpoint
   - Error rate by status code
   - Cache hit rate

2. **Worker Performance Dashboard**
   - Queue depth by adapter type
   - Worker processing time by council
   - Concurrency utilization (active workers / max workers)
   - Adapter success/failure rate

3. **Infrastructure Dashboard**
   - Database CPU, memory, connections
   - Redis memory, hit rate, evictions
   - Container Apps CPU, memory, replicas
   - Network egress by council

---

## Load Testing Plan

### Test Scenarios

**Scenario 1: Cache Hit (Best Case)**
- 1,000 requests/second to `/v1/properties/:id/collections`
- 100% cache hit rate
- Target: p95 <200ms

**Scenario 2: Cache Miss API (Average Case)**
- 100 requests/second to `/v1/properties/:id/collections`
- 0% cache hit rate, API adapters only
- Target: p95 <3s

**Scenario 3: Cache Miss Browser (Worst Case)**
- 10 requests/second to `/v1/properties/:id/collections`
- 0% cache hit rate, browser adapters only
- Target: p95 <20s

**Scenario 4: Spike (Stress Test)**
- Ramp from 0 to 500 RPS over 5 minutes
- Hold 500 RPS for 10 minutes
- Ramp down to 0 over 2 minutes
- Target: No errors, autoscaling triggers correctly

### Load Testing Tools

**Tool:** Artillery (Node.js-based HTTP load testing)

```yaml
# artillery-config.yml
config:
  target: "https://api.hampshirebins.uk"
  phases:
    - duration: 60
      arrivalRate: 10  # 10 RPS
    - duration: 60
      arrivalRate: 50  # Ramp to 50 RPS
    - duration: 300
      arrivalRate: 100  # Sustained 100 RPS
scenarios:
  - name: "Cache hit"
    flow:
      - get:
          url: "/v1/properties/{{ propertyId }}/collections"
          headers:
            X-Api-Key: "{{ apiKey }}"
```

**When to run:** Month 2 (after Redis/DB wiring complete)

---

## Performance Tuning Recommendations

### Quick Wins (Week 1-2)

1. **Enable Redis caching** — Expected 5-10x response time improvement on cache hits
2. **Database connection pooling** — Prevent connection exhaustion
3. **Response compression (gzip)** — Reduce egress bandwidth 60-80%

### Medium-Term (Month 1-2)

1. **Query optimization** — Add indexes for property lookup by UPRN, postcode
2. **Partial response (field filtering)** — Allow clients to request subset of fields
3. **HTTP/2** — Multiplexing reduces connection overhead
4. **CDN (Azure Front Door)** — Cache static assets, reduce latency for distant users

### Long-Term (Month 3+)

1. **GraphQL endpoint** — Allow clients to fetch exactly what they need (reduce over-fetching)
2. **Database read replicas** — Offload read traffic from primary (if needed)
3. **Redis Cluster** — Horizontal sharding for >100GB cache
4. **Geographic distribution** — Multi-region deployment (UK South + UK West)

---

## Cost Optimization

### Current Infrastructure Costs (Estimated)

**Beta Phase (3 councils, low traffic):**
- Azure Container Apps: 1 API instance + 1 worker → £50/month
- Azure Database for PostgreSQL (Basic, 1 vCore) → £15/month
- Azure Redis (Basic, 256 MB) → £10/month
- Azure Blob Storage (1 GB evidence) → £0.50/month
- **Total:** ~£75/month

**Year 1 (11 councils, 10% penetration):**
- Azure Container Apps: 3 API + 2 workers → £200/month
- Azure Database for PostgreSQL (General Purpose, 4 vCores) → £150/month
- Azure Redis (Standard, 1 GB) → £50/month
- Azure Blob Storage (50 GB evidence) → £5/month
- Azure Front Door (CDN, 100 GB egress) → £50/month
- **Total:** ~£455/month (~£5,500/year)

### Cost Per Request

**Year 1:**
- 230,000 requests/day × 365 days = 84M requests/year
- £5,500/year ÷ 84M requests = **£0.000065 per request** (~0.0065p)

**Revenue Model (if monetized):**
- Free tier: 500 requests/month (covers casual users)
- Developer tier: £5/month (10,000 requests) → £0.0005 per request
- Production tier: £50/month (100,000 requests) → £0.0005 per request
- **Margin:** 7-8x cost (healthy SaaS margin)

---

## Disaster Recovery Performance

### Recovery Time Objective (RTO)

**Target:** <1 hour from incident detection to service restored

**Breakdown:**
- Incident detection: <5 minutes (automated monitoring)
- Triage and decision: 15 minutes (on-call response)
- Restore from backup (if DB corruption): 30 minutes (Azure PITR)
- Validation and smoke tests: 10 minutes

### Recovery Point Objective (RPO)

**Target:** <5 minutes data loss

**Implementation:**
- PostgreSQL: Continuous backup with PITR (1-second granularity)
- Redis: No persistence required (cache only, can rebuild)
- Evidence: Azure Blob with geo-redundant storage (GRS) or zone-redundant (ZRS)

---

## References

- **Architecture Diagram:** `docs/architecture.md`
- **ADR-003: Storage Architecture:** `docs/adr/ADR-003-storage-architecture.md`
- **ADR-006: Confidence Scoring:** `docs/adr/ADR-006-confidence-scoring.md`
- **Platform Status:** `docs/platform-status.md`
- **Monitoring Runbook:** `docs/runbooks/synthetic-monitoring.md`

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Holden | Initial performance design notes |
