# Drill 01 — Adapter Compromise

## Scenario

The Eastleigh council adapter has started returning anomalous collection data: wrong bin colours, dates shifted by a week, and in one case a payload containing what appears to be an internal network hostname. Automated monitoring has flagged the adapter as unhealthy. It is unclear whether the adapter code has been tampered with, the upstream council API has been hijacked, or a man-in-the-middle is modifying responses.

The adapter must be taken offline immediately to prevent bad data reaching end users while the root cause is investigated.

---

## Detection

**Automated:** Health check alert fires from `/v1/admin/adapters/health` — Eastleigh adapter status transitions to `degraded` or `suspicious_payload`.

**Manual indicators:**
- User reports of incorrect bin collection dates for Eastleigh postcodes
- Anomalous payloads surfacing in application logs (unexpected field values, hostnames, or binary data)
- Spike in 5xx errors on `/v1/councils/eastleigh/*` endpoints

---

## Steps

### 1 — Confirm the problem (target: < 2 min)

```bash
# Check overall adapter health
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.binday.app/v1/admin/adapters/health | jq .

# Isolate Eastleigh adapter status and last payload sample
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/adapters/health?adapter=eastleigh" | jq .
```

Confirm `status` is not `healthy` and note the `last_checked` timestamp. Copy the `payload_sample` field if present — you will need it for the post-incident review.

### 2 — Activate the kill switch (target: < 5 min from detection)

```bash
# Set the kill switch environment variable on the deployment
# (exact command depends on your deployment platform — examples below)

# Kubernetes / kubectl
kubectl set env deployment/binday-api ADAPTER_KILL_SWITCH_EASTLEIGH=true

# Azure App Service
az webapp config appsettings set \
  --name binday-api \
  --resource-group binday-rg \
  --settings ADAPTER_KILL_SWITCH_EASTLEIGH=true

# Confirm the variable is set before proceeding
kubectl exec deployment/binday-api -- printenv ADAPTER_KILL_SWITCH_EASTLEIGH
```

### 3 — Redeploy / restart to apply the kill switch

```bash
# Kubernetes — rolling restart picks up the new env var
kubectl rollout restart deployment/binday-api

# Watch the rollout complete before moving on
kubectl rollout status deployment/binday-api --timeout=3m
```

### 4 — Verify the adapter is disabled

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.binday.app/v1/councils/eastleigh/health | jq .
```

Expected response:

```json
{
  "status": "disabled",
  "adapter": "eastleigh",
  "reason": "kill_switch_active"
}
```

If status is anything other than `disabled`, do not proceed — re-check the environment variable and restart.

### 5 — Review the audit log

```bash
# Show the last 50 audit events touching the Eastleigh adapter
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/audit?resource=adapter:eastleigh&limit=50" | jq .
```

Look for:
- Unexpected configuration changes
- Unusual source IPs or user agents on adapter config endpoints
- Any `adapter.config.update` events not matching a known deployment

### 6 — Export the last 24 hours of events for the adapter

```bash
# ISO-8601 timestamps — adjust to your timezone offset as needed
START=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
        date -u -v-24H +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/audit/export?resource=adapter:eastleigh&from=${START}&to=${END}" \
  -o eastleigh-audit-$(date +%Y%m%d).json

echo "Exported to eastleigh-audit-$(date +%Y%m%d).json"
```

### 7 — Root cause investigation (parallel with steps 5–6)

- Pull the adapter source and compare it against the last known-good commit:
  ```bash
  git log --oneline adapters/eastleigh/
  git diff HEAD~1 HEAD -- adapters/eastleigh/
  ```
- Check the upstream Eastleigh council API directly (without the adapter) to determine whether the bad data originates upstream or in the adapter layer.
- Review deployment pipeline logs for any unapproved merges or CI jobs touching the Eastleigh adapter.

### 8 — Reset the kill switch after root cause is confirmed

Only reset once you have established the root cause **and** either fixed the underlying issue or confirmed the upstream council API is safe.

```bash
# Kubernetes
kubectl set env deployment/binday-api ADAPTER_KILL_SWITCH_EASTLEIGH-

# Azure App Service
az webapp config appsettings delete \
  --name binday-api \
  --resource-group binday-rg \
  --setting-names ADAPTER_KILL_SWITCH_EASTLEIGH

kubectl rollout restart deployment/binday-api
kubectl rollout status deployment/binday-api --timeout=3m
```

Verify the adapter returns healthy:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.binday.app/v1/councils/eastleigh/health | jq .
```

### 9 — Update adapter security review

Update `docs/runbooks/adapter-security-review.md` with:
- Date and nature of the incident
- Root cause (or "under investigation" if not yet determined)
- Any changes made to the adapter or upstream API configuration

---

## Expected Duration

**15 minutes** from detection to adapter disabled and audit log reviewed.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Adapter disabled (`status: disabled`) | Within **5 minutes** of detection |
| Audit log reviewed and anomalies noted | Within **10 minutes** of detection |
| 24h event export saved | Within **15 minutes** of detection |
| `adapter-security-review.md` updated | Before drill closes |

---

## Post-Incident Actions

- [ ] Commit the exported audit JSON to the incident evidence store (do not leave it only on a local machine)
- [ ] File a bug or incident ticket with root cause, timeline, and remediation
- [ ] If the upstream council API was compromised, notify the Eastleigh council IT contact
- [ ] If adapter code was tampered with, escalate to a full supply-chain security review
- [ ] Re-enable the adapter only after sign-off from the engineering lead
- [ ] Schedule a follow-up health check 24 hours after re-enabling
- [ ] Update `adapter-security-review.md` with final findings

---

## Common Pitfalls

**Kill switch set but not applied** — The environment variable must be picked up by a running process. A `kubectl set env` without a subsequent `rollout restart` will not take effect until the next natural restart. Always restart explicitly and wait for the rollout to complete before verifying.

**Verifying against a cached response** — CDN or proxy caching may return a stale `healthy` response after the kill switch is active. Include a `Cache-Control: no-cache` header or use an internal endpoint that bypasses the CDN.

**Exporting events before the incident window closes** — If you export too early you may miss events that are still being written. Wait at least 60 seconds after the last suspicious activity before exporting.

**Resetting the kill switch before root cause is confirmed** — Pressure to restore the service can lead to premature re-enablement. The success criterion is containment, not recovery. Recovery is a separate decision requiring sign-off.

**Forgetting to update `adapter-security-review.md`** — This document is the living record of adapter risk posture. An incident that isn't recorded here is invisible to the next reviewer.

---

## Drill History

<!-- Append a filled-in log block here after each run. See README.md for the template. -->
