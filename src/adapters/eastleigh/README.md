# Eastleigh Borough Council Adapter

**Council ID:** `eastleigh`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ✅ Production Ready

---

## Acquisition Path

### Method: API Endpoint (Oracle APEX)

Eastleigh exposes a machine-readable Oracle APEX endpoint for waste collection schedules.

**Endpoint:**
```
https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=<uprn>
```

**Request Type:** HTTP GET  
**Authentication:** None (public endpoint)  
**Rate Limit:** ~30 requests/minute (conservative)

---

## Input Requirements

### Primary Input: UPRN (Unique Property Reference Number)

The Eastleigh adapter **requires** a UPRN. It does not support postcode-based address lookup.

**UPRN Format:**
- Numeric only
- 1-12 digits
- Range: 1 to 999999999999

**Example UPRNs:**
- `100060321174`
- `100060320567`
- `100060307475`

### UPRN Resolution

Users typically don't know their UPRN. An external UPRN resolution service is required to convert postcode → UPRN before calling this adapter.

**Recommended UPRN Sources:**
1. OS AddressBase Plus (authoritative, license required)
2. uprn.uk (public lookup)
3. Council-specific address search (scrape and cache)

---

## Response Structure

The adapter expects a JSON response from the Oracle APEX endpoint.

**Expected Fields:**
```json
{
  "uprn": "100060321174",
  "address": "1 Example Road, Eastleigh",
  "postcode": "SO50 4XX",
  "collections": [
    {
      "service": "Refuse",
      "collectionDate": "2026-04-01",
      "frequency": "Fortnightly",
      "containerType": "240L wheeled bin",
      "containerColour": "Black"
    },
    {
      "service": "Recycling",
      "collectionDate": "2026-04-08",
      "frequency": "Fortnightly",
      "containerType": "240L wheeled bin",
      "containerColour": "Blue"
    }
  ]
}
```

**⚠️ Note:** Actual response structure may vary. The parser handles multiple field name variations gracefully.

---

## Service Types Supported

- **General Waste** (Refuse, Rubbish, Black Bin)
- **Recycling** (Mixed Recycling, Blue Bin)
- **Garden Waste** (Green Waste, Brown Bin)
- **Food Waste** (Caddy)

---

## Bot Protection Considerations

### Current Status: MEDIUM Risk

Community reports indicate bot protection was added in 2024-2025, resulting in 403 Forbidden errors for some automated scripts.

### Mitigation Strategies

1. **Honest User-Agent:**
   ```
   HampshireBinData/1.0 (Municipal Service; +https://binday.example.com/about)
   ```

2. **Request Headers:**
   - `Accept: application/json, text/html, */*`
   - `Accept-Language: en-GB,en;q=0.9`
   - `Referer: https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates`

3. **Rate Limiting:**
   - 30 requests/minute maximum
   - Exponential backoff on 403/429
   - Circuit breaker after 5 consecutive failures

4. **Timeout Configuration:**
   - Connect timeout: 15 seconds
   - Total request timeout: 30 seconds

---

## Error Handling

### HTTP Status Codes

| Status | Category | Action |
|--------|----------|--------|
| 200 | Success | Parse response |
| 403 | Bot Detection | Reduce rate, implement backoff |
| 404 | Not Found | UPRN does not exist at Eastleigh |
| 429 | Rate Limited | Exponential backoff (10s, 20s, 40s) |
| 500+ | Server Error | Retry with backoff, alert if persistent |

### Failure Categories

- **NETWORK_ERROR:** Connection timeout, DNS failure
- **BOT_DETECTION:** 403 Forbidden (bot protection triggered)
- **RATE_LIMITED:** 429 Too Many Requests
- **NOT_FOUND:** UPRN not found (404 or error in response)
- **PARSE_ERROR:** Invalid JSON or unexpected format
- **TIMEOUT:** Request exceeded 30-second timeout

---

## Caching Strategy

### Collection Schedules

**TTL:** 7 days

**Rationale:**
- Collections are weekly/fortnightly
- Refreshing weekly catches schedule changes
- Reduces upstream load

