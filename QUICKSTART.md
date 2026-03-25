# Quick Start Guide

## Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Git

## Setup (5 minutes)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env if needed (defaults work for local dev)
```

### 3. Start Services
```bash
make docker-up
# OR: docker-compose -f deploy/docker-compose.yml up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Azurite (port 10000)

### 4. Initialize Database
```bash
npm run db:migrate
npm run db:seed
```

### 5. Start Development Server
```bash
make dev
# OR: npm run dev
```

API available at: http://localhost:3000

## Verify Setup

```bash
# Check health
curl http://localhost:3000/health

# Should return:
# {
#   "status": "ok",
#   "timestamp": "2026-03-25T...",
#   "service": "hampshire-bin-platform",
#   "version": "0.1.0"
# }
```

## Common Commands

```bash
make dev              # Start development server
make test             # Run all tests
make test-unit        # Unit tests only
make test-integration # Integration tests only
make lint             # Lint code
make typecheck        # Type check
make docker-up        # Start services
make docker-down      # Stop services
make docker-logs      # View logs
make db-migrate       # Run migrations
make db-seed          # Seed data
```

## Project Structure

```
src/
  api/              - Fastify server and routes
  adapters/         - Council-specific data acquisition
  core/             - Domain models and business logic
  storage/          - Database, cache, blob storage clients
  auth/             - API key authentication and RBAC
  observability/    - Logging and metrics
  workers/          - Background workers
deploy/             - Docker and deployment configs
infra/              - Terraform infrastructure code
tests/              - Unit, integration, security tests
scripts/            - Database migrations and seeds
```

## Next Steps

1. **Implement Adapters**: See `src/adapters/base/interface.ts` for adapter contract
2. **Add Tests**: See `tests/` directories for test structure
3. **Configure Infrastructure**: See `infra/terraform/` for Azure resources
4. **Review Security**: See `docs/threat-model/` for security considerations

## Troubleshooting

### Services won't start
```bash
# Check if ports are in use
docker-compose -f deploy/docker-compose.yml ps

# View logs
docker-compose -f deploy/docker-compose.yml logs
```

### Database connection fails
```bash
# Check PostgreSQL is running
docker-compose -f deploy/docker-compose.yml ps postgres

# Test connection
docker-compose -f deploy/docker-compose.yml exec postgres psql -U binday -d binday -c "SELECT 1"
```

### Redis connection fails
```bash
# Check Redis is running
docker-compose -f deploy/docker-compose.yml ps redis

# Test connection
docker-compose -f deploy/docker-compose.yml exec redis redis-cli ping
```

## Development Workflow

1. Create a feature branch
2. Make changes with tests
3. Run `make ci` to verify (lint, typecheck, test, build)
4. Commit and push
5. CI pipeline runs automatically
6. Create PR for review

## Support

- See `BOOTSTRAP-SUMMARY.md` for what's implemented
- See `.squad/decisions/inbox/` for architecture decisions
- See `docs/` for detailed documentation
- See `README.md` for project overview
