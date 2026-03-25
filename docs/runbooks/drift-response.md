# Drift Response Runbook

## Overview

Schema drift occurs when a council website changes its structure, causing adapter parsing to fail or return incomplete data. This runbook provides step-by-step response procedures for different drift severities.

## Drift Severity Levels

### Minor Drift (Low Severity)
- **Definition**: Small changes that don't affect data extraction
- **Examples**: CSS class rename, new optional field, layout changes
- **Impact**: No data loss, confidence score stable
- **Alert**: None (logged only)
- **Action**: Monitor, fix in next scheduled update

### Major Drift (Medium Severity)
- **Definition**: Changes affecting data quality or completeness
- **Examples**: Field moved, date format changed, partial selector breakage
- **Impact**: Reduced confidence score (50-80%), some data missing
- **Alert**: `AdapterConfidenceDegraded` (warning)
- **Action**: Investigate within 4 hours, fix within 24 hours

### Breaking Drift (Critical Severity)
- **Definition**: Changes preventing any data extraction
- **Examples**: Complete page redesign, API endpoint removed, authentication required
- **Impact**: Adapter fails completely, confidence score < 50% or errors
- **Alert**: `AdapterSchemaBreakingDrift` (critical)
- **Action**: Immediate response required

## Detection Methods

### 1. Automated Detection (Drift Detector)

The drift detection system continuously validates:
- Expected DOM selectors exist
- Response structure matches schema
- Required fields are populated
- Date formats are consistent
- Collection types are recognized

Metrics:
```promql
# Total drift events by type
adapter_drift_total{council_id="southampton", drift_type="breaking"}

# Breaking drift (requires immediate action)
adapter_drift_breaking_total > 0
```

### 2. Synthetic Monitoring

Canary postcodes run every 5 minutes, detecting:
- Complete adapter failures
- Empty results
- Schema validation errors
- Timeout increases

### 3. Confidence Score

Real-time data quality score (0.0 - 1.0):
- **1.0**: Perfect data quality
- **0.8-0.99**: Minor issues
- **0.5-0.79**: Major issues (investigate)
- **< 0.5**: Breaking issues (immediate action)

## Response Procedures

---

## Minor Drift Response

**Timeline**: Address in next maintenance window (within 7 days)

### Step 1: Verify Drift
```bash
# Check drift metrics
curl -s http://prometheus:9090/api/v1/query?query='adapter_drift_total{council_id="COUNCIL_ID",drift_type="minor"}' | jq

# Review drift detection logs
docker logs deploy-monitor-1 | grep "drift_type=minor" | grep "COUNCIL_ID"
```

### Step 2: Document Drift
Create issue in GitHub:
- Title: `[DRIFT] Minor drift detected: {council_id}`
- Label: `drift`, `low-priority`
- Include: drift metrics, logs, confidence score trend

### Step 3: Schedule Fix
Add to next sprint backlog, no immediate action required.

---

## Major Drift Response

**Timeline**: Investigate within 4 hours, fix within 24 hours

### Step 1: Immediate Assessment (0-30 min)

```bash
# 1. Check current adapter health
curl http://api:3000/v1/councils/COUNCIL_ID/health

# 2. Review drift metrics
curl -s 'http://prometheus:9090/api/v1/query?query=adapter_confidence_score{council_id="COUNCIL_ID"}' | jq

# 3. Review recent logs
docker logs deploy-monitor-1 --since 2h | grep COUNCIL_ID
```

### Step 2: Identify Root Cause (30-60 min)

```bash
# 1. Visit council website manually
# Check if website structure has changed

# 2. Test adapter locally
npm run adapter:test -- --council COUNCIL_ID --postcode "TEST_POSTCODE"

# 3. Compare with last successful run
# Check evidence blob storage for last good response
az storage blob download \
  --container evidence \
  --name "councils/COUNCIL_ID/latest.json" \
  --file /tmp/evidence.json
```

### Step 3: Apply Quick Fix (1-4 hours)

**Option A: Update Selectors**
```typescript
// In src/adapters/{council}/adapter.ts
// Update DOM selectors to match new structure
const collectionDate = await page.locator('.new-selector-path').textContent();
```

**Option B: Adjust Parsing Logic**
```typescript
// Update date parsing if format changed
const date = parseDateFlexible(rawDate, [
  'DD/MM/YYYY',
  'DD-MM-YYYY', // New format
]);
```

### Step 4: Test & Deploy

```bash
# 1. Run unit tests
npm run test -- src/adapters/COUNCIL_ID

# 2. Run integration test
npm run test:integration -- --grep "COUNCIL_ID"

# 3. Run synthetic check manually
npm run synthetic:test -- --council COUNCIL_ID

# 4. Create PR with "drift-fix" label
git checkout -b drift-fix/COUNCIL_ID
git add .
git commit -m "fix(COUNCIL_ID): address major schema drift

- Updated selectors for new page structure
- Adjusted date parsing logic
- Confidence score restored to 0.95+

Fixes #ISSUE_NUMBER"

# 5. Merge after CI passes
```

### Step 5: Monitor Recovery

