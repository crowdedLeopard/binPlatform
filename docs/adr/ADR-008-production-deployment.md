# ADR-008: Production Deployment Strategy

**Status:** Approved  
**Date:** 2026-03-25  
**Authors:** Holden (Lead Architect), Drummer (DevOps Lead)  
**Decision Owner:** Holden  

---

## Context

Phase 4 requires selecting a production deployment platform for the Hampshire Bin Platform. The application consists of:

1. **API Service** — Hono-based HTTP API (stateless)
2. **Worker Service** — BullMQ workers for adapter execution (stateless, long-running jobs)
3. **PostgreSQL** — Relational database (managed PaaS required)
4. **Redis** — Cache and queue (managed PaaS required)
5. **Blob Storage** — Evidence storage (managed PaaS required)
6. **Browser Automation** — Playwright headless Chrome (resource-intensive)

**Constraints:**
- Azure-first (existing organizational commitment)
- Cost-sensitive (non-profit/public benefit project)
- Low operational overhead (small team, no dedicated ops)
- Scale-to-zero desirable for cost savings during low traffic

**Workload Characteristics:**
- **Traffic:** Bursty (Monday AM peak 5x average)
- **Latency tolerance:** p95 <5s acceptable (not real-time)
- **Compute:** Mixed (lightweight API, heavy browser automation)
- **Availability:** 95% acceptable for beta (99% target for production)

---

## Decision

Deploy to **Azure Container Apps** for compute, with managed PaaS for data services.

**Full Stack:**
1. **Compute:** Azure Container Apps (serverless containers)
2. **Database:** Azure Database for PostgreSQL (General Purpose tier)
3. **Cache/Queue:** Azure Cache for Redis (Standard tier)
4. **Storage:** Azure Blob Storage (Hot tier, LRS)
5. **Secrets:** Azure Key Vault (Standard tier)
6. **Networking:** Azure Virtual Network with private endpoints
7. **Observability:** Azure Monitor + Application Insights
8. **CI/CD:** GitHub Actions → Azure Container Registry → Container Apps

---

## Alternatives Considered

### 1. Azure Kubernetes Service (AKS)

**Pros:**
- Full Kubernetes feature set (advanced scheduling, CRDs, operators)
- Mature ecosystem (Helm charts, operators)
- Maximum control (custom networking, storage drivers)
- Better suited for large-scale microservices (10+ services)

**Cons:**
- **High operational overhead** — cluster management, upgrades, security patching
- **Higher cost** — minimum 2-3 nodes required (~£200/month baseline)
- **Complexity** — overkill for 2-service application
- **Learning curve** — team lacks K8s expertise
- **No scale-to-zero** — always-on nodes

**Rejected:** Too complex and expensive for this workload. AKS makes sense for large platforms (100s of services), not 2-service apps.

---

### 2. Azure App Service (Linux Containers)

**Pros:**
- Simpler than AKS (no cluster management)
- Built-in autoscaling
- Integrated with Azure Monitor
- Supports custom containers

**Cons:**
- **Playwright compatibility uncertain** — headless Chrome requires specific dependencies
- **Less flexible networking** — VNet integration available but more rigid than Container Apps
- **Scaling limits** — per-app scaling (not per-instance)
- **Higher cost** — no scale-to-zero; minimum Basic tier (£50/month) for VNet
- **Less suited for workers** — designed for web apps, not job processors

**Rejected:** Container Apps is newer and purpose-built for this pattern (API + workers). App Service is best for traditional web apps (MVC, server-rendered).

---

### 3. Azure Virtual Machines

**Pros:**
- Maximum control (OS-level access)
- Predictable performance (dedicated resources)
- Supports any workload (no restrictions)

**Cons:**
- **Highest operational overhead** — OS patching, security hardening, VM management
- **No autoscaling** (without VMSS + custom scripts)
- **No scale-to-zero** — always-on VMs
- **Higher cost** — minimum 1 VM (~£50/month) for 2-4 vCPU
- **Undifferentiated heavy lifting** — team spends time on infrastructure, not product

