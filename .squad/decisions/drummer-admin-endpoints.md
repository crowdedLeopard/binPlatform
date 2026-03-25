# Decision: Admin Endpoints for Adapter Management

**Date:** 2026-03-25  
**Status:** Implemented  
**Decider:** Drummer (DevOps/Infrastructure Engineer)  
**Stakeholders:** crowdedLeopard (owner), entire team  

---

## Context and Problem Statement

When a council changes their website structure, collection schedules become unavailable and users get incorrect data. The team needs operational tools to:

1. **Detect** when an adapter stops working (health checks, drift detection)
2. **Diagnose** why it failed (deep health checks, test requests)
3. **Respond** quickly (disable broken adapters, enable fixed ones)

Without these tools, the team would need to:
- Wait for user complaints to discover failures
- Deploy code changes to disable broken adapters
- Manually test each adapter after council website changes
- Lack visibility into which adapters are healthy

This creates poor user experience (bad data served) and slow incident response (hours instead of minutes).

---

## Decision Drivers

- **Speed of response:** Disable broken adapters in <5 minutes
- **Operational visibility:** See health of all 13 councils at a glance
- **Drift detection:** Detect upstream schema changes before they break production
- **Zero-downtime management:** Enable/disable adapters without redeployment
- **Security:** Admin operations must be authenticated
- **Simplicity:** In-memory state acceptable (not mission-critical to persist)

---

## Considered Options

### Option 1: Admin Endpoints (Selected)
- **Pros:** Fast to implement, RESTful, integrates with existing API, simple auth
- **Cons:** In-memory state lost on restart, requires admin key management
- **Decision:** Chosen - best balance of speed and utility

### Option 2: Admin CLI Tool
- **Pros:** No HTTP exposure, could use SSH key auth
- **Cons:** Requires SSH access to production, harder to integrate with dashboards
- **Rejected:** Too slow for incident response

### Option 3: Database-backed Admin Panel
- **Pros:** Persistent state, audit trail, could add UI
- **Cons:** Overengineered for MVP, adds complexity and DB dependencies
- **Rejected:** Can add later if needed

### Option 4: GitHub Actions Workflow Dispatch
- **Pros:** Uses existing auth (GitHub), version controlled
- **Cons:** Too slow (30s+ to trigger), no real-time health checks
- **Rejected:** Not suitable for incident response

---

## Decision Outcome

**Chosen Option:** Admin Endpoints (Option 1)

