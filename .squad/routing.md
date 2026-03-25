# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture, API design, ADRs, scope decisions | Holden | System design, adapter interface spec, API contracts |
| Council adapters, backend API, data models, normalisation | Naomi | Adapter implementation, property resolution, PostgreSQL schema |
| Threat model, security design, abuse resistance, secrets | Amos | Threat modelling, STRIDE, WAF config, security tests |
| Tests, edge cases, test fixtures, coverage | Bobbie | Unit/integration/security tests, synthetic health checks |
| Infrastructure, CI/CD, Docker, scanning, observability | Drummer | Terraform/Bicep, pipelines, container hardening |
| Session logging, decision merging | Scribe | Automatic — never needs routing |
| Work queue monitoring, backlog, issue triage | Ralph | Active when "Ralph, go" is issued |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Holden |
| `squad:holden` | Architecture and design work | Holden |
| `squad:naomi` | Backend and adapter work | Naomi |
| `squad:amos` | Security and hardening work | Amos |
| `squad:bobbie` | Testing and QA work | Bobbie |
| `squad:drummer` | Infra and DevOps work | Drummer |

## Rules

1. **Eager by default** — spawn all agents who could usefully start work in parallel.
2. **Scribe always runs** after substantial work, always as background. Never blocks.
3. **Quick facts → coordinator answers directly.**
4. **Security blocks implementation** — if Amos raises a security concern, work pauses until resolved.
5. **Holden reviews before merging** — architecture and security gate.
6. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel.
7. **Anticipate downstream work.** While Naomi builds adapters, Bobbie writes tests from spec simultaneously.
