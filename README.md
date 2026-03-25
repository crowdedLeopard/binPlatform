# Hampshire Bin Collection Data Platform

A production-grade, security-hardened platform to acquire, normalise, and expose household bin collection schedules from Hampshire local authorities via a well-governed API.

## Overview

This platform provides:
- **Data Acquisition**: Automated scrapers/adapters for 13 Hampshire councils
- **Normalisation**: Consistent data model across all sources
- **API**: RESTful API with authentication, rate limiting, and comprehensive documentation
- **Evidence Storage**: Immutable audit trail of source data
- **Property Resolution**: Address-to-collection mapping with confidence scoring

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Make (optional, for convenience commands)

### Local Development

1. **Clone and setup**
   ```bash
   git clone <repo-url>
   cd hampshire-bin-platform
   cp .env.example .env
   # Edit .env with your local configuration
   ```

2. **Start services**
   ```bash
   make docker-up
   # OR: docker-compose -f deploy/docker-compose.yml up -d
   ```

3. **Run migrations and seed data**
   ```bash
   make db-migrate
   make db-seed
   ```

4. **Start development server**
   ```bash
   make dev
   # API available at http://localhost:3000
   ```

### Running Tests

```bash
make test              # All tests
make test-unit         # Unit tests only
make test-integration  # Integration tests (requires services running)
make test-security     # Security-focused tests
```

## Architecture

```
┌─────────────┐
│   API       │  ← Rate-limited, authenticated REST API
│  (Fastify)  │
└──────┬──────┘
       │
┌──────┴──────┬──────────┬──────────┐
│ Adapters    │  Cache   │ Evidence │
│ (13 councils)│ (Redis) │  (Blob)  │
└─────────────┴──────────┴──────────┘
       │
┌──────┴──────┐
│  PostgreSQL │  ← Normalised collection data
└─────────────┘
```

See [docs/architecture.md](docs/architecture.md) for detailed design.

## Council Coverage

| Council            | Status | Adapter Type |
|--------------------|--------|--------------|
| Basingstoke        | ⏳ Pending | API/Scrape |
| East Hampshire     | ⏳ Pending | API/Scrape |
| Eastleigh          | ⏳ Pending | API/Scrape |
| Fareham            | ⏳ Pending | API/Scrape |
| Gosport            | ⏳ Pending | API/Scrape |
| Hart               | ⏳ Pending | API/Scrape |
| Havant             | ⏳ Pending | API/Scrape |
| New Forest         | ⏳ Pending | API/Scrape |
| Portsmouth         | ⏳ Pending | API/Scrape |
| Rushmoor           | ⏳ Pending | API/Scrape |
| Southampton        | ⏳ Pending | API/Scrape |
| Test Valley        | ⏳ Pending | API/Scrape |
| Winchester         | ⏳ Pending | API/Scrape |

## Security

⚠️ **Important Security Notes**:

- **Never commit secrets**: Use environment variables and managed secret stores
- **API Keys**: All API access requires authentication
- **Rate Limiting**: Enforced per-key limits to prevent abuse
- **Input Validation**: Strict schema validation on all endpoints
- **Network Isolation**: Playwright adapters run in sandboxed containers
- **Dependency Scanning**: Automated vulnerability checks in CI/CD
- **Image Scanning**: Container images scanned with Trivy
- **Secret Scanning**: Pre-commit hooks prevent accidental secret commits

See [docs/threat-model/](docs/threat-model/) for full threat analysis.

## API Usage

```bash
# Health check
curl http://localhost:3000/health

# Get councils
curl -H "X-API-Key: your-key-here" http://localhost:3000/api/v1/councils

# Get collections for a property
curl -H "X-API-Key: your-key-here" http://localhost:3000/api/v1/properties/search?postcode=SO23%201AA
```

See [docs/api.md](docs/api.md) for full API documentation.

## Development Workflow

1. **Lint and typecheck before commit**
   ```bash
   make lint typecheck
   ```

2. **Run tests**
   ```bash
   make test
   ```

3. **Build Docker image**
   ```bash
   docker build -f deploy/Dockerfile -t hampshire-bin-api:local .
   ```

4. **Security scans**
   ```bash
   npm audit --audit-level=moderate
   docker run --rm -v $(pwd):/src aquasec/trivy fs /src
   ```

## Infrastructure

Infrastructure is defined as code using Terraform in `infra/terraform/`.

**Deployment environments**:
- `dev`: Development (ephemeral)
- `staging`: Pre-production (persistent)
- `prod`: Production (HA, multi-AZ)

See [infra/terraform/README.md](infra/terraform/README.md) for deployment guide.

## Contributing

1. Create a feature branch
2. Make changes with tests
3. Ensure `make ci` passes
4. Submit PR with clear description
5. Wait for CI checks and review

## License

[To be determined]

## Support

For issues or questions, see [docs/runbooks/](docs/runbooks/).