Implemented 7 HTTP endpoints in `src/api/server.ts`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/admin/adapters` | GET | List all adapter statuses |
| `/v1/admin/adapters/:id/health` | GET | Deep health check (calls `verifyHealth()`) |
| `/v1/admin/adapters/:id/drift-check` | POST | Detect schema drift with hash comparison |
| `/v1/admin/adapters/:id/disable` | POST | Runtime disable (no redeploy) |
| `/v1/admin/adapters/:id/enable` | POST | Runtime enable |
| `/v1/admin/drift` | GET | Mass drift check (all councils) |
| `/v1/admin/adapters/:id/test` | GET | Test with sample postcode |

**Authentication:** `X-Admin-Key` header checked against `BOOTSTRAP_ADMIN_KEY` environment variable.

**State Management:**
- `disabledAdapters`: Map<councilId, { reason, disabled_at }>
- `schemaSnapshots`: Map<councilId, { hash, captured_at }>
- `lastDriftCheck`: { checked_at, total, ok, drifted, unreachable, results }

All state is **in-memory** (lost on restart). This is acceptable because:
1. Disabled adapters should be fixed and re-enabled quickly (not permanent)
2. Drift snapshots auto-update (always comparing to previous check)
3. Restart clears temporary state (forces fresh baseline)

---

## Consequences

### Positive

1. **Incident Response:** Disable broken adapter in <30 seconds (vs. hours for redeploy)
2. **Proactive Monitoring:** Detect drift before it breaks production
3. **Operational Visibility:** Status page shows drift status and implementation state
4. **Testing:** Test individual adapters with real postcodes on-demand
5. **Simplicity:** No database dependencies, no persistent state to manage
6. **Integration-ready:** Can be called from Grafana dashboards, monitoring alerts

### Negative

1. **State Loss on Restart:** Disabled adapters re-enable, drift snapshots reset
   - **Mitigation:** Document disabled adapters in runbook, fix quickly
2. **Single Admin Key:** No granular permissions (all-or-nothing access)
   - **Mitigation:** Rotate key quarterly, store in Key Vault
3. **No Audit Trail:** No record of who disabled/enabled adapters
   - **Mitigation:** Add structured logging to admin operations
4. **Rate Limiting:** Drift checks make real requests (could trigger rate limits)
   - **Mitigation:** Mass drift check includes delays, respects adapter rate limits

---

## Implementation Details

### Test Postcodes (`data/test-postcodes.json`)
```json
{
  "basingstoke-deane": "RG21 4AF",
  "eastleigh": "SO50 5SF",
  "portsmouth": "PO1 3AH",
  // ... all 13 councils
}
```

Used by drift detection and test endpoints. These are **public postcodes** (no PII).

### Schema Drift Detection Algorithm

1. Make test request with sample postcode
2. Hash response data: `SHA-256(JSON.stringify(data))`
3. Compare to stored snapshot
4. If different: mark as drifted, update snapshot
5. Return: `{ drifted: boolean, details: string, recommendation: string }`

**Hash changes indicate:**
- Council changed response structure (field added/removed/renamed)
- Council changed data format (dates, service names)
- Adapter needs review and potential fix

### Status Page Enhancement

Added "Drift Status" section:
- Last check timestamp
- Adapters OK: "10 / 13"
- Drifted: 2 (red if > 0)
- Unreachable: 1 (orange if > 0)

Changed "Hampshire Councils" table:
- "Adapter Status" → "Implementation"
- Shows: Implemented | Stub | Not Implemented

---

## Security Considerations

1. **Authentication:** Single admin key in environment variable
   - Not committed to git
   - Rotated quarterly
   - Stored in Azure Key Vault in production
   
2. **CORS:** Added `X-Admin-Key` to `allowedHeaders` (required for browser clients)

3. **Rate Limiting:** Admin endpoints use same rate limit pool as public API
   - Prevents abuse even with valid admin key
   
4. **No Public Exposure:** Admin endpoints NOT documented in public API docs
   - Discoverable only by authorized operators

5. **Real Requests:** Drift checks hit real council websites
   - Rate limiting still applies
   - Evidence stored (audit trail)

---

## Future Enhancements

1. **Persistent State:** Store drift snapshots in PostgreSQL
   - Track drift history over time
   - Persist disabled state across restarts
   - Audit trail for enable/disable operations

2. **Granular Permissions:** Multiple admin keys with scoped access
   - `read-only`: health checks and drift reports
   - `write`: disable/enable adapters
   - `admin`: all operations

3. **Webhook Notifications:** Alert on drift detection
   - Slack/Teams integration
   - Email notifications
   - PagerDuty for critical drift

4. **Grafana Integration:** Visualize drift over time
   - Dashboard showing drift trends
   - Alert annotations for drift events
   - Health check history graphs

5. **Automated Response:** Auto-disable on repeated failures
   - Kill switch after 3 consecutive health check failures
   - Auto-enable after successful test
   - Configurable thresholds per council

---

## Related Decisions

- **Adapter Registry (Phase 2):** Kill switch infrastructure enabled this
- **Synthetic Monitoring (Phase 3):** Canary postcodes used for drift checks
- **Observability Stack:** Prometheus metrics could track drift events
- **Disaster Recovery:** Admin operations documented in runbooks

---

## References

- Implementation: `src/api/server.ts` (lines 497-820)
- Test Postcodes: `data/test-postcodes.json`
- Commit: 9aa6937 "feat: add admin endpoints for adapter management"
- Documentation: `.squad/agents/drummer/history.md` (2026-03-25 entry)

---

## Validation

**Testing:**
- ✓ TypeScript compilation clean (no errors)
- ✓ All 7 endpoints added to server.ts
- ✓ Test postcodes created for all 13 councils
- ✓ Status page updated with drift section
- ⏳ Manual endpoint testing (requires running server)
- ⏳ Integration tests (future work)

**Documentation:**
- ✓ History updated with operational usage examples
- ✓ Decision document created
- ⏳ OpenAPI spec update (future work)
- ⏳ Runbook for admin operations (future work)

**Production Readiness:**
- ✓ Authentication implemented
- ✓ Error handling (404, 500, 401)
- ✓ CORS headers updated
- ⏳ Environment variable `BOOTSTRAP_ADMIN_KEY` set in production
- ⏳ Load testing admin endpoints
- ⏳ Runbook for incident response using admin endpoints

---

**Approval:** Implemented by Drummer, reviewed by Squad  
**Next Review:** After first production incident requiring admin endpoints
