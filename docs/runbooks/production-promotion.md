# Production Promotion Runbook

## Overview
Staging (3-council beta) → Production (11-council full estate)

## Promotion criteria — ALL must be met

### Stability (minimum 7-day beta run)
- [ ] Zero P0/P1 incidents in last 7 days
- [ ] API uptime > 99.5% (check Azure Monitor)
- [ ] All 3 beta adapters returning data with confidence > 0.75
- [ ] No unexplained confidence degradation
- [ ] Synthetic checks green for 7 consecutive days
- [ ] Drift alerts: 0 breaking, < 3 minor

### Security
- [ ] Amos security sign-off: APPROVED ✅ (already done)
- [ ] No open P0/P1 security events
- [ ] Dependency scan: no CRITICAL vulnerabilities
- [ ] SIEM alerts: no unresolved critical alerts
- [ ] API keys rotated from beta values

### Performance
- [ ] p95 response time < 200ms (cached lookups)
- [ ] p95 response time < 2s (live acquisitions)
- [ ] No memory leaks (stable container memory over 7 days)
- [ ] Database connection pool not saturating

### Operational
- [ ] At least one full IR drill completed on staging
- [ ] Backup/restore tested (restore staging DB to verify)
- [ ] Runbooks reviewed by a human operator
- [ ] Admin dashboard accessible and showing correct data
- [ ] Log review: no unexpected error patterns

## Promotion steps

### Pre-promotion (day before)
1. Notify stakeholders: planned promotion date/time
2. Take staging DB snapshot
3. Final security scan: `npm audit && trivy fs .`
4. Review last 7 days of staging audit logs

### Promotion day
1. Tag the staging image for production:
   ```bash
   # Retag staging image (don't rebuild — same bits)
   az acr import \
     --name acrdbinplatformproduction \
     --source acrdbinplatformstaging.azurecr.io/binplatform-api:latest \
     --image binplatform-api:$(git rev-parse --short HEAD)
   ```

2. Run production Terraform:
   ```bash
   cd infra/terraform/environments/production
   terraform plan -out=production.tfplan
   # Review plan — should be new resources only, not destructive
   terraform apply production.tfplan
   ```

3. Run migrations on production DB:
   ```bash
   DATABASE_URL=$PROD_DB_URL npm run db:migrate
   ```

4. Enable adapters incrementally:
   - Week 1: Eastleigh, Fareham, Rushmoor (carried from beta)
   - Week 2: + East Hampshire, Gosport, Havant
   - Week 3: + Hart, Winchester, Test Valley, Portsmouth, Basingstoke
   
   Enable by setting kill switch to false and redeploying Container App.

5. Post-promotion verification (see below)

### Rollback plan
If production is unhealthy within 1 hour of promotion:
```bash
# Scale production Container App to 0
az containerapp update \
  --name ca-binplatform-api-production \
  --resource-group rg-binplatform-production \
  --min-replicas 0 --max-replicas 0
# Staging remains live — no user impact
```

## Adapter enablement schedule (post-promotion)
| Week | Adapters Added | Notes |
|---|---|---|
| Beta | Eastleigh, Fareham, Rushmoor | Highest confidence |
| Week 2 | + East Hampshire, Gosport, Havant | Medium confidence |
| Week 3 | + Hart, Winchester, Test Valley, Portsmouth, Basingstoke | Needs selector validation |
| TBD | New Forest, Southampton | Postponed — bot protection |