```bash
# Watch confidence score recovery (expect 0.9+ within 1 hour)
watch -n 60 'curl -s "http://prometheus:9090/api/v1/query?query=adapter_confidence_score{council_id=\"COUNCIL_ID\"}" | jq'
```

---

## Breaking Drift Response (CRITICAL)

**Timeline**: Immediate action, enable kill switch within 15 minutes

### Step 1: Immediate Containment (0-15 min)

```bash
# 1. Enable kill switch IMMEDIATELY
# Prevents bad data from entering system
curl -X POST http://api:3000/admin/adapters/COUNCIL_ID/kill-switch \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"enabled": true, "reason": "Breaking drift detected"}'

# Verify kill switch active
curl http://api:3000/v1/councils/COUNCIL_ID/health
# Should return: "status": "disabled"

# 2. Create incident ticket
# High priority, assign to on-call engineer
```

### Step 2: Assess Impact (15-30 min)

```bash
# 1. Check error rate
curl -s 'http://prometheus:9090/api/v1/query?query=rate(adapter_acquisitions_total{council_id="COUNCIL_ID",status="failure"}[1h])' | jq

# 2. Count affected users (if any)
psql $DATABASE_URL -c "
  SELECT COUNT(DISTINCT property_id)
  FROM collections
  WHERE council_id = 'COUNCIL_ID'
    AND updated_at > NOW() - INTERVAL '24 hours';
"

# 3. Notify stakeholders
# Send alert to ops channel with impact summary
```

### Step 3: Root Cause Analysis (30-90 min)

```bash
# 1. Capture current website state
# Take full-page screenshot
npx playwright screenshot https://councilwebsite.example.com/binday /tmp/council-screenshot.png

# 2. Compare with last working version
# Check Internet Archive / cached version
curl "https://web.archive.org/web/TIMESTAMP/https://councilwebsite.example.com/binday"

# 3. Identify exact changes
# Document all structural changes in incident ticket
```

### Step 4: Remediation Options

**Option A: Quick Adapter Update (preferred if possible)**

If changes are straightforward:

```typescript
// Complete rewrite of affected parsing logic
// Test extensively before deploying

// Example: council switched from HTML scraping to API
const response = await fetch('https://council.example.com/api/collections', {
  method: 'POST',
  body: JSON.stringify({ postcode }),
});
const data = await response.json();
```

**Option B: Temporary Fallback**

If fix will take > 4 hours:

```bash
# 1. Check if council provides alternative data source
# - API endpoint
# - Download portal
# - iCal feed

# 2. Implement minimal fallback adapter
# Returns partial data (better than none)

# 3. Communicate degraded service to users
```

**Option C: Escalation**

If no fix is possible:

1. **Contact Council**: Request API access or documentation
2. **Community Data**: Check if others have solved this (e.g., OpenStreetMap, civic tech forums)
3. **Manual Workaround**: Provide manual lookup link to users

### Step 5: Deploy Fix

```bash
# 1. Thorough testing required
npm run test -- src/adapters/COUNCIL_ID
npm run test:integration -- --grep "COUNCIL_ID"
npm run synthetic:test -- --council COUNCIL_ID

# 2. Create PR with "breaking-drift" label
# Requires 2 approvals (vs. standard 1)

# 3. Deploy to staging first
# Run synthetic checks for 1 hour

# 4. Deploy to production
# Monitor closely for 24 hours

# 5. Disable kill switch only after 95%+ confidence score
curl -X POST http://api:3000/admin/adapters/COUNCIL_ID/kill-switch \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"enabled": false}'
```

### Step 6: Post-Incident Review

Within 48 hours, document:
- Root cause
- Detection time
- Response time
- Mitigation steps
- Lessons learned
- Prevention measures

Update drift detection rules to catch similar issues earlier.

---

## Drift Prevention

### Proactive Monitoring

```bash
# Weekly automated checks
npm run drift:scan --all-councils

# Subscribe to council website change notifications
# (if available)
```

### Adapter Robustness

```typescript
// Use multiple selectors as fallback
const selector = await page.locator('.primary-selector')
  .or(page.locator('.fallback-selector-1'))
  .or(page.locator('.fallback-selector-2'));

// Flexible date parsing
const date = parseDateFlexible(rawDate, COMMON_FORMATS);

// Validate expected structure
if (!isValidCollectionData(data)) {
  recordDrift('breaking', 'Schema validation failed');
  throw new AdapterError('Invalid data structure');
}
```

### Communication

- Subscribe to council IT bulletins
- Monitor council social media for maintenance notices
- Build relationships with council IT contacts

---

## Escalation Matrix

| Severity  | Response Time | Escalation After | Escalate To       |
|-----------|---------------|------------------|-------------------|
| Minor     | 7 days        | 14 days          | Team lead         |
| Major     | 4 hours       | 24 hours         | On-call engineer  |
| Breaking  | Immediate     | 15 min           | Incident manager  |

## Related Documentation

- [Synthetic Monitoring Runbook](./synthetic-monitoring.md)
- [Adapter Development Guide](../../docs/adapters/development.md)
- [Prometheus Alerting Rules](../../deploy/monitoring/alerts/drift-detection.yml)