**Rejected:** VMs are lowest level of abstraction. Only use when PaaS cannot meet requirements (not the case here).

---

### 4. Azure Functions (Consumption Plan)

**Pros:**
- True serverless (scale-to-zero, pay-per-execution)
- Very low cost for bursty workloads
- Auto-scaling built-in
- Integrated monitoring

**Cons:**
- **Playwright incompatible** — Functions runtime does not support headless Chrome (no GPU, limited dependencies)
- **10-minute execution limit** — too short for browser automation (can take 20-30s per property)
- **Cold start latency** — first request after scale-to-zero can take 5-10s (unacceptable for API)
- **Limited networking** — private endpoints require Premium plan (expensive)

**Rejected:** Functions are excellent for event-driven workloads (blob triggers, queue triggers), but not suitable for long-running browser automation or synchronous HTTP APIs with <2s SLO.

---

### 5. Self-Hosted (Docker Compose on VPS)

**Pros:**
- Full control
- Low cost (£10-20/month VPS)
- Simple deployment (docker-compose up)

**Cons:**
- **No high availability** — single point of failure
- **Manual scaling** — no autoscaling
- **No managed backups** — DIY disaster recovery
- **Security responsibility** — team must patch OS, Docker, etc.
- **No SLA** — VPS provider SLA typically 99% (36 hours downtime/year)

**Rejected:** Acceptable for hobby projects, but not production services. Lack of HA and manual operations are deal-breakers.

---

## Rationale

### Why Azure Container Apps?

**1. Right-Sized Abstraction**

Container Apps sits between AKS (too complex) and App Service (too rigid):
- Containerized apps (full control over runtime)
- Managed infrastructure (no cluster management)
- Scale-to-zero (cost savings)
- Event-driven autoscaling (queue depth, HTTP, CPU)

**2. Cost-Effective**

- **Scale-to-zero:** During off-peak (midnight-6 AM), scale to 0 replicas → £0 compute cost
- **Pay-per-second:** Only pay for active container time (not idle VMs)
- **Estimated cost:** £50-200/month (vs. £200+ for AKS, £50-150 for App Service)

**3. Playwright Support**

- **Custom base image:** Can use `mcr.microsoft.com/playwright:focal` as base
- **Full Debian environment:** Playwright dependencies (Chromium, fonts, etc.) available
- **No GPU restrictions:** Container Apps supports headless Chrome (unlike Functions)

**4. Integrated Monitoring**

- **Native Azure Monitor integration:** Logs, metrics, alerts
- **Application Insights auto-instrumentation:** Distributed tracing, performance monitoring
- **Prometheus scraping:** Can expose /metrics endpoint for Grafana dashboards

**5. Networking & Security**

- **VNet integration:** Private endpoints to PostgreSQL, Redis, Blob Storage
- **Ingress control:** Public API on one container app, admin API on internal-only app
- **Managed identity:** No credentials in code; uses Azure AD for Key Vault, DB, Storage

**6. DevOps-Friendly**

- **GitHub Actions integration:** Native support for CI/CD
- **Blue/green deployment:** Built-in revision management
- **Rollback:** Instant rollback to previous revision
- **A/B testing:** Traffic splitting between revisions (future feature)

---

## Deployment Architecture

### Container Apps Environments

**1. Production Environment**

