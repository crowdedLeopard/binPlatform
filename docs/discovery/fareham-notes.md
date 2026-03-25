# Fareham Borough Council - Acquisition Notes

**Council ID:** `fareham`  
**Last Updated:** 2026-03-25  
**Status:** ⭐ High Priority - Phase 2 Implementation (Platform Pattern)

---

## Official Waste Collection Page

**Primary URL:** https://www.fareham.gov.uk/housing/bins.aspx  
**Bartec Dashboard:** https://farehamgw.bartecmunicipal.com/

---

## Lookup Mechanism

### Method: Bartec Collective Platform (SOAP API)

**Platform:** Bartec Municipal Technologies  
**Backend:** Bartec Collective system  
**API Type:** SOAP (XML-based web services)

### How It Works

**Option A: Official SOAP API**
```
Endpoint: collectiveapi.bartec-systems.com/API-R1531/CollectiveAPI.asmx
Method: Features_Get
Authentication: Token-based
Input: UPRN
Output: XML with collection schedule
```

**Option B: Public Dashboard**
- Scrape farehamgw.bartecmunicipal.com
- May have postcode/address lookup
- Easier than API but less stable

**Option C: Council Website Form**
- Fallback if API and dashboard unavailable
- Standard form automation

---

## Required Inputs

**Primary:** UPRN (for API) or Postcode+Address (for forms)

**API Requirements:**
1. Authentication credentials (username/password)
2. Token acquisition
3. UPRN for property lookup

---

## Parsing Strategy

### SOAP API Response

**Expected Format:** XML

```xml
<soap:Envelope>
  <soap:Body>
    <Features_GetResponse>
      <Features>
        <!-- Collection data here -->
      </Features>
    </Features_GetResponse>
  </soap:Body>
</soap:Envelope>
```

**Extract:**
- Collection dates by container type
- Service status
- Property details

**Tools:** XML parser (xml2js, lxml, or native DOM parser)

### Dashboard Scraping

**Format:** HTML  
**Tools:** Cheerio/BeautifulSoup

---

## Security Considerations

### API Access
- **Authentication Required:** Token-based, may need council partnership
- **Credentials Management:** Secure storage, rotation policy
- **Token Expiry:** Implement refresh logic
- **Rate Limiting:** Follow Bartec API documentation

### Dashboard Access
- Check robots.txt for farehamgw.bartecmunicipal.com
- May have separate rate limits
- Session management likely required

---

## Reusability / Platform Pattern

**HIGH VALUE:** Bartec platform used by many UK councils

**Reusable Components:**
1. Bartec SOAP client (authentication, token management)
2. Features_Get call pattern
3. XML response parser
4. UPRN resolution (same as Eastleigh)

**Other Councils Using Bartec:** Unknown (requires broader UK discovery), but common platform

**Investment Rationale:** Adapter pattern applicable beyond Hampshire

---

## Brittleness Concerns

### API Approach (Lower Brittleness)
- **API Credentials:** May expire, require renewal
- **API Versioning:** Bartec may update API (R1531 → R1600, etc.)
- **Schema Changes:** XML structure updates

### Dashboard Approach (Higher Brittleness)
- **UI Changes:** Dashboard redesign breaks scraping
- **Session Requirements:** Auth may be added

**Recommendation:** Prioritise API if credentials obtainable

---

## Caching Strategy

**Collection Schedule:** 7 days TTL  
**UPRN Mapping:** 90 days  
**API Token:** Session-based (cache until near expiry)

---

## Implementation Checklist

### Phase 1: Investigation
- [ ] Contact Fareham council for API credentials (or check existing relationship)
- [ ] Test dashboard accessibility and structure
- [ ] Determine primary approach (API vs dashboard vs form)

### Phase 2: API Implementation (if credentials available)
- [ ] Build SOAP client
- [ ] Implement authentication flow
- [ ] Token acquisition and refresh
- [ ] Features_Get call with UPRN
- [ ] XML response parsing
- [ ] Error handling (auth failures, token expiry)

### Phase 3: Alternative Implementation (if API unavailable)
- [ ] Dashboard scraping OR form automation
- [ ] HTML parsing
- [ ] Session management

### Phase 4: Documentation
- [ ] Document Bartec adapter pattern for reuse
- [ ] API client as reusable library
- [ ] Credential management guidelines

---

## Open Questions

1. ❓ Can we obtain Bartec API credentials from Fareham council?
2. ❓ Is public dashboard accessible without authentication?
3. ❓ What is Bartec API rate limit?
4. ❓ Are there API usage terms/costs?
5. ❓ Which other Hampshire councils use Bartec?
6. ❓ Is there a Bartec API sandbox for testing?

**Next Steps:** Reach out to Fareham council, test dashboard access

---

**Confidence Level:** HIGH (85%)  
**Implementation Priority:** 🥈 Phase 2 - Implement Second (Platform Pattern)  
**Estimated Effort:** 3-4 days (API) or 2-3 days (dashboard)  
**Upstream Risk:** Medium  
**Reusability:** HIGH (platform pattern)
