# Adapter Change Process

**Date:** 2026-03-25  
**Author:** Holden (Lead Architect)  
**Status:** Active  
**Type:** Operations Runbook

## Overview

This document describes the process for handling council website/API changes without code deployments. The adapter resilience layer enables operational response to endpoint changes via configuration updates.

---

## When to Use This Process

Use this process when:

1. **A council changes their API URL** (base URL or endpoint path)
2. **API parameters change** (new required params, renamed params)
3. **An adapter starts failing** and you need to disable it quickly
4. **Schema drift is detected** and you need to investigate
5. **A council switches from form-based to API** (or vice versa)

**Do NOT use this process for:**
- New adapter development (requires code changes)
- Parser logic changes (requires code changes)
- Security issues (use kill switches, not config)

---

## Quick Reference

### Emergency: Disable a Broken Adapter (< 1 minute)

```bash
# Option 1: Environment variable (requires server restart)
export ADAPTER_KILL_SWITCH_EASTLEIGH=true
systemctl restart binday

# Option 2: Config file (no restart needed)
# Edit data/adapter-config.json:
{
  "eastleigh": {
    ...
    "enabled": false,
    ...
  }
}
# Changes take effect immediately (hot-reload)
```

### Standard: Update Adapter Endpoint (5 minutes)

1. Edit `data/adapter-config.json`
2. Update `base_url`, `address_lookup_path`, or `collection_lookup_path`
3. Update `last_verified` to today's date
4. Test with drift detector: `npm run drift-check eastleigh`
5. Commit to git: `git commit -am "fix: update eastleigh endpoint"`

---

## Detailed Procedures

### Procedure 1: Update API Endpoint URL

**Scenario:** Eastleigh Borough Council moved their API from `my.eastleigh.gov.uk` to `api.eastleigh.gov.uk`

**Steps:**

1. **Locate the adapter config:**
   ```bash
   vim data/adapter-config.json
   # Or use your favorite editor
   ```

2. **Update the base_url:**
   ```json
   {
     "eastleigh": {
       "council_id": "eastleigh",
       "display_name": "Eastleigh Borough Council",
       "base_url": "https://api.eastleigh.gov.uk",  // CHANGED
       "collection_lookup_path": "/apex/EBC_Waste_Calendar",
       ...
       "last_verified": "2026-03-25",  // UPDATE THIS
       "notes": "Endpoint moved to api subdomain on 2026-03-25"
     }
   }
   ```

3. **Test the change:**
   ```bash
   npm run drift-check eastleigh
   # Or manually:
   curl "https://api.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=100060000001"
   ```

4. **Verify with real request:**
   ```bash
   curl http://localhost:3000/api/v1/councils/eastleigh/collections?postcode=SO50%205SF
   ```

5. **Update schema snapshot (if response structure changed):**
   ```bash
   npm run update-snapshot eastleigh
   # This captures the new schema baseline
   ```

6. **Commit the change:**
   ```bash
   git add data/adapter-config.json
   git commit -m "fix: update eastleigh base URL to api.eastleigh.gov.uk"
   git push origin master
   ```

**Rollback:** Revert the commit and the old URL will be restored immediately (hot-reload).

---

### Procedure 2: Change API Parameters

**Scenario:** Fareham changed their API broker ID from `64866b1e0b7f8` to `NEW_ID_12345`

**Steps:**

1. **Update collection_lookup_params:**
   ```json
   {
     "fareham": {
       ...
       "collection_lookup_params": { "id": "NEW_ID_12345" },
       "last_verified": "2026-03-25",
       "notes": "API broker ID updated on 2026-03-25 (council migration)"
     }
   }
   ```

2. **Test and commit** (same as Procedure 1)

---

### Procedure 3: Disable Adapter (Emergency)

**Scenario:** New Forest adapter started returning 500 errors at 2am, causing platform failures

**Steps:**

