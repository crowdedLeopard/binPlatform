# Hampshire Bin Collection Data Platform — Repository Structure

```
hampshire-bins/
├── .github/                          # GitHub-specific configuration
│   └── workflows/                    # GitHub Actions CI/CD pipelines
│       ├── ci.yml                    # Lint, test, security scan on PR
│       ├── cd.yml                    # Deploy to staging/production
│       └── security-scan.yml         # SAST/DAST/dependency scanning
│
├── src/                              # TypeScript source code
│   ├── api/                          # API service (Express + Hono)
│   │   ├── index.ts                  # API entry point
│   │   ├── routes/                   # Route handlers by resource
│   │   │   ├── councils.ts           # /v1/councils endpoints
│   │   │   ├── properties.ts         # /v1/properties endpoints
│   │   │   ├── postcodes.ts          # /v1/postcodes endpoints
│   │   │   └── health.ts             # Health check endpoints
│   │   ├── middleware/               # Express/Hono middleware
│   │   │   ├── auth.ts               # Authentication middleware
│   │   │   ├── ratelimit.ts          # Rate limiting
│   │   │   ├── validation.ts         # Request validation (Zod)
│   │   │   └── error-handler.ts      # Centralised error handling
│   │   └── schemas/                  # Zod request/response schemas
│   │
│   ├── adapters/                     # Council-specific adapters
│   │   ├── base/                     # Shared adapter interface and utilities
│   │   │   ├── adapter.interface.ts  # Canonical adapter contract
│   │   │   ├── adapter.base.ts       # Base class with shared logic
│   │   │   ├── types.ts              # Shared adapter types
│   │   │   ├── http-client.ts        # Hardened HTTP client wrapper
│   │   │   ├── browser-client.ts     # Playwright wrapper (sandboxed)
│   │   │   └── evidence.ts           # Evidence capture utilities
│   │   │
│   │   ├── basingstoke/              # Basingstoke & Deane adapter (example)
│   │   │   ├── index.ts              # Adapter implementation
│   │   │   ├── parser.ts             # HTML/JSON parsing logic
│   │   │   ├── config.ts             # Council-specific config
│   │   │   └── README.md             # Adapter-specific notes
│   │   │
│   │   └── [council-name]/           # Other councils follow same pattern
│   │       └── ...
│   │
│   ├── core/                         # Domain model and business logic
│   │   ├── domain/                   # Domain entities
│   │   │   ├── council.ts            # Council entity
│   │   │   ├── property.ts           # Property entity
│   │   │   ├── collection-event.ts   # Collection event entity
│   │   │   ├── collection-service.ts # Service type entity
│   │   │   └── index.ts              # Domain exports
│   │   ├── normalisation/            # Data normalisation
│   │   │   ├── address.ts            # Address normalisation
│   │   │   ├── service-type.ts       # Service type mapping
│   │   │   └── date.ts               # Date/time normalisation
│   │   ├── resolution/               # Property identity resolution
│   │   │   ├── uprn-resolver.ts      # UPRN lookup service
│   │   │   ├── postcode-resolver.ts  # Postcode → addresses
│   │   │   └── fallback-resolver.ts  # Layered resolution strategy
│   │   └── validation/               # Domain validation
│   │       ├── schemas.ts            # Zod domain schemas
│   │       └── invariants.ts         # Business rule validators
│   │
│   ├── workers/                      # Background workers
│   │   ├── acquisition-worker.ts     # Main acquisition consumer
│   │   ├── queue.ts                  # BullMQ queue definitions
│   │   ├── scheduler.ts              # Cron-style scheduler
│   │   ├── adapter-runner.ts         # Isolated adapter execution
│   │   └── health-monitor.ts         # Adapter health polling
│   │
│   ├── auth/                         # Authentication and authorisation
│   │   ├── api-key.ts                # API key validation
│   │   ├── jwt.ts                    # JWT validation (admin)
│   │   ├── rbac.ts                   # Role-based access control
│   │   ├── scopes.ts                 # Permission scope definitions
│   │   └── audit.ts                  # Auth event logging
│   │
│   ├── storage/                      # Data persistence
│   │   ├── postgres/                 # PostgreSQL client
│   │   │   ├── client.ts             # Connection pool
│   │   │   ├── migrations/           # SQL migrations (Drizzle ORM)
│   │   │   ├── repositories/         # Repository pattern
│   │   │   └── queries/              # Complex queries
│   │   ├── redis/                    # Redis client
│   │   │   ├── client.ts             # Connection
│   │   │   ├── cache.ts              # Caching layer
│   │   │   └── rate-limit-store.ts   # Rate limit backing
│   │   └── blob/                     # Evidence blob storage
│   │       ├── client.ts             # Azure Blob / S3 client
│   │       └── evidence-store.ts     # Evidence storage service
│   │
│   ├── observability/                # Logging, metrics, tracing
│   │   ├── logger.ts                 # Structured logger (pino)
│   │   ├── metrics.ts                # Prometheus metrics
│   │   ├── tracing.ts                # OpenTelemetry tracing
│   │   └── security-events.ts        # Security event pipeline
│   │
│   ├── admin/                        # Admin service
│   │   ├── index.ts                  # Admin API entry point
│   │   ├── routes/                   # Admin route handlers
│   │   │   ├── adapters.ts           # Adapter management
│   │   │   ├── acquisition.ts        # Acquisition attempt viewer
│   │   │   ├── security.ts           # Security event viewer
│   │   │   └── audit.ts              # Audit log viewer
│   │   └── middleware/               # Admin-specific middleware
│   │       └── admin-auth.ts         # Admin JWT enforcement
│   │
│   └── config/                       # Configuration
│       ├── env.ts                    # Environment variable loader
│       ├── councils.ts               # Council configuration registry
│       └── feature-flags.ts          # Feature flag definitions
│
├── infra/                            # Infrastructure as Code
│   ├── terraform/                    # Terraform modules (Azure)
│   │   ├── main.tf                   # Root module
│   │   ├── variables.tf              # Input variables
│   │   ├── outputs.tf                # Output values
│   │   ├── modules/                  # Reusable modules
│   │   │   ├── api/                  # App Service / Container Apps
│   │   │   ├── database/             # PostgreSQL Flexible Server
│   │   │   ├── redis/                # Azure Cache for Redis
│   │   │   ├── storage/              # Blob storage
│   │   │   ├── keyvault/             # Azure Key Vault
│   │   │   ├── monitor/              # Application Insights
│   │   │   └── networking/           # VNet, Private Endpoints
│   │   └── environments/             # Per-environment config
│   │       ├── dev.tfvars
│   │       ├── staging.tfvars
│   │       └── prod.tfvars
│   └── bicep/                        # Alternative Bicep templates
│       └── ...
│
├── deploy/                           # Deployment artifacts
│   ├── docker/                       # Dockerfiles
│   │   ├── api.Dockerfile            # API service image
│   │   ├── worker.Dockerfile         # Worker service image
│   │   └── admin.Dockerfile          # Admin service image
│   ├── compose/                      # Docker Compose configs
│   │   ├── docker-compose.yml        # Full local stack
│   │   └── docker-compose.dev.yml    # Dev overrides
│   └── k8s/                          # Kubernetes manifests (if used)
│       ├── base/                     # Kustomize base
│       └── overlays/                 # Per-environment overlays
│
├── tests/                            # Test suites
│   ├── unit/                         # Unit tests
│   │   ├── adapters/                 # Adapter unit tests
│   │   ├── core/                     # Domain logic tests
│   │   └── api/                      # API handler tests
│   ├── integration/                  # Integration tests
│   │   ├── api/                      # API integration tests
│   │   ├── adapters/                 # Adapter integration tests
│   │   └── storage/                  # Database integration tests
│   ├── security/                     # Security tests
│   │   ├── auth.test.ts              # Auth bypass attempts
│   │   ├── injection.test.ts         # Injection testing
│   │   └── rate-limit.test.ts        # Rate limit enforcement
│   └── fixtures/                     # Test fixtures
│       ├── mock-servers/             # Mock council endpoints
│       ├── sample-responses/         # Captured HTML/JSON
│       └── seed-data/                # Database seeds
│
├── docs/                             # Documentation
│   ├── architecture.md               # System architecture overview
│   ├── api-guide.md                  # API usage guide
│   ├── adapter-development.md        # How to build adapters
│   ├── security.md                   # Security overview
│   ├── adr/                          # Architecture Decision Records
│   │   ├── ADR-001-language-choice.md
│   │   ├── ADR-002-api-framework.md
│   │   ├── ADR-003-storage-architecture.md
│   │   ├── ADR-004-adapter-isolation.md
│   │   └── ADR-005-property-identity.md
│   ├── threat-model/                 # Threat model documents
│   │   ├── trust-boundaries.md       # Trust boundary definitions
│   │   └── attack-surface.md         # Attack surface analysis
│   └── runbooks/                     # Operational runbooks
│       ├── incident-response.md      # Incident response procedures
│       ├── adapter-failure.md        # Adapter failure recovery
│       └── data-breach.md            # Data breach response
│
├── scripts/                          # Developer tooling
│   ├── setup.sh                      # Local environment setup
│   ├── seed-db.ts                    # Database seeding
│   ├── generate-api-key.ts           # API key generation
│   ├── test-adapter.ts               # Single adapter test runner
│   └── capture-evidence.ts           # Manual evidence capture
│
├── .env.example                      # Example environment variables
├── .gitignore                        # Git ignore patterns
├── package.json                      # Node.js dependencies
├── tsconfig.json                     # TypeScript configuration
├── vitest.config.ts                  # Test runner configuration
├── drizzle.config.ts                 # Drizzle ORM configuration
├── openapi.yaml                      # OpenAPI specification
├── Makefile                          # Common commands
└── README.md                         # Project overview
```

## Language Choice: TypeScript

**Decision:** TypeScript with strict mode enabled.

**Rationale:**

1. **Type Safety** — Strict TypeScript catches adapter interface violations at compile time, critical when 13 different adapters must conform to a canonical contract.

2. **Playwright Integration** — Playwright is a first-class TypeScript library. Browser automation adapters benefit from native async/await, strong typing, and excellent IDE support.

3. **Single Language Stack** — API, workers, and adapters share types. No serialisation boundaries between layers.

4. **Security Tooling** — npm ecosystem has mature security scanning (npm audit, Snyk, socket.dev). TypeScript's type system prevents many injection vulnerabilities.

5. **Ecosystem Maturity** — Express/Hono, Zod, Drizzle, pino, BullMQ are production-proven with active security maintenance.

6. **Team Velocity** — Most web developers know TypeScript. Onboarding adapter authors is faster.

**Trade-off:** Python has stronger data science libraries if we needed ML-based parsing. We don't — our parsing is deterministic HTML/JSON extraction.
