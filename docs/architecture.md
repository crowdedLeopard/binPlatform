# Hampshire Bin Collection Platform — Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           HAMPSHIRE BINS PLATFORM                                             │
├──────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                                               │
│  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                         PUBLIC INTERNET                                                  │ │
│  │                                                                                                          │ │
│  │     ┌──────────────┐              ┌──────────────┐              ┌──────────────┐                        │ │
│  │     │  Mobile App  │              │   Web App    │              │ Third-Party  │                        │ │
│  │     │   Clients    │              │   Clients    │              │ Integrators  │                        │ │
│  │     └──────┬───────┘              └──────┬───────┘              └──────┬───────┘                        │ │
│  │            │                              │                             │                                │ │
│  └────────────┼──────────────────────────────┼─────────────────────────────┼────────────────────────────────┘ │
│               │                              │                             │                                  │
│               │         HTTPS (TLS 1.3)      │                             │                                  │
│               └──────────────────────────────┼─────────────────────────────┘                                  │
│                                              │                                                                │
│  ┌───────────────────────────────────────────▼──────────────────────────────────────────────────────────────┐ │
│  │                              EDGE SECURITY LAYER                                                          │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                    Azure Front Door / Cloudflare                                                     │ │ │
│  │  │  • WAF (Web Application Firewall)    • DDoS Protection                                               │ │ │
│  │  │  • Rate Limiting (global)            • Geo-blocking (optional)                                       │ │ │
│  │  │  • TLS Termination                   • Request Validation                                            │ │ │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘ │
│                                              │                                                                │
│  ╔═══════════════════════════════════════════╧══════════════════════════════════════════════════════════════╗ │
│  ║                               TRUST BOUNDARY: EXTERNAL → DMZ                                              ║ │
│  ╚═══════════════════════════════════════════╤══════════════════════════════════════════════════════════════╝ │
│                                              │                                                                │
│  ┌───────────────────────────────────────────▼──────────────────────────────────────────────────────────────┐ │
│  │                              API GATEWAY LAYER                                                            │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                         Azure API Management / Kong                                                  │ │ │
│  │  │  • API Key Validation               • JWT Validation (admin)                                        │ │ │
│  │  │  • Rate Limiting (per-key)          • Request Logging                                                │ │ │
│  │  │  • Schema Validation                • CORS Enforcement                                               │ │ │
│  │  │  • Response Caching (edge)          • Throttling Policies                                            │ │ │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────┬──────────────────────────────────────────────────────────────┘ │
│                                              │                                                                │
│  ╔═══════════════════════════════════════════╧══════════════════════════════════════════════════════════════╗ │
│  ║                               TRUST BOUNDARY: DMZ → APPLICATION                                           ║ │
│  ╚═══════════════════════════════════════════╤══════════════════════════════════════════════════════════════╝ │
│                                              │                                                                │
│  ┌───────────────────────────────────────────┴──────────────────────────────────────────────────────────────┐ │
│  │                                      APPLICATION LAYER (VNet)                                             │ │
│  │                                                                                                           │ │
│  │  ┌─────────────────────────────────────┐     ┌─────────────────────────────────────┐                     │ │
│  │  │         PUBLIC API SERVICE          │     │         ADMIN API SERVICE           │                     │ │
│  │  │    (Azure Container Apps / AKS)     │     │    (Azure Container Apps / AKS)     │                     │ │
│  │  │                                     │     │                                     │                     │ │
│  │  │  • Hono API Framework               │     │  • Separate deployment              │                     │ │
│  │  │  • Zod Request Validation           │     │  • JWT-only authentication          │                     │ │
│  │  │  • Response Serialization           │     │  • RBAC enforcement                 │                     │ │
│  │  │  • Error Handling                   │     │  • Audit logging                    │                     │ │
│  │  │  • Correlation ID propagation       │     │  • No public access                 │                     │ │
│  │  │                                     │     │                                     │                     │ │
│  │  └──────────────┬──────────────────────┘     └──────────────┬──────────────────────┘                     │ │
│  │                 │                                           │                                             │ │
│  │                 │                                           │                                             │ │
│  │                 ▼                                           ▼                                             │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                              CORE SERVICES LAYER                                                     │ │ │
│  │  │                                                                                                      │ │ │
│  │  │   ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────┐                 │ │ │
│  │  │   │  Property Resolution  │   │  Collection Service   │   │  Council Registry     │                 │ │ │
│  │  │   │      Service          │   │      Service          │   │      Service          │                 │ │ │
│  │  │   │                       │   │                       │   │                       │                 │ │ │
│  │  │   │  • UPRN lookup        │   │  • Service lookup     │   │  • Council metadata   │                 │ │ │
│  │  │   │  • Address matching   │   │  • Event lookup       │   │  • Adapter registry   │                 │ │ │
│  │  │   │  • Property creation  │   │  • Data freshness     │   │  • Health status      │                 │ │ │
│  │  │   └───────────────────────┘   └───────────────────────┘   └───────────────────────┘                 │ │ │
│  │  │                                                                                                      │ │ │
│  │  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘ │ │
│  │                 │                                                                                         │ │
│  │                 │                                                                                         │ │
│  │                 ▼                                                                                         │ │
│  │  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐ │ │
│  │  │                              ADAPTER ORCHESTRATION LAYER                                             │ │ │
│  │  │                                                                                                      │ │ │
│  │  │   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐   │ │ │
│  │  │   │                         BullMQ Job Queue (Redis-backed)                                      │   │ │ │
│  │  │   │                                                                                              │   │ │ │
│  │  │   │  • Acquisition jobs              • Health check jobs                                         │   │ │ │
│  │  │   │  • Retry with backoff            • Dead letter queue                                         │   │ │ │
│  │  │   │  • Rate limiting per council     • Job priority                                              │   │ │ │
│  │  │   │  • Concurrency control           • Job metrics                                               │   │ │ │
│  │  │   │                                                                                              │   │ │ │
│  │  │   └─────────────────────────────────────────────────────────────────────────────────────────────┘   │ │ │
│  │  │                                              │                                                       │ │ │
│  │  └──────────────────────────────────────────────┼───────────────────────────────────────────────────────┘ │ │
│  │                                                 │                                                         │ │
│  │  ╔══════════════════════════════════════════════╧════════════════════════════════════════════════════════╗│ │
│  │  ║                         TRUST BOUNDARY: APPLICATION → WORKER SANDBOX                                   ║│ │
│  │  ╚══════════════════════════════════════════════╤════════════════════════════════════════════════════════╝│ │
│  │                                                 │                                                         │ │
│  │  ┌──────────────────────────────────────────────▼────────────────────────────────────────────────────────┐│ │
│  │  │                              ADAPTER WORKER POOL (Isolated)                                            ││ │
│  │  │                                                                                                        ││ │
│  │  │   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐     ││ │
│  │  │   │                         Worker Process Pool                                                  │     ││ │
│  │  │   │                                                                                              │     ││ │
│  │  │   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │     ││ │
│  │  │   │  │   Worker 1   │  │   Worker 2   │  │   Worker 3   │  │   Worker N   │                     │     ││ │
│  │  │   │  │              │  │              │  │              │  │              │                     │     ││ │
│  │  │   │  │ Memory limit │  │ Memory limit │  │ Memory limit │  │ Memory limit │                     │     ││ │
│  │  │   │  │ CPU timeout  │  │ CPU timeout  │  │ CPU timeout  │  │ CPU timeout  │                     │     ││ │
│  │  │   │  │ Crash isoltn │  │ Crash isoltn │  │ Crash isoltn │  │ Crash isoltn │                     │     ││ │
│  │  │   │  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                     │     ││ │
│  │  │   │                                                                                              │     ││ │
│  │  │   └─────────────────────────────────────────────────────────────────────────────────────────────┘     ││ │
│  │  │                                                                                                        ││ │
│  │  │   ┌─────────────────────────────────────────────────────────────────────────────────────────────┐     ││ │
│  │  │   │              Browser Automation Sandbox (Container per execution)                            │     ││ │
│  │  │   │                                                                                              │     ││ │
│  │  │   │  ┌────────────────────────────────────────────────────────────────────────────────────────┐ │     ││ │
│  │  │   │  │  • Playwright + Chromium                     • Read-only filesystem                    │ │     ││ │
│  │  │   │  │  • Network: Council domains only (egress)    • No access to internal services          │ │     ││ │
│  │  │   │  │  • Memory limit: 1GB                         • CPU limit: 1 core                       │ │     ││ │
│  │  │   │  │  • Execution timeout: 60 seconds             • Non-root user                           │ │     ││ │
│  │  │   │  └────────────────────────────────────────────────────────────────────────────────────────┘ │     ││ │
│  │  │   │                                                                                              │     ││ │
│  │  │   └─────────────────────────────────────────────────────────────────────────────────────────────┘     ││ │
│  │  │                                                                                                        ││ │
│  │  └────────────────────────────────────────────────────────────────────────────────────────────────────────┘│ │
│  │                          │                                │                                                │ │
│  │                          │                                │                                                │ │
│  │  ╔═══════════════════════╧════════════════════════════════╧══════════════════════════════════════════════╗│ │
│  │  ║                         TRUST BOUNDARY: WORKER → EXTERNAL COUNCIL SITES                                ║│ │
│  │  ╚═══════════════════════╤════════════════════════════════╤══════════════════════════════════════════════╝│ │
│  │                          │                                │                                                │ │
│  │                          ▼                                │                                                │ │
│  │  ┌───────────────────────────────────────────────┐        │                                                │ │
│  │  │            EXTERNAL COUNCIL SITES             │        │                                                │ │
│  │  │                 (Untrusted)                   │        │                                                │ │
│  │  │                                               │        │                                                │ │
│  │  │  ┌───────────┐  ┌───────────┐  ┌───────────┐ │        │                                                │ │
│  │  │  │Basingstoke│  │Test Valley│  │   East    │ │        │                                                │ │
│  │  │  │  Council  │  │  Council  │  │ Hampshire │ │        │                                                │ │
│  │  │  └───────────┘  └───────────┘  └───────────┘ │        │                                                │ │
│  │  │                  ... 13 councils ...          │        │                                                │ │
│  │  └───────────────────────────────────────────────┘        │                                                │ │
│  │                                                           │                                                │ │
│  └───────────────────────────────────────────────────────────┼────────────────────────────────────────────────┘ │
│                                                              │                                                  │
│  ┌───────────────────────────────────────────────────────────┴──────────────────────────────────────────────┐ │
│  │                                      DATA LAYER (Private Endpoints)                                       │ │
│  │                                                                                                           │ │
│  │   ┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌─────────────────────────────┐   │ │
│  │   │         PostgreSQL          │   │           Redis             │   │      Blob Storage          │   │ │
│  │   │   (Azure Flexible Server)   │   │   (Azure Cache for Redis)   │   │   (Azure Blob Storage)     │   │ │
│  │   │                             │   │                             │   │                            │   │ │
│  │   │  • Councils                 │   │  • API response cache       │   │  • HTML evidence           │   │ │
│  │   │  • Properties               │   │  • Rate limit counters      │   │  • Screenshots             │   │ │
│  │   │  • Collection events        │   │  • Session state            │   │  • JSON responses          │   │ │
│  │   │  • Acquisition attempts     │   │  • BullMQ job queue         │   │  • PDF calendars           │   │ │
│  │   │  • Security events          │   │                             │   │                            │   │ │
│  │   │  • Audit entries            │   │                             │   │  (Immutable retention)     │   │ │
│  │   │                             │   │                             │   │                            │   │ │
│  │   │  [TLS + Private Endpoint]   │   │  [TLS + Private Endpoint]   │   │  [Private Endpoint]        │   │ │
│  │   │  [Encryption at rest]       │   │  [Encryption at rest]       │   │  [Encryption at rest]      │   │ │
│  │   └─────────────────────────────┘   └─────────────────────────────┘   └─────────────────────────────┘   │ │
│  │                                                                                                           │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                │
│  ┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐ │
│  │                                      OBSERVABILITY & SECURITY                                              │ │
│  │                                                                                                            │ │
│  │   ┌─────────────────────────────┐   ┌─────────────────────────────┐   ┌─────────────────────────────┐    │ │
│  │   │     Application Insights    │   │       Azure Key Vault       │   │    Security Event Sink     │    │ │
│  │   │                             │   │                             │   │                            │    │ │
│  │   │  • Structured logging       │   │  • Database credentials     │   │  • Security event ingest   │    │ │
│  │   │  • Distributed tracing      │   │  • API signing keys         │   │  • Alerting rules          │    │ │
│  │   │  • Metrics collection       │   │  • TLS certificates         │   │  • SIEM integration        │    │ │
│  │   │  • Performance monitoring   │   │  • Encryption keys          │   │  • Anomaly detection       │    │ │
│  │   │  • Alert rules              │   │                             │   │                            │    │ │
│  │   │                             │   │  [Managed Identity access]  │   │                            │    │ │
│  │   └─────────────────────────────┘   └─────────────────────────────┘   └─────────────────────────────┘    │ │
│  │                                                                                                            │ │
│  └───────────────────────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                                                │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘


                                         DATA FLOW DIAGRAM

  ┌────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                                            │
  │    ┌─────────┐                                                                                             │
  │    │  User   │                                                                                             │
  │    └────┬────┘                                                                                             │
  │         │ 1. GET /v1/postcodes/SO23%208QT/addresses                                                        │
  │         ▼                                                                                                  │
  │    ┌─────────────┐    2. Auth           ┌─────────────┐                                                   │
  │    │ API Gateway │──────────────────────│  API Key    │                                                   │
  │    │             │    Validation        │  Validator  │                                                   │
  │    └──────┬──────┘                      └─────────────┘                                                   │
  │           │                                                                                                │
  │           │ 3. Route to API service                                                                        │
  │           ▼                                                                                                │
  │    ┌─────────────┐    4. Check         ┌─────────────┐                                                    │
  │    │   Public    │◄───────────────────►│    Redis    │    (Cache miss)                                    │
  │    │ API Service │    cache            │    Cache    │                                                    │
  │    └──────┬──────┘                     └─────────────┘                                                    │
  │           │                                                                                                │
  │           │ 5. Determine council from postcode                                                             │
  │           │                                                                                                │
  │           │ 6. Enqueue acquisition job                                                                     │
  │           ▼                                                                                                │
  │    ┌─────────────┐                     ┌─────────────┐                                                    │
  │    │  BullMQ     │◄───────────────────►│    Redis    │                                                    │
  │    │   Queue     │    Job storage      │             │                                                    │
  │    └──────┬──────┘                     └─────────────┘                                                    │
  │           │                                                                                                │
  │           │ 7. Worker picks up job                                                                         │
  │           ▼                                                                                                │
  │    ┌─────────────┐                                                                                        │
  │    │   Worker    │                                                                                        │
  │    │  Process    │                                                                                        │
  │    └──────┬──────┘                                                                                        │
  │           │                                                                                                │
  │           │ 8. Load adapter for council                                                                    │
  │           ▼                                                                                                │
  │    ┌─────────────────────────────┐                                                                        │
  │    │   Basingstoke Adapter       │                                                                        │
  │    │                             │                                                                        │
  │    │  9. HTTP request to council │────────────────────────────────────────────────────┐                   │
  │    │                             │                                                     │                   │
  │    └─────────────────────────────┘                                                     ▼                   │
  │                                                                                 ┌─────────────┐            │
  │                                                                                 │  Council    │            │
  │                                                                                 │  Website    │            │
  │                                                                                 └──────┬──────┘            │
  │                                                                                        │                   │
  │    ┌─────────────────────────────┐      10. HTML response                             │                   │
  │    │   Basingstoke Adapter       │◄────────────────────────────────────────────────────┘                   │
  │    │                             │                                                                        │
  │    │  11. Parse HTML             │                                                                        │
  │    │  12. Extract addresses      │                                                                        │
  │    │  13. Normalise data         │                                                                        │
  │    │  14. Capture evidence       │                                                                        │
  │    │                             │                                                                        │
  │    └──────────┬──────────────────┘                                                                        │
  │               │                                                                                            │
  │               │ 15. Store evidence                                                                         │
  │               ▼                                                                                            │
  │    ┌─────────────┐                                                                                        │
  │    │    Blob     │                                                                                        │
  │    │   Storage   │                                                                                        │
  │    └─────────────┘                                                                                        │
  │               │                                                                                            │
  │               │ 16. Record attempt + results                                                               │
  │               ▼                                                                                            │
  │    ┌─────────────┐                                                                                        │
  │    │ PostgreSQL  │                                                                                        │
  │    │             │                                                                                        │
  │    └──────┬──────┘                                                                                        │
  │           │                                                                                                │
  │           │ 17. Return results to API service                                                              │
  │           ▼                                                                                                │
  │    ┌─────────────┐    18. Cache        ┌─────────────┐                                                    │
  │    │   Public    │──────────────────►  │    Redis    │                                                    │
  │    │ API Service │    response         │    Cache    │                                                    │
  │    └──────┬──────┘                     └─────────────┘                                                    │
  │           │                                                                                                │
  │           │ 19. Return JSON response                                                                       │
  │           ▼                                                                                                │
  │    ┌─────────┐                                                                                             │
  │    │  User   │                                                                                             │
  │    └─────────┘                                                                                             │
  │                                                                                                            │
  └────────────────────────────────────────────────────────────────────────────────────────────────────────────┘


                                       ADAPTER ISOLATION MODEL

  ┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │                                                                                                             │
  │                                        API-BASED ADAPTERS                                                   │
  │                                     (Low risk - process pool)                                               │
  │                                                                                                             │
  │   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
  │   │                                   Worker Process Pool                                                │  │
  │   │                                                                                                      │  │
  │   │  ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐                        │  │
  │   │  │     Worker 1        │   │     Worker 2        │   │     Worker 3        │                        │  │
  │   │  │                     │   │                     │   │                     │                        │  │
  │   │  │ ┌─────────────────┐ │   │ ┌─────────────────┐ │   │ ┌─────────────────┐ │                        │  │
  │   │  │ │ Hardened HTTP   │ │   │ │ Hardened HTTP   │ │   │ │ Hardened HTTP   │ │                        │  │
  │   │  │ │ Client          │ │   │ │ Client          │ │   │ │ Client          │ │                        │  │
  │   │  │ │                 │ │   │ │                 │ │   │ │                 │ │                        │  │
  │   │  │ │ • SSRF blocked  │ │   │ │ • SSRF blocked  │ │   │ │ • SSRF blocked  │ │                        │  │
  │   │  │ │ • Size limits   │ │   │ │ • Size limits   │ │   │ │ • Size limits   │ │                        │  │
  │   │  │ │ • Timeout       │ │   │ │ • Timeout       │ │   │ │ • Timeout       │ │                        │  │
  │   │  │ │ • TLS verify    │ │   │ │ • TLS verify    │ │   │ │ • TLS verify    │ │                        │  │
  │   │  │ └─────────────────┘ │   │ └─────────────────┘ │   │ └─────────────────┘ │                        │  │
  │   │  │                     │   │                     │   │                     │                        │  │
  │   │  │ Memory: 512MB max   │   │ Memory: 512MB max   │   │ Memory: 512MB max   │                        │  │
  │   │  │ CPU: Job timeout    │   │ CPU: Job timeout    │   │ CPU: Job timeout    │                        │  │
  │   │  └─────────────────────┘   └─────────────────────┘   └─────────────────────┘                        │  │
  │   │                                                                                                      │  │
  │   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
  │                                                                                                             │
  │                                                                                                             │
  │                                   BROWSER AUTOMATION ADAPTERS                                               │
  │                                   (High risk - container sandbox)                                           │
  │                                                                                                             │
  │   ┌─────────────────────────────────────────────────────────────────────────────────────────────────────┐  │
  │   │                              Container per Execution                                                 │  │
  │   │                                                                                                      │  │
  │   │  ┌───────────────────────────────────────────────────────────────────────────────────────────────┐  │  │
  │   │  │                           Sandboxed Container                                                  │  │  │
  │   │  │                                                                                                │  │  │
  │   │  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐                    │  │  │
  │   │  │  │    Playwright       │  │     Chromium        │  │   Adapter Code      │                    │  │  │
  │   │  │  │                     │  │    (headless)       │  │                     │                    │  │  │
  │   │  │  │  • Stealth mode     │  │                     │  │  • HTML parsing     │                    │  │  │
  │   │  │  │  • Request intcpt   │  │  • No extensions    │  │  • Data extraction  │                    │  │  │
  │   │  │  │  • Screenshot       │  │  • Sandboxed        │  │  • Normalisation    │                    │  │  │
  │   │  │  │  • HAR capture      │  │  • No GPU           │  │                     │                    │  │  │
  │   │  │  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘                    │  │  │
  │   │  │                                                                                                │  │  │
  │   │  │  SECURITY CONSTRAINTS:                                                                         │  │  │
  │   │  │  ├── Network: Egress to council domains only (*.gov.uk allowlist)                             │  │  │
  │   │  │  ├── Network: NO access to internal services (Redis, PostgreSQL, API)                         │  │  │
  │   │  │  ├── Filesystem: Read-only root, writable /tmp only                                           │  │  │
  │   │  │  ├── Memory: 1GB limit                                                                         │  │  │
  │   │  │  ├── CPU: 1 core limit                                                                         │  │  │
  │   │  │  ├── Time: 60 second execution timeout                                                         │  │  │
  │   │  │  ├── User: Non-root (uid 1000)                                                                 │  │  │
  │   │  │  ├── Capabilities: ALL dropped                                                                 │  │  │
  │   │  │  └── Privilege escalation: Disabled                                                            │  │  │
  │   │  │                                                                                                │  │  │
  │   │  └────────────────────────────────────────────────────────────────────────────────────────────────┘  │  │
  │   │                                                                                                      │  │
  │   └─────────────────────────────────────────────────────────────────────────────────────────────────────┘  │
  │                                                                                                             │
  └─────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Key Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript | Type safety, Playwright support, single-language stack |
| API Framework | Hono | Modern, type-safe, built-in security headers |
| Database | PostgreSQL | ACID, relational data, partitioning for time-series |
| Cache/Queue | Redis | Response cache, rate limits, BullMQ job queue |
| Evidence Storage | Blob Storage | Immutable, cost-effective, isolated |
| Adapter Isolation | Worker Queue + Container | Crash isolation, resource limits, security |
| Auth (Public) | API Key | Simple, stateless, per-client rate limits |
| Auth (Admin) | JWT | OAuth 2.0, RBAC, short-lived tokens |

## Security Principles

1. **Defence in Depth** — Multiple security layers from edge to data
2. **Least Privilege** — Minimal permissions at each layer
3. **Isolation** — Adapters cannot affect each other or core services
4. **Evidence Capture** — Full audit trail of all acquisitions
5. **Fail Secure** — Errors don't bypass security controls