**Cache Key:**
```
eastleigh:uprn:<uprn>
```

### Cache Invalidation

- Manual flush (admin action)
- Error rate threshold exceeded (suggests schema drift)
- Scheduled weekly refresh

---

## Security Profile

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Browser Automation Required** | No |
| **Executes JavaScript** | No |
| **External Domains** | my.eastleigh.gov.uk |
| **Handles Credentials** | No |
| **Network Isolation** | Allowlist only |
| **Sandboxed** | Yes |

### Security Concerns

1. **Bot Protection:** May block automated access — rate limiting essential
2. **UPRN Enumeration:** Validate inputs to prevent scanning
3. **No Authentication:** Public endpoint — easy to abuse if rate limits fail

---

## Health Check

The adapter implements `verifyHealth()` using a known test UPRN:

**Test UPRN:** `100060321174`

**Health Criteria:**
- ✅ **HEALTHY:** Successful data retrieval
- ⚠️ **DEGRADED:** Partial data or warnings
- ❌ **UNHEALTHY:** 403, 500, timeout, or parse failure

---

## Kill Switch

The adapter respects the kill switch environment variable:

```bash
ADAPTER_KILL_SWITCH_EASTLEIGH=true
```

When enabled, all requests fail immediately with an error message.

---

## Evidence Capture

All responses are stored as evidence for audit and debugging:

**Evidence Type:** `json`  
**Storage Path:** `eastleigh/<date>/<uuid>.json`  
**Retention:** 90 days (automated deletion)  
**Contains PII:** Yes (address data)

Evidence includes:
- Full HTTP request (sanitised headers)
- Full HTTP response
- Acquisition metadata
- Timestamp and correlation ID

---

## Brittleness Risks

### High Risk

1. **Bot Protection Tightening**
   - May add CAPTCHA
   - May require authentication
   - May block entirely

2. **UPRN Requirement**
   - Depends on external UPRN resolution
   - UPRN lookup failure breaks adapter

3. **Oracle APEX Updates**
   - URL structure may change
   - Response format may change
   - Endpoint may be deprecated

### Mitigation

- Monitor for 403 responses (bot protection)
- Schema drift detection via field presence
- Version detection and automated alerts
- Fallback to browser automation if needed

---

## Testing

### Unit Tests

- UPRN validation logic
- Response parsing (mock responses)
- Error handling (403, 404, 500, timeout)
- Date format parsing edge cases

### Integration Tests

- End-to-end UPRN → collection schedule
- Real network calls (test UPRN)
- Bot protection handling
- Rate limiting compliance

### Test UPRNs

```
100060321174 (known working)
100060320567 (known working)
100060307475 (example)
```

**⚠️ Caution:** Only use for testing. Respect rate limits.

---

## Monitoring & Alerting

### Metrics

- Request count per day
- Success rate (target: >95%)
- Response time (P50, P95, P99)
- Cache hit rate
- Error rate by category

### Alerts

| Event | Severity | Threshold |
|-------|----------|-----------|
| 403 responses | Warning | >5 in 1 hour |
| 500 responses | Critical | >10 in 1 hour |
| Parse failures | Critical | >3 in 1 hour |
| Response time >10s | Warning | P95 |
| Error rate | Critical | >10% over 1 hour |

---

## Changelog

### v1.0.0 (2026-03-25)

- ✅ Initial production release
- ✅ UPRN validation and sanitisation
- ✅ Full error handling (network, bot protection, rate limiting)
- ✅ Evidence capture
- ✅ Health check implementation
- ✅ Security profile defined
- ✅ Kill switch support
- ✅ Date parsing (multiple formats)
- ✅ Service type mapping

---

## References

- [Eastleigh Waste Collection Page](https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates)
- [Oracle APEX Endpoint](https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar)
- [UKBinCollectionData Issue #4208](https://github.com/robbrad/UKBinCollectionData) (Bot protection reports)
- Discovery Notes: `docs/discovery/eastleigh-notes.md`