```
┌─────────────────────────────────────────────────────────────────┐
│ Azure Container Apps Environment: prod                          │
│                                                                 │
│  ┌────────────────────┐       ┌────────────────────┐           │
│  │ API Service        │       │ Worker Service     │           │
│  │ (public ingress)   │       │ (no ingress)       │           │
│  │                    │       │                    │           │
│  │ Scale: 1-10        │       │ Scale: 1-5         │           │
│  │ CPU: 0.5-1.0 cores │       │ CPU: 1.0-2.0 cores │           │
│  │ Mem: 1-2 GB        │       │ Mem: 2-4 GB        │           │
│  └────────────────────┘       └────────────────────┘           │
│          ▲                             ▲                         │
│          │                             │                         │
│          │ HTTPS (public)              │ Internal (VNet)         │
│          │                             │                         │
└──────────┼─────────────────────────────┼─────────────────────────┘
           │                             │
           │                             │
┌──────────▼─────────────────────────────▼─────────────────────────┐
│ Managed Services (Private Endpoints)                             │
│                                                                  │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│ │ PostgreSQL   │  │ Redis Cache  │  │ Blob Storage │           │
│ │ (VNet-only)  │  │ (VNet-only)  │  │ (VNet-only)  │           │
│ └──────────────┘  └──────────────┘  └──────────────┘           │
└──────────────────────────────────────────────────────────────────┘
```

**2. Staging Environment**

Separate Container Apps environment with same structure, different namespace.

### Container App Configurations

**API Service:**

```yaml
name: api-service
properties:
  managedEnvironmentId: /subscriptions/.../prod
  configuration:
    ingress:
      external: true
      targetPort: 3000
      transport: http
      allowInsecure: false  # HTTPS only
    secrets:
      - name: db-connection-string
        keyVaultUrl: https://prod-kv.vault.azure.net/secrets/db-conn
    registries:
      - server: acr.azurecr.io
        identity: /subscriptions/.../mi-acr
  template:
    containers:
      - name: api
        image: acr.azurecr.io/hampshire-bins-api:latest
        resources:
          cpu: 0.5
          memory: 1Gi
        env:
          - name: DB_CONNECTION_STRING
            secretRef: db-connection-string
          - name: REDIS_URL
            secretRef: redis-url
    scale:
      minReplicas: 1  # Beta: 1, Production: 3
      maxReplicas: 10
      rules:
        - name: http-rule
          http:
            metadata:
              concurrentRequests: 100
        - name: cpu-rule
          custom:
            type: cpu
            metadata:
              value: 70
```

**Worker Service:**

```yaml
name: worker-service
properties:
  managedEnvironmentId: /subscriptions/.../prod
  configuration:
    ingress: null  # No public ingress
    secrets:
      - name: db-connection-string
        keyVaultUrl: https://prod-kv.vault.azure.net/secrets/db-conn
  template:
    containers:
      - name: worker
        image: acr.azurecr.io/hampshire-bins-worker:latest
        resources:
          cpu: 1.0
          memory: 2Gi
        env:
          - name: DB_CONNECTION_STRING
            secretRef: db-connection-string
          - name: REDIS_URL
            secretRef: redis-url
    scale:
      minReplicas: 1  # Beta: 1, Production: 2
      maxReplicas: 5
      rules:
        - name: queue-depth-rule
          custom:
            type: redis
            metadata:
              listName: adapter-queue
              listLength: 50  # Scale up when >50 jobs
```

---

## Consequences

### Positive

1. **Rapid deployment** — Terraform modules for Container Apps mature and stable
2. **Low operational overhead** — No cluster upgrades, node management, or OS patching
3. **Cost-effective** — Scale-to-zero during off-peak; pay-per-second billing
4. **Playwright compatibility** — Custom base image supports headless Chrome
5. **Integrated monitoring** — Azure Monitor + Application Insights built-in
6. **Security** — VNet integration, private endpoints, managed identity
7. **DevOps-friendly** — GitHub Actions integration, revision management, rollback

### Negative

1. **Playwright verification required** — Container Apps is newer; need to validate Playwright works in sandbox
2. **Limited customization** — Less control than AKS (cannot customize scheduler, networking stack)
3. **Vendor lock-in** — Container Apps is Azure-specific (not portable to AWS/GCP)
4. **Scaling limits** — Max 10 replicas per app (sufficient for now, but may hit limits at scale)
5. **Newer service** — Container Apps launched 2022; less mature than AKS or App Service

