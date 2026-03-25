# Load Testing Guide — Hampshire Bin Collection Platform

## Overview

This directory contains load test scenarios designed to validate the platform's performance under realistic and adversarial traffic patterns.

**Tool:** [k6](https://k6.io/) — Modern load testing framework with JavaScript DSL

**Purpose:** Verify the platform can handle expected load while maintaining response times and detecting abuse patterns.

---

## Installation

### Option 1: npm (recommended)
```bash
npm install -g k6
```

### Option 2: Docker
```bash
docker pull grafana/k6:latest
```

### Option 3: Homebrew (macOS)
```bash
brew install k6
```

---

## Test Scenarios

| Scenario | File | Purpose | Expected Result |
|----------|------|---------|-----------------|
| Cached Lookup | `scenarios/cached-lookup.js` | Most traffic hits cached data | p95 < 200ms, error rate < 0.1% |
| Address Resolution | `scenarios/address-resolution.js` | Expensive postcode→address lookup | p95 < 2s, enumeration detection doesn't false-positive |
| Abuse Simulation | `scenarios/abuse-simulation.js` | Bot-like sequential enumeration | Rate limiting kicks in (429s expected) |

---

## Running Tests

### Run a single scenario
```bash
k6 run scenarios/cached-lookup.js
```

### Run with custom environment
```bash
BASE_URL=https://staging.binday.example.com k6 run scenarios/cached-lookup.js
```

### Run with Docker
```bash
docker run -i grafana/k6 run - <scenarios/cached-lookup.js
```

### Run all scenarios
```bash
for scenario in scenarios/*.js; do
  echo "Running $scenario..."
  k6 run "$scenario"
done
```

---

## Interpreting Results

### Success Criteria

**Cached Lookup:**
- ✅ `http_req_duration{p(95)} < 200ms` — 95th percentile under 200ms
- ✅ `http_req_failed < 0.1%` — Less than 0.1% errors
- ✅ `http_reqs > 1000/s` — Sustained throughput

**Address Resolution:**
- ✅ `http_req_duration{p(95)} < 2000ms` — 95th percentile under 2s
- ✅ Enumeration detection doesn't block legitimate traffic
- ✅ No database connection exhaustion

**Abuse Simulation:**
- ✅ `http_resp_status{429} > 50%` — Rate limiting activates
- ✅ Platform remains responsive (no crash/hang)
- ✅ Security events logged for enumeration attempts

### Key Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `http_req_duration` | Response time distribution | p95 < 200ms (cached), p95 < 2s (uncached) |
| `http_req_failed` | Failed request rate | < 0.1% for legitimate traffic |
| `http_reqs` | Requests per second | > 1000/s sustained |
| `vus` | Virtual users | Scenario-specific (10-50) |
| `data_received` | Bytes received | Monitor for anomalies |

### Failure Modes

**🔴 Connection Errors:** Check network/firewall rules, container health

**🔴 High p95 (> 500ms):** Database slow queries, insufficient cache warming, connection pool exhaustion

**🔴 429s on Legitimate Traffic:** Rate limits too aggressive, adjust thresholds

**🔴 500s:** Application errors, check logs for stack traces

---

## Test Data

**Test API Key:** `hbp_test_loadtest_12345678abcdefgh`  
(Configure in environment or test fixtures)

**Test Postcodes:**
- `SO50 1AA` — Southampton (Eastleigh adapter, API-based, fast)
- `GU14 6AB` — Farnborough (Rushmoor adapter, browser-based, slow)
- `PO1 1AA` — Portsmouth (dual-mode adapter)

**Test Property IDs:**
- `550e8400-e29b-41d4-a716-446655440000` — Cached property
- `6ba7b810-9dad-11d1-80b4-00c04fd430c8` — Uncached property

---

## Load Test Best Practices

### 1. **Ramp-Up Gradually**
Don't spike to max load immediately. Use k6's `stages` to ramp up:

```javascript
export const options = {
  stages: [
    { duration: '1m', target: 10 },  // Ramp to 10 VUs
    { duration: '3m', target: 50 },  // Ramp to 50 VUs
    { duration: '1m', target: 0 },   // Ramp down
  ],
};
```

### 2. **Warm Up Cache**
Run a warm-up phase before measuring:

```javascript
export function setup() {
  // Warm up cache with common requests
  http.get(`${BASE_URL}/v1/councils`);
}
```

### 3. **Realistic Think Time**
Add sleep between requests to simulate real users:

```javascript
sleep(randomIntBetween(1, 5));
```

### 4. **Monitor During Test**
Watch platform metrics in real-time:
- CPU/memory usage (container orchestrator)
- Database connection count
- Cache hit rate (Redis metrics)
- Error rate (application logs)

### 5. **Run Against Staging First**
Never run load tests against production without planning.

---

## Continuous Load Testing

### GitHub Actions Integration

Create `.github/workflows/load-test.yml`:

```yaml
name: Load Test (Nightly)

on:
  schedule:
    - cron: '0 2 * * *'  # 2 AM daily

jobs:
  load-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run k6 load tests
        uses: grafana/k6-action@v0.3.0
        with:
          filename: tests/load/scenarios/cached-lookup.js
        env:
          BASE_URL: ${{ secrets.STAGING_BASE_URL }}
          API_KEY: ${{ secrets.LOAD_TEST_API_KEY }}
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: k6-results
          path: summary.json
```

---

## Tuning Recommendations

### If p95 > Target

1. **Check database query performance:** Use `EXPLAIN ANALYZE` on slow queries
2. **Increase cache TTL:** Reduce upstream adapter calls
3. **Add database indexes:** Especially on `postcode`, `council_id`
4. **Scale horizontally:** Add more API server replicas
5. **Enable CDN caching:** For `/v1/councils` endpoint

### If Error Rate > 0.1%

1. **Check logs for root cause:** Application errors, database timeouts, adapter failures
2. **Increase database connection pool:** `max_connections` in Postgres
3. **Add circuit breakers:** Fail fast on adapter failures
4. **Implement graceful degradation:** Return cached data even if stale

### If Rate Limiting Too Aggressive

1. **Review enumeration detection thresholds:** 51/15min may be too low
2. **Whitelist legitimate IPs:** Known partners, monitoring services
3. **Implement API key tiers:** Higher limits for premium users

---

## Advanced Scenarios

### Spike Test
Sudden traffic surge (e.g., news article mentioning platform):

```javascript
export const options = {
  stages: [
    { duration: '10s', target: 100 },  // Immediate spike
    { duration: '1m', target: 100 },   // Sustain
    { duration: '10s', target: 0 },    // Drop
  ],
};
```

### Soak Test
Long-duration test to detect memory leaks:

```javascript
export const options = {
  vus: 20,
  duration: '24h',  // Run for 24 hours
};
```

### Stress Test
Find breaking point:

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },
    { duration: '5m', target: 200 },
    { duration: '2m', target: 400 },   // Push to failure
    { duration: '5m', target: 400 },
    { duration: '2m', target: 0 },
  ],
};
```

---

## Troubleshooting

### `ECONNREFUSED`
**Cause:** Platform not running or incorrect `BASE_URL`  
**Fix:** Verify platform is up, check URL/port

### `dial tcp: lookup localhost: no such host` (Docker)
**Cause:** Docker can't resolve `localhost`  
**Fix:** Use `host.docker.internal` or actual IP

### `context deadline exceeded`
**Cause:** Requests timing out  
**Fix:** Increase timeout in scenario or investigate slow responses

### `too many open files`
**Cause:** OS file descriptor limit  
**Fix:** `ulimit -n 65536` before running k6

---

## Metrics Export

### JSON Output
```bash
k6 run --out json=results.json scenarios/cached-lookup.js
```

### InfluxDB + Grafana
```bash
k6 run --out influxdb=http://localhost:8086/k6 scenarios/cached-lookup.js
```

### CSV (custom)
```bash
k6 run scenarios/cached-lookup.js --summary-export=summary.json
```

---

## Further Reading

- [k6 Documentation](https://k6.io/docs/)
- [k6 Thresholds](https://k6.io/docs/using-k6/thresholds/)
- [Load Testing Best Practices](https://k6.io/docs/testing-guides/test-types/)
- [k6 Cloud](https://k6.io/cloud/) — Managed k6 with distributed execution

---

**Last Updated:** 2024-03-25  
**Maintained by:** Bobbie (QA Engineer)
