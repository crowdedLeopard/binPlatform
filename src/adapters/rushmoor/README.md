# Rushmoor Borough Council Adapter

**Council ID:** `rushmoor`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ✅ Production Ready

---

## Acquisition Path

### Method: Browser Automation (Playwright)

Rushmoor uses an HTML form-based bin collection lookup. The adapter uses Playwright to automate form submission and parse results.

**Lookup Page:**
```
https://www.rushmoor.gov.uk/recycling-rubbish-and-environment/bins-and-recycling/bin-collection-day-finder/
```

**Workflow:**
1. Navigate to lookup page
2. Fill postcode input field
3. Submit form
4. Parse results (address selection if multiple)
5. Extract collection schedule from results page

---

## Input Requirements

### Primary Input: Postcode

**Format:** UK postcode (e.g., `GU11 1AA`, `GU14 7JF`)

**Validation:**
- Must match UK postcode pattern
- Normalized with single space between outward and inward codes
- Case-insensitive

### Optional: Address Fragment

If postcode returns multiple properties, address fragment can be used to disambiguate.

---

## Service Types Supported

- **General Waste** (Green Bin / Rubbish)
- **Recycling** (Blue Bin)
- **Glass** (Purple Bin / Glass Box)
- **Food Waste** (Weekly caddy collection)
- **Garden Waste** (Subscription service)

---

## Browser Automation Configuration

### Security Hardening

**Allowed Domains:**
- `rushmoor.gov.uk` only

**Timeouts:**
- Navigation: 30 seconds
- Script execution: 15 seconds

**Network Isolation:**
- Allowlist-only (rushmoor.gov.uk)
- Cloud metadata endpoints blocked
- No general internet access

**Sandboxing:**
- Rootless container
- Read-only filesystem (except /tmp)
- Seccomp profile
- CPU/memory limits

**Evidence Capture:**
- Screenshots on failure
- Network request logs
- HTML response storage

---

## Error Handling

### Failure Categories

| Category | Trigger | Recovery |
|----------|---------|----------|
| TIMEOUT | Page load >30s | Retry with backoff |
| NETWORK_ERROR | Connection failure | Check upstream status |
| SCHEMA_DRIFT | Selector not found | Alert for manual review |
| BOT_DETECTION | Blocked navigation | Reduce request rate |
| NOT_FOUND | No results for postcode | Return empty results |

### Page Structure Detection

The adapter handles multiple possible HTML structures:

1. **Select dropdown** for address selection
2. **List items** with links
3. **Table rows** for collection schedule
4. **Div containers** for bin information

If expected selectors are not found, the adapter logs a schema drift warning.

---

## Caching Strategy

### Collection Schedules

**TTL:** 7 days

**Rationale:**
- Collections are weekly/fortnightly
- Browser automation is expensive
- Aggressive caching reduces load

**Cache Key:**
```
rushmoor:property:<councilLocalId>
```

---

## Security Profile

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Browser Automation Required** | Yes |
| **Executes JavaScript** | Yes (rushmoor.gov.uk only) |
| **External Domains** | rushmoor.gov.uk |
| **Handles Credentials** | No |
| **Network Isolation** | Allowlist only |
| **Sandboxed** | Yes |

### Security Concerns

1. **JavaScript Execution:** Executes untrusted JavaScript from rushmoor.gov.uk (sandboxed)
2. **Resource Intensive:** Browser automation requires CPU/memory
3. **Page Structure Changes:** HTML changes will break adapter

---

## Performance Characteristics

### Resource Usage

- **Memory:** ~200-400MB per browser instance
- **CPU:** Moderate during page load
- **Network:** ~500KB-2MB per lookup

### Execution Time

- **Address resolution:** 3-8 seconds
- **Collection schedule:** 5-10 seconds (if address already resolved)
- **Total end-to-end:** 8-15 seconds

**Comparison:**
- Eastleigh (API): 1-2 seconds
- Rushmoor (Browser): 8-15 seconds

**Mitigation:** Aggressive caching (7-day TTL)

---

## Health Check

The adapter verifies health by:

1. Navigating to lookup page
2. Confirming page loads successfully
3. No timeout or network errors

**Test Postcode:** `GU11 1AA` (Rushmoor area)

---

## Kill Switch

Environment variable:

```bash
ADAPTER_KILL_SWITCH_RUSHMOOR=true
```

When enabled, all requests fail immediately.

---

## Evidence Capture

### Evidence Types

1. **Screenshot:** PNG image on failure
2. **HTML:** Full page HTML
3. **Network Logs:** All HTTP requests/responses

**Storage Path:** `rushmoor/<date>/<uuid>.<ext>`  
**Retention:** 90 days (automated deletion)  
**Contains PII:** Yes (address data)

---

## Brittleness Risks

### High Risk

1. **HTML Structure Changes**
   - Form field names change
   - Result selectors change
   - Page layout changes

2. **JavaScript Changes**
   - Dynamic rendering changes
   - XHR endpoint changes
   - Client-side routing changes

### Medium Risk

3. **Cookie Consent Banners**
   - May block form interaction
   - Requires automated dismissal

4. **CAPTCHA Introduction**
   - Would completely break automation
   - Fallback: Manual intervention or third-party solver

### Mitigation

- Schema drift detection (selector presence checks)
- Automated alerts on failure rate increase
- Manual testing schedule (quarterly)
- Fallback to API if discovered

---

## Future Optimizations

### Investigate XHR Endpoints

The browser automation should inspect network traffic for hidden JSON/XHR endpoints:

1. Monitor Network tab during form submission
2. Check for AJAX calls with JSON responses
3. If found, replace browser automation with direct HTTP calls

**Potential Gain:**
- 5-10x faster execution
- 90% reduction in resource usage
- Higher reliability

**Implementation:**
- Use network interception in Playwright
- Capture XHR request/response
- Document API structure
- Implement direct HTTP adapter

---

## Testing

### Unit Tests

- Postcode validation logic
- Address candidate parsing
- Collection event parsing
- Date format parsing

### Integration Tests

- End-to-end postcode → schedule
- Real browser automation
- Multiple address scenarios
- Page structure validation

### Test Postcodes

```
GU11 1AA (Rushmoor town center)
GU14 7JF (Farnborough area)
```

---

## Monitoring & Alerting

### Metrics

- Request count per day
- Success rate (target: >90% given browser automation)
- Response time (P50, P95, P99)
- Cache hit rate
- Browser crash rate

### Alerts

| Event | Severity | Threshold |
|-------|----------|-----------|
| Selector not found | Critical | >3 in 1 hour |
| Browser timeout | Warning | >5 in 1 hour |
| Browser crash | Critical | >1 in 1 hour |
| Response time >20s | Warning | P95 |
| Error rate | Critical | >20% over 1 hour |

---

## Changelog

### v1.0.0 (2026-03-25)

- ✅ Initial production release
- ✅ Playwright browser automation
- ✅ Postcode validation
- ✅ Address resolution
- ✅ Collection schedule parsing
- ✅ Screenshot capture on failure
- ✅ Network isolation and sandboxing
- ✅ Kill switch support

---

## References

- [Rushmoor Bin Collection Finder](https://www.rushmoor.gov.uk/recycling-rubbish-and-environment/bins-and-recycling/bin-collection-day-finder/)
- Discovery Notes: `docs/discovery/rushmoor-notes.md`
- Playwright Documentation: [playwright.dev](https://playwright.dev)