### Neutral

1. **Terraform state management** — Same as any IaC (store in Azure Storage with locking)
2. **Monitoring setup** — Requires Grafana dashboards (not auto-created)
3. **Custom domain** — Requires DNS configuration (same as any platform)

---

## Implementation Plan

### Phase 1: Staging Deployment (Week 1)

- [x] Terraform modules written (`infra/terraform/modules/container-apps/`)
- [ ] Deploy to staging environment
- [ ] Validate Playwright runs in Container Apps
- [ ] Run synthetic checks (canary postcodes)
- [ ] Load testing (10 RPS sustained)

### Phase 2: Production Deployment (Week 2-3)

- [ ] Deploy to production environment
- [ ] Configure custom domain (api.hampshirebins.uk)
- [ ] Enable Azure Monitor alerts
- [ ] Configure autoscaling rules
- [ ] Blue/green deployment test (revision switching)

### Phase 3: Observability (Week 4)

- [ ] Grafana dashboards for Prometheus metrics
- [ ] Application Insights distributed tracing
- [ ] Log aggregation (Azure Log Analytics)
- [ ] PagerDuty integration for critical alerts

### Phase 4: Optimization (Month 2)

- [ ] Tune autoscaling thresholds (based on real traffic)
- [ ] Enable scale-to-zero (after validating cold start latency acceptable)
- [ ] CDN configuration (Azure Front Door)
- [ ] Geo-distribution evaluation (UK South + UK West)

---

## Validation Criteria

### Must Validate Before Production

1. **Playwright compatibility:**
   - [ ] Chromium launches successfully in container
   - [ ] Browser automation completes without errors
   - [ ] Screenshots captured correctly
   - [ ] Resource limits sufficient (2 GB RAM per worker)

2. **Network connectivity:**
   - [ ] Private endpoint to PostgreSQL works
   - [ ] Private endpoint to Redis works
   - [ ] Private endpoint to Blob Storage works
   - [ ] Egress to council domains works (firewall rules)

3. **Scaling behavior:**
   - [ ] Autoscaling triggers correctly (CPU, HTTP, queue depth)
   - [ ] Scale-to-zero works (if enabled)
   - [ ] Cold start latency acceptable (<5s for API, <10s for workers)

4. **Monitoring:**
   - [ ] Logs appear in Azure Monitor
   - [ ] Metrics appear in Application Insights
   - [ ] Prometheus /metrics endpoint exposed and scrapable
   - [ ] Alerts fire correctly (test with artificial load)

---

## Rollback Plan

If Container Apps proves unsuitable:

### Option 1: Azure App Service (Fallback)

- Migrate to App Service for Linux (custom containers)
- Requires adjusting autoscaling (per-app, not per-instance)
- Playwright compatibility likely (similar runtime to Container Apps)
- Higher cost (no scale-to-zero)

### Option 2: Azure Kubernetes Service (Escalation)

- If Container Apps scaling limits hit (unlikely Year 1-2)
- Requires Kubernetes expertise (hire or train)
- Significantly higher operational overhead
- Only if traffic exceeds Container Apps capacity (>1M requests/day)

---

## References

- **Azure Container Apps Docs:** https://learn.microsoft.com/azure/container-apps/
- **Playwright Docker:** https://playwright.dev/docs/docker
- **Terraform Modules:** `infra/terraform/modules/container-apps/`
- **ADR-003: Storage Architecture:** `docs/adr/ADR-003-storage-architecture.md`
- **Performance Design Notes:** `docs/performance.md`
- **Platform Status:** `docs/platform-status.md`

---

## Review History

- **2026-03-25:** Initial decision (Holden, Drummer)
- **Pending:** Validation in staging (Drummer)
- **Pending:** Playwright compatibility confirmation (Naomi)
