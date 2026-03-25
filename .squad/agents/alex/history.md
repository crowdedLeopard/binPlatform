# Alex — History

## Project Context
Hampshire Bin Collection Data Platform. TypeScript/Node.js API (Fastify v5), PostgreSQL, Redis, Azure Container Apps.
Repo: crowdedLeopard/binPlatform. Owner: crowdedLeopard.

## Joined
2026-03-25 — Hired mid-deployment to fix TypeScript compilation issues and wire up Fastify routes.

## Current State (as of joining)
- API is LIVE at: https://ca-binplatform-api-staging.icyriver-42deda52.uksouth.azurecontainerapps.io
- `/health`, `/v1/councils`, `/v1/councils/:id`, `/v1/councils/:id/health` all working ✅
- `tsconfig.json` has `"noEmitOnError": false` — temporary hack to allow build despite 40+ type errors
- TypeScript errors span: AddressCandidate imports, HealthStatus.UNAVAILABLE, AdapterHealth.councilId, Fastify v5 API changes, pino types, storage client types
- `moduleResolution: NodeNext` in tsconfig causes `.js` extension requirements in imports

## Learnings