1. **Option A: Config file (recommended, no restart):**
   ```bash
   # Edit data/adapter-config.json
   vim data/adapter-config.json
   ```
   
   ```json
   {
     "new-forest": {
       ...
       "enabled": false,
       "notes": "DISABLED 2026-03-25 02:15 - 500 errors, investigating"
     }
   }
   ```
   
   ```bash
   git commit -am "ops: disable new-forest adapter (500 errors)"
   git push
   ```

2. **Option B: Environment variable (requires restart):**
   ```bash
   export ADAPTER_KILL_SWITCH_NEW_FOREST=true
   systemctl restart binday
   # Or for all adapters:
   export ADAPTER_KILL_SWITCH_GLOBAL=true
   systemctl restart binday
   ```

**Effect:**
- Requests to `/api/v1/councils/new-forest/*` return 503 (Service Unavailable)
- Drift checks skip the disabled adapter
- Registry filters out the adapter from listing APIs

**Re-enable:**
```json
{
  "new-forest": {
    ...
    "enabled": true,
    "notes": "Re-enabled 2026-03-25 09:00 - issue resolved"
  }
}
```

---

### Procedure 4: Investigate Schema Drift

**Scenario:** Drift detector reports schema changed for Rushmoor adapter

**Steps:**

1. **Review the drift report:**
   ```bash
   npm run drift-check rushmoor
   # Output:
   # councilId: rushmoor
   # status: drifted
   # schemaChanged: true
   # changedFields: ["+newField", "-oldField"]
   ```

2. **Fetch a sample response:**
   ```bash
   curl "https://www.rushmoor.gov.uk/apibroker/runLookup?id=5e0b03b4e7c16&bin_postcode=GU14%206BU"
   ```

3. **Compare against stored snapshot:**
   ```bash
   cat data/schema-snapshots.json | jq '.[] | select(.councilId == "rushmoor")'
   ```

4. **Decision tree:**

   **If change is cosmetic** (new field added, no breaking changes):
   - Update the schema snapshot: `npm run update-snapshot rushmoor`
   - Update `last_verified` in config
   - Commit: `git commit -am "chore: update rushmoor schema snapshot (new field added)"`

   **If change is breaking** (required field removed, type changed):
   - Update parser code in `src/adapters/rushmoor/parser.ts`
   - Run tests: `npm test -- rushmoor`
   - Update snapshot after parser is fixed
   - Commit code and config together

   **If change is unknown/unclear:**
   - Disable adapter temporarily (Procedure 3)
   - Open GitHub issue for investigation
   - Contact council to confirm change

---

### Procedure 5: Migrate from HTML Scraper to API

**Scenario:** Winchester launched an API, replacing their React SPA scraper

**Steps:**

1. **Update config to API-based:**
   ```json
   {
     "winchester": {
       "council_id": "winchester",
       "display_name": "Winchester City Council",
       "base_url": "https://api.winchester.gov.uk",
       "collection_lookup_path": "/waste/collections",
       "collection_lookup_params": {},
       "method": "GET",
       "response_format": "json",  // Changed from "html"
       "postcode_param": "postcode",
       "property_param": "uprn",
       "enabled": false,  // Keep disabled until code updated
       "last_verified": "2026-03-25",
       "notes": "Migrating from browser scraper to API - code changes in progress"
     }
   }
   ```

2. **Update TypeScript implementation:**
   - Create new parser in `src/adapters/winchester/api-parser.ts`
   - Update `src/adapters/winchester/index.ts` to use API instead of browser
   - Write tests for API response parsing

3. **Test thoroughly:**
   ```bash
   npm test -- winchester
   npm run drift-check winchester
   ```

4. **Enable in config:**
   ```json
   {
     "winchester": {
       ...
       "enabled": true,
       "notes": "Migrated to API on 2026-03-25"
     }
   }
   ```

5. **Commit code + config:**
   ```bash
   git add src/adapters/winchester data/adapter-config.json
   git commit -m "feat: migrate winchester to API-based adapter"
   ```

---

## Configuration Reference

### data/adapter-config.json Structure

