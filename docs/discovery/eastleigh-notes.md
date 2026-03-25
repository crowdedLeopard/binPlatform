# Eastleigh Borough Council - Acquisition Notes

**Council ID:** `eastleigh`  
**Last Updated:** 2026-03-25  
**Status:** ⭐ High Priority - Phase 1 Implementation

---

## Official Waste Collection Page

**Primary URL:** https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates  
**Portal URL:** https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar  
**Gov.UK Redirect:** https://www.gov.uk/rubbish-collection-day/eastleigh

---

## Lookup Mechanism

### Method: API Endpoint (Oracle APEX)

**Endpoint Pattern:**
```
https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=<uprn>
```

**Example:**
```
https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=100060321174
https://my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=100060320567
```

### How It Works

1. **UPRN Required:** Endpoint requires Unique Property Reference Number (UPRN)
2. **Direct Access:** Can be accessed directly via HTTP GET (no complex form submission)
3. **Oracle APEX:** Backend is Oracle APEX application
4. **Response Format:** Returns collection calendar (format TBD - likely HTML or JSON)

### Recent Changes

- **Bot Protection Added (2024-2025):** Community reports (GitHub issue #4208 on hacs_waste_collection_schedule) indicate 403 Forbidden errors from automated scripts
- Protection may include:
  - User-Agent checking
  - Rate limiting
  - Session/cookie requirements
  - Referrer checking

---

## Required Inputs

### Primary: UPRN (Unique Property Reference Number)

**Challenge:** Users typically don't know their UPRN

**Resolution Options:**

1. **OS AddressBase Plus**
   - Ordnance Survey database of UK addresses with UPRNs
   - Requires license
   - Most authoritative source

2. **FindMyAddress API** (if available)
   - Some councils provide postcode → UPRN lookup
   - Check Eastleigh for endpoint

3. **Third-party UPRN Lookups**
   - uprn.uk (public lookup)
   - Various paid APIs

4. **Scrape Council Postcode Lookup**
   - Eastleigh likely has address search on main page
   - Capture UPRN from search results

**Recommendation:** Build generic UPRN resolution service (postcode → UPRN) reusable across councils

---

## Response Structure

**Unknown - Requires Investigation:**
- Visit example URL in browser to inspect
- Check Network tab for XHR/Fetch requests
- Determine if response is HTML (table/list) or JSON
- Look for structured data in HTML (JSON-LD, microdata)

**Likely Scenarios:**
1. HTML table with collection dates
2. JSON array of collection events
3. HTML with embedded JavaScript data
4. Calendar-format data (iCal/ICS)

**Next Step:** Manual inspection and network capture required

---

## Parsing Strategy

### If HTML Response:
- Parse DOM for collection schedule
- Look for:
  - Collection dates (next refuse, next recycling, etc.)
  - Bin types (waste, recycling, food, garden)
  - Collection frequency patterns
  - Holiday/special arrangement notices

**Tools:**
- Cheerio (Node.js)
- BeautifulSoup (Python)
- JSDOM for full DOM if needed

### If JSON Response:
- Parse JSON structure
- Map to standard collection event model
- Validate date formats
- Handle edge cases (missing data, special collections)

### If Calendar Response:
- Parse iCal/ICS format
- Extract VEVENT entries
- Map to collection schedule

---

## Security Considerations

### Bot Protection Mitigation

**User-Agent:**
```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

**Headers to Include:**
```
Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8
Accept-Language: en-GB,en;q=0.9
Accept-Encoding: gzip, deflate, br
Referer: https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates
```

**Session Management:**
- Maintain session cookies across requests
- May need to visit main page first to establish session
- Cookie store required

**Fallback:**
- If 403 persists, use headless browser (Playwright/Puppeteer)
- Rotate User-Agents
- Consider residential proxies (last resort)

### Input Validation

**UPRN Validation:**
- Numeric only
- 12 digits typical (but can vary)
- Range validation: 1 to 999999999999
- Sanitise before use in URL

**SQL Injection:** N/A (UPRN in URL parameter, not SQL query)
**XSS Risk:** Low (server-side parsing)
**SSRF Risk:** Low (fixed endpoint URL)

### Rate Limiting

**Observed Limits:** Unknown (requires testing)

**Recommended Approach:**
- Start conservative: 1 request per 2 seconds
- Monitor for 429 (Too Many Requests) or 403 responses
- Implement exponential backoff
- Per-council rate limiter (don't mix with other council requests)

**Backoff Strategy:**
```
Initial: 2s between requests
On 403/429: Wait 10s, then 20s, then 40s, max 5 minutes
After 5 consecutive errors: Circuit breaker (pause adapter for 1 hour)
```

---

## Brittleness Concerns

### High Risk

1. **Bot Protection Tightening**
   - Already added recently
   - May add CAPTCHA
   - May require full authentication

2. **UPRN Requirement**
   - Depends on external UPRN resolution
   - If UPRN lookup breaks, adapter breaks
   - Resolution service adds failure point

3. **Oracle APEX Updates**
   - Application framework updates may change URL structure
   - Endpoint paths may change
   - Response format may change

### Medium Risk

4. **Session Requirements**
   - May start requiring MyEastleigh account login
   - OAuth/SAML authentication could be added
   - Session token expiry handling needed

5. **Parameter Changes**
   - UPRN parameter name might change
   - Additional required parameters might be added

### Low Risk

6. **Data Format Changes**
   - Collection date format changes
   - Bin type classifications change
   - Additional fields added (unlikely to break parsing)

---

## Caching Strategy

### Cache Keys
- Primary: `eastleigh:uprn:<uprn>`
- Alternate: `eastleigh:postcode:<postcode>:address:<address_hash>`

### TTL (Time To Live)

**Collection Schedule:** 7 days
- Reason: Collections are weekly/fortnightly
- Refresh weekly to catch changes
- Invalidate on council calendar updates

**UPRN Mapping:** 90 days
- Reason: Property references rarely change
- Long cache reduces lookup load
- Invalidate if UPRN lookup fails

### Cache Invalidation Triggers
- Manual flush (admin action)
- Council announces schedule changes
- Error rate exceeds threshold (suggests upstream change)

---

## Testing Requirements

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
100060321174 (known working from community)
100060320567 (known working from community)
100060307475 (seen in example URLs)
```

**Caution:** Only use for testing. Respect rate limits.

---

## Monitoring & Alerting

### Health Checks
- Daily smoke test (known test UPRN)
- Response time tracking (P95 <5s)
- Error rate (<5%)

### Alerts
- 403 responses (bot protection triggered)
- 404 responses (endpoint changed)
- Parse failures (response format changed)
- Response time >10s
- Error rate >10% over 1 hour

### Metrics to Track
- Request count per day
- Success rate
- Response time (P50, P95, P99)
- Cache hit rate
- UPRN resolution failures

---

## Community Resources

### UKBinCollectionData
- GitHub: robbrad/UKBinCollectionData
- May have Eastleigh parser (check)
- Issue #4208 documents recent 403 errors
- Reference implementation for comparison

### Home Assistant Integration
- hacs_waste_collection_schedule
- Community reports of Eastleigh issues
- Monitor for fixes/workarounds

---

## Implementation Checklist

- [ ] Manual endpoint inspection (browser test with example UPRN)
- [ ] Capture actual response format (HTML/JSON)
- [ ] Design response parser
- [ ] Implement UPRN resolution service (generic, reusable)
- [ ] Build HTTP client with proper headers and session management
- [ ] Implement bot protection mitigation (User-Agent, cookies, referrer)
- [ ] Add rate limiting and backoff logic
- [ ] Write unit tests for parsing logic
- [ ] Integration test with test UPRNs
- [ ] Set up caching layer
- [ ] Configure monitoring and alerting
- [ ] Document UPRN resolution for other councils
- [ ] Performance testing (rate limit discovery)
- [ ] Circuit breaker implementation
- [ ] Fallback to browser automation if needed

---

## Open Questions

1. ❓ What is exact response format (HTML/JSON/iCal)?
2. ❓ Does endpoint require session cookies from main site visit?
3. ❓ What specific User-Agent/headers bypass bot protection?
4. ❓ Does Eastleigh provide own postcode → UPRN lookup API?
5. ❓ What is acceptable rate limit (requests per minute)?
6. ❓ Are there any terms of service restrictions on automated access?
7. ❓ Is there a robots.txt for my.eastleigh.gov.uk subdomain?

**Next Steps:** Manual testing to answer open questions

---

**Confidence Level:** HIGH (90%)  
**Implementation Priority:** 🥇 Phase 1 - Implement First  
**Estimated Effort:** 2-3 days  
**Upstream Risk:** Medium (bot protection recently added)
