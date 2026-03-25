# Synthetic Monitoring Runbook

## Overview

The synthetic monitoring system continuously validates adapter health by executing real acquisition requests against production adapters using predefined "canary" postcodes. This provides early detection of adapter failures, schema drift, and council website changes.

## Architecture

- **Worker**: `deploy/Dockerfile.monitor` - Dedicated container for synthetic checks
- **Schedule**: Every 5 minutes (configurable via `MONITOR_INTERVAL_MINUTES`)
- **Canary Postcodes**: One representative postcode per council (configured in `SYNTHETIC_CANARY_POSTCODES`)
- **Metrics**: Exported to Prometheus at `/metrics` endpoint (internal network only)

## What Each Check Validates

Each synthetic check performs a full acquisition cycle:

1. **Adapter Invocation**: Calls the adapter's `acquire()` method with canary postcode
2. **Success Criteria**:
   - HTTP 200 response
   - Valid JSON structure
   - Required fields present (address, collections)
   - At least one collection date returned
   - No adapter exceptions
3. **Metrics Recorded**:
   - `synthetic_check_success` (1=success, 0=failure)
   - `synthetic_check_duration_seconds` (histogram)
   - `synthetic_check_total{result="success|failure"}` (counter)

## Reading Synthetic Check Results

### Grafana Dashboard

1. Navigate to Grafana: `http://localhost:3001` (local) or production URL
2. Open "Adapter Health Overview" dashboard
3. Check the **Synthetic Check Status** panel
4. Green = passing, Red = failing

### Prometheus Queries

```promql
# Current status for all councils
synthetic_check_success

# Success rate over last hour
rate(synthetic_check_total{result="success"}[1h])
 / 
rate(synthetic_check_total[1h])

# Failed checks in last 24 hours
sum(increase(synthetic_check_total{result="failure"}[24h])) by (council_id)

# Average check duration by council
avg(synthetic_check_duration_seconds) by (council_id)
```

### API Endpoint

Query the API directly (internal network only):

```bash
curl http://api:3000/v1/councils/{council_id}/health
```

Response:
```json
{
  "council_id": "southampton",
  "status": "healthy",
  "confidence_score": 0.95,
  "last_check": "2024-03-25T14:30:00Z",
  "synthetic_check": {
    "status": "passing",
    "last_success": "2024-03-25T14:25:00Z",
    "duration_ms": 1234
  }
}
```

## Manual Trigger

To manually trigger a synthetic check (for debugging):

### Local Development

```bash
# SSH into monitor container
docker exec -it deploy-monitor-1 sh

# Run single check for one council
node dist/workers/synthetic-monitor.js --council southampton --once

# Run all checks once
node dist/workers/synthetic-monitor.js --once
```

### Production (Azure Container Apps)

```bash
# Execute command in running container
az containerapp exec \
  --name hampshire-bin-monitor \
  --resource-group hampshire-bin-prod \
  --command "node dist/workers/synthetic-monitor.js --once"
```

## Interpreting Failures

### Failure: "Adapter returned no collections"

**Cause**: Adapter ran successfully but returned empty results

**Actions**:
1. Verify canary postcode is still valid for that council
2. Check if council website is down
3. Review adapter logs for warnings
4. Test postcode manually on council website

### Failure: "Adapter timeout"

**Cause**: Acquisition took longer than timeout threshold (default: 30s)

**Actions**:
1. Check council website performance
2. Review network connectivity
3. Inspect browser automation logs (if Playwright adapter)
4. Consider increasing timeout for this council

### Failure: "Schema validation error"

**Cause**: Returned data doesn't match expected schema (potential drift)

**Actions**:
1. Review `adapter_drift_total` metrics for this council
2. Check drift detection logs
3. Follow [Drift Response Runbook](./drift-response.md)
4. May indicate website changes

### Failure: "Adapter unavailable"

**Cause**: Adapter crashed or failed to initialize

**Actions**:
1. Check adapter error logs
2. Verify kill switch is not enabled
3. Review recent adapter deployments
4. Check container health and resources

## Canary Postcode Management

### Adding a New Canary Postcode

1. Identify a representative postcode for the council
2. Verify it returns consistent data
3. Update environment variable:

```bash
# In deploy/docker-compose.yml (local)
SYNTHETIC_CANARY_POSTCODES: "SO16 0AS,PO1 2DX,NEW_POSTCODE"

# In Terraform (production)
# infra/terraform/environments/prod/main.tf
synthetic_canary_postcodes = "SO16 0AS,PO1 2DX,NEW_POSTCODE"
```

4. Restart monitor container
5. Verify new check appears in metrics

### Changing a Canary Postcode

If a postcode becomes invalid (address demolished, etc.):

1. Find replacement postcode for same council
2. Test replacement manually first
3. Update environment variable (see above)
4. Monitor for 24 hours to ensure stability

## Alerting

Synthetic check failures trigger alerts via Prometheus Alertmanager:

- **Critical**: `SyntheticCheckFailure` - Check failing for 10+ minutes
- **Action**: Follow adapter troubleshooting, enable kill switch if necessary

See [Prometheus alerts](../../deploy/monitoring/alerts/drift-detection.yml) for full alert definitions.

## Maintenance

### Disabling Checks Temporarily

To disable all synthetic checks (e.g., during planned maintenance):

```bash
# Stop monitor container
docker stop deploy-monitor-1

# Or scale to zero in production
az containerapp scale \
  --name hampshire-bin-monitor \
  --resource-group hampshire-bin-prod \
  --min-replicas 0 --max-replicas 0
```

### Viewing Logs

```bash
# Local
docker logs deploy-monitor-1 -f

# Production
az containerapp logs tail \
  --name hampshire-bin-monitor \
  --resource-group hampshire-bin-prod \
  --follow
```

## Related Documentation

- [Drift Response Runbook](./drift-response.md)
- [Adapter Health Monitoring](../../docs/monitoring/adapter-health.md)
- [Prometheus Alerting Rules](../../deploy/monitoring/alerts/drift-detection.yml)