```json
{
  "COUNCIL_ID": {
    "council_id": "string (must match key)",
    "display_name": "string (human-readable name)",
    "base_url": "string (https://... no trailing slash)",
    "address_lookup_path": "string | null (path for address search)",
    "address_lookup_params": "object | null (query params)",
    "collection_lookup_path": "string | null (path for collections)",
    "collection_lookup_params": "object | null (query params)",
    "method": "GET | POST (HTTP method)",
    "response_format": "json | html (response type)",
    "postcode_param": "string | null (query param name for postcode)",
    "property_param": "string | null (query param name for UPRN)",
    "enabled": "boolean (runtime on/off switch)",
    "last_verified": "YYYY-MM-DD (when config was last validated)",
    "schema_hash": "string | null (16-char hash, managed by drift detector)",
    "notes": "string (free-form documentation)"
  }
}
```

### Kill Switch Environment Variables

```bash
# Global kill switch (disables all adapters)
ADAPTER_KILL_SWITCH_GLOBAL=true

# Per-adapter kill switches (replace hyphens with underscores, uppercase)
ADAPTER_KILL_SWITCH_EASTLEIGH=true
ADAPTER_KILL_SWITCH_NEW_FOREST=true
ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE=true
```

**Precedence:** Env vars override config. If both are set, env var wins.

---

## Monitoring & Alerts

### Daily Drift Check

**Cron job** (run daily at 3am):
```bash
0 3 * * * cd /path/to/binday && npm run drift-check-all >> /var/log/binday/drift.log 2>&1
```

**Alert on drift:**
```bash
# In cron script:
RESULTS=$(npm run drift-check-all --json)
DRIFTED=$(echo "$RESULTS" | jq '[.results[] | select(.status == "drifted")] | length')

if [ "$DRIFTED" -gt 0 ]; then
  echo "ALERT: $DRIFTED adapters drifted" | mail -s "BinDay Drift Alert" ops@example.com
fi
```

### Dashboard

View drift status at: `http://localhost:3000/admin/drift` (if admin UI exists)

Or query API:
```bash
curl http://localhost:3000/api/v1/drift/status
```

---

## Troubleshooting

### Config changes not taking effect

**Symptom:** Updated config, but adapter still uses old URL

**Cause:** Config is loaded on each request (hot-reload), but TypeScript code may cache values

**Fix:**
1. Check adapter implementation doesn't cache config
2. Restart server if using environment variables
3. Verify JSON syntax: `cat data/adapter-config.json | jq .`

### Drift detector reports false positives

**Symptom:** Schema marked as drifted, but response looks identical

**Cause:** Schema hashing is sensitive to structure changes (key order, array lengths)

**Fix:**
1. Review `changedFields` in drift report
2. If cosmetic, update snapshot: `npm run update-snapshot COUNCIL_ID`
3. If persistent, increase hash depth limit in `schema-snapshot.ts`

### Adapter disabled but still receiving requests

**Symptom:** Disabled adapter returns errors instead of 503

**Cause:** Registry caches adapters on startup, config changes don't affect already-loaded instances

**Fix:**
1. Use kill switch for immediate effect: `ADAPTER_KILL_SWITCH_X=true`
2. Restart server: `systemctl restart binday`
3. Check `enabled: false` is in correct JSON location

---

## Best Practices

1. **Always update last_verified** when changing config
2. **Use descriptive notes** to document why changes were made
3. **Test before committing** with drift-check or manual curl
4. **Commit config changes to git** for audit trail and rollback
5. **Monitor drift checks** - don't ignore alerts
6. **Coordinate with councils** when possible (get advance notice of changes)
7. **Document in notes field** when council was contacted
8. **Update schema snapshots** after verifying drift is intentional

---

## Related Documentation

- `.squad/decisions.md` - Architectural decisions
- `src/services/schema-snapshot.ts` - Schema hashing algorithm
- `src/services/drift-detector.ts` - Drift detection logic
- `src/adapters/registry.ts` - Hot-reload implementation
- `.squad/agents/holden/history.md` - Implementation history

---

**Change Log:**
- 2026-03-25: Initial version (Holden)
