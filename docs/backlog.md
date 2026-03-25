# Hampshire Bin Collection Platform — Phased Backlog

## Overview

This backlog organises work into five phases, from foundational architecture (Phase 0) through production launch and ongoing operations (Phase 4). Each phase builds on the previous, with clear dependencies and security gates.

---

## Phase 0: Architecture & Foundation

**Goal:** Establish repository structure, architecture decisions, contracts, and development environment.

**Duration:** 1-2 weeks

| Deliverable | Description | Complexity | Security Gate |
|-------------|-------------|------------|---------------|
| Repository structure | Directory layout, configuration files | S | No |
| ADR-001 through ADR-005 | Core architecture decisions documented | M | Yes |
| Canonical adapter interface | TypeScript interface definition | M | Yes |
| Domain model (JSON Schema + SQL) | Entity definitions, database schema | L | Yes |
| OpenAPI specification | API contract for public and admin endpoints | M | Yes |
| Architecture diagram | System component diagram with trust boundaries | S | No |
| Trust boundaries document | Security boundary definitions | M | Yes |
| Phased backlog | This document | S | No |
| Local dev environment | Docker Compose for local services | M | No |
| CI/CD skeleton | GitHub Actions for lint, test, build | M | No |

**Dependencies:** None (initial phase)

**Security Gate:** Threat model review of architecture, ADR security implications approved.

---

## Phase 1: Core Infrastructure & First Adapter

**Goal:** Deploy core infrastructure, implement one adapter end-to-end, establish CI/CD pipeline.

**Duration:** 3-4 weeks

| Deliverable | Description | Complexity | Security Gate |
|-------------|-------------|------------|---------------|
| Terraform/Bicep modules | Azure infrastructure as code | L | Yes |
| PostgreSQL deployment | Database with schema migration | M | Yes |
| Redis deployment | Cache and queue infrastructure | M | No |
| Blob storage deployment | Evidence storage with retention | M | Yes |
| API service skeleton | Hono API with auth middleware | L | Yes |
| Worker service skeleton | BullMQ worker with job processing | L | Yes |
| Adapter base classes | Shared adapter utilities, HTTP client | M | Yes |
| First adapter (Basingstoke) | Complete adapter for one council | L | No |
| Unit test framework | Vitest configuration, test patterns | M | No |
| Integration test framework | API and adapter integration tests | M | No |
| CI pipeline (full) | Lint, test, security scan, build | L | Yes |
| CD pipeline (staging) | Automated deployment to staging | M | Yes |
| Observability setup | Logging, metrics, tracing | M | No |

**Dependencies:**
- Phase 0 complete
- Azure subscription provisioned
- GitHub repository configured

**Security Gate:**
- Infrastructure security review (network isolation, encryption)
- Authentication implementation review
- CI/CD security review (OIDC, secret management)

---

## Phase 2: Multi-Adapter & API Completion

**Goal:** Implement majority of adapters, complete public API, establish health monitoring.

**Duration:** 4-6 weeks

| Deliverable | Description | Complexity | Security Gate |
|-------------|-------------|------------|---------------|
| Adapter: Test Valley | Second council adapter | M | No |
| Adapter: East Hampshire | Third council adapter | M | No |
| Adapter: Winchester | Fourth council adapter | M | No |
| Adapter: Hart | Fifth council adapter | M | No |
| Adapter: Havant | Sixth council adapter | M | No |
| Browser automation sandbox | Container isolation for Playwright | L | Yes |
| Browser-based adapters (3+) | Adapters requiring browser automation | XL | Yes |
| Public API endpoints (all) | Complete public API surface | L | No |
| Rate limiting | Per-key rate limiting with Redis | M | Yes |
| Response caching | API response caching layer | M | No |
| Health check system | Adapter health monitoring | M | No |
| Evidence capture | HTML/screenshot capture to blob | M | Yes |
| API documentation | OpenAPI spec, usage guide | M | No |
| Load testing | Performance baseline | M | No |

**Dependencies:**
- Phase 1 complete
- First adapter validated in staging
- CI/CD pipeline operational

**Security Gate:**
- Browser automation sandbox security review
- Rate limiting effectiveness validation
- Evidence handling PII review

