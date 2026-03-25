# Deployment Guide — Hampshire Bin Platform

## Prerequisites
- Azure CLI (`az login` + correct subscription)
- Terraform >= 1.5
- Docker
- Node.js >= 20

## Quick Start — Staging

```bash
# 1. Authenticate
az login
az account set --subscription "your-subscription-id"

# 2. Pre-flight check
chmod +x scripts/deploy/*.sh
./scripts/deploy/pre-deploy-check.sh

# 3. Deploy staging (3-council beta)
./scripts/deploy/deploy-staging.sh

# 4. Seed API keys
./scripts/deploy/seed-api-keys.sh <api-url> <bootstrap-admin-key>
```

## What gets deployed
- Azure Container Apps (API + monitor worker)
- Azure Container Registry (private image store)
- Azure Database for PostgreSQL Flexible Server
- Azure Cache for Redis
- Azure Blob Storage (evidence + operational)
- Azure Key Vault (secrets)
- Azure Log Analytics (monitoring + SIEM)
- Azure Monitor alert rules

## Beta council scope
Staging deploys with kill switches that restrict to 3 councils only:
- ✅ Eastleigh (Oracle APEX — highest confidence, 0.95)
- ✅ Fareham (Bartec SOAP — high confidence, 0.90)
- ✅ Rushmoor (form/browser — medium confidence, 0.78)
- 🔴 All others: kill switch active

## Promoting to production
See `docs/runbooks/production-promotion.md`

## Costs (estimated)
| Environment | Monthly |
|---|---|
| Staging (beta) | ~£35/month |
| Production (full) | ~£455/month |