---

## Phase 3: Admin, Security Hardening & Production Prep

**Goal:** Implement admin API, complete security hardening, prepare for production launch.

**Duration:** 3-4 weeks

| Deliverable | Description | Complexity | Security Gate |
|-------------|-------------|------------|---------------|
| Admin API service | Separate admin service deployment | L | Yes |
| Admin authentication | JWT with MFA requirement | M | Yes |
| Admin RBAC | Role-based access control | M | Yes |
| Audit logging | Comprehensive audit trail | M | Yes |
| Security event pipeline | Security event capture and alerting | M | Yes |
| Penetration testing | Third-party security assessment | L | Yes |
| Dependency audit | Full dependency security review | M | Yes |
| Secret rotation | Automated credential rotation | M | Yes |
| Runbooks | Incident response, adapter failure | M | No |
| Production infrastructure | Production environment deployment | L | Yes |
| CD pipeline (production) | Staged production deployment | M | Yes |
| Remaining adapters | Complete adapter coverage (13 councils) | XL | No |
| Documentation (complete) | Architecture, API, operations docs | M | No |

**Dependencies:**
- Phase 2 complete
- Staging environment validated
- Security scanning clean

**Security Gate:**
- Penetration test findings remediated
- Admin authentication/authorisation review
- Audit logging completeness review
- Production deployment approval

---

## Phase 4: Launch & Operations

**Goal:** Launch to production, establish operational practices, continuous improvement.

**Duration:** Ongoing

| Deliverable | Description | Complexity | Security Gate |
|-------------|-------------|------------|---------------|
| Production launch | Initial production deployment | M | Yes |
| Monitoring dashboards | Operational visibility | M | No |
| Alerting rules | Incident detection | M | No |
| On-call rotation | Operational support | S | No |
| API key management | Client onboarding process | M | Yes |
| Adapter maintenance | Schema drift detection, fixes | Ongoing | No |
| Security monitoring | Continuous security event review | Ongoing | Yes |
| Compliance review | GDPR, data retention compliance | M | Yes |
| Performance optimisation | Ongoing performance tuning | Ongoing | No |
| Feature iteration | New features based on feedback | Ongoing | Varies |

**Dependencies:**
- Phase 3 complete
- Production security gate passed
- Operational team trained

**Security Gate:**
- Pre-launch security checklist
- Production access control review
- Incident response plan approved

---

## Complexity Legend

| Size | Effort | Description |
|------|--------|-------------|
| S | 1-2 days | Small, well-understood task |
| M | 3-5 days | Medium complexity, some unknowns |
| L | 1-2 weeks | Large, significant complexity |
| XL | 2-4 weeks | Very large, high complexity |

---

## Security Gate Requirements

| Gate | Requirements |
|------|--------------|
| Architecture Review | ADR security implications documented, threat model reviewed |
| Infrastructure Review | Network isolation, encryption at rest/transit, private endpoints |
| Authentication Review | Credential handling, token security, MFA implementation |
| Authorisation Review | RBAC implementation, least privilege |
| CI/CD Review | OIDC authentication, secret management, image signing |
| Penetration Test | Third-party assessment, critical/high findings remediated |
| Production Approval | All previous gates passed, runbooks complete, team trained |

---

## Milestones

| Milestone | Phase | Description |
|-----------|-------|-------------|
| M0: Foundation Complete | 0 | Architecture documented, contracts defined |
| M1: First Adapter E2E | 1 | One adapter working in staging |
| M2: Multi-Adapter Beta | 2 | 6+ adapters, public API complete |
| M3: Production Ready | 3 | Security hardened, admin complete |
| M4: Launch | 4 | Production live, operations established |

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Council website changes | High | Medium | Schema drift detection, evidence capture |
| Browser automation blocked | Medium | High | Stealth techniques, fallback to HTML parsing |
| UPRN availability varies | High | Low | Layered resolution model (ADR-005) |
| Security vulnerability discovered | Medium | High | Dependency scanning, rapid patching process |
| Adapter maintenance burden | High | Medium | Standardised adapter patterns, monitoring |
| Rate limiting by councils | Medium | Medium | Polite scraping, caching, rate limits |
