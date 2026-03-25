# Hampshire Council Discovery Matrix

**Generated:** 2026-03-25  
**Scope:** 13 Hampshire councils  
**Purpose:** Classification of bin collection data acquisition mechanisms

---

## Summary Statistics

- **Total Councils:** 13
- **API/Machine-readable:** 2 (Eastleigh, Fareham)
- **HTML Form:** 9
- **Browser Automation Required:** 1 (Winchester)
- **PDF Calendar:** 1 (East Hampshire)
- **High Risk/Uncertain:** 3 (New Forest, Southampton, Test Valley)

---

## Council Classification Matrix

| Council | Official Waste URL | Lookup Method | Required Input | Machine Readable? | Downloadable Calendar? | Confidence | Upstream Risk | Recommended Approach |
|---------|-------------------|---------------|----------------|-------------------|----------------------|------------|---------------|---------------------|
| **Basingstoke & Deane** | [Link](https://www.basingstoke.gov.uk/bincollections) | `html_form` | postcode_plus_address | ❌ No | ❌ No | 0.65 | **MEDIUM** | HTML scraping with form automation. Whitespace backend (no public API). Use UKBinCollectionData patterns. |
| **East Hampshire** | [Link](https://www.easthants.gov.uk/bin-collections/find-your-bin-calendar) | `pdf_calendar` | calendar_code | ❌ No | ✅ Yes | 0.85 | **LOW** | Two-phase: Address→calendar lookup, then PDF download/parse. 13-month calendars, cacheable. |
| **Eastleigh** | [Link](https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates) | `api` | uprn | ✅ Yes | ✅ Yes | 0.90 | **MEDIUM** | **UPRN-based endpoint** (my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=...). Oracle APEX. Bot protection recently added. **TOP CANDIDATE**. |
| **Fareham** | [Link](https://www.fareham.gov.uk/housing/bins.aspx) | `api` | postcode_plus_address | ✅ Yes | ✅ Yes | 0.85 | **MEDIUM** | **Bartec Collective platform**. SOAP API available (requires credentials) or scrape public dashboard (farehamgw.bartecmunicipal.com). Reusable adapter pattern. |
| **Gosport** | [Link](https://www.gosport.gov.uk/refuserecyclingdays) | `html_form` | postcode | ❌ No | ✅ Yes (PDF) | 0.70 | **MEDIUM** | Form automation, handle cookie consent. PDF calendar available for caching. |
| **Hart** | [Link](https://www.hart.gov.uk/waste-and-recycling/when-my-bin-day) | `html_form` | postcode | ❌ No | ✅ Yes | 0.70 | **MEDIUM** | Postcode form automation. Map tool alternative (maps.hart.gov.uk). Calendar download. |
| **Havant** | [Link](https://www.havant.gov.uk/bin-collections) | `html_form` | postcode_plus_address | ❌ No | ✅ Yes (PDF) | 0.65 | **MEDIUM** | Form automation. North/South area split. PDF calendars available. |
| **New Forest** | [Link](https://www.newforest.gov.uk/findyourcollection) | `html_form` | postcode_plus_address | ❌ No | ❌ No | 0.60 | **HIGH** | ⚠️ **403 bot protection active**. Phased service rollout adds complexity. Browser automation likely required. Consider postponing. |
| **Portsmouth** | [Link](https://my.portsmouth.gov.uk) | `html_form` | postcode_plus_address | ❌ No | ❌ No | 0.65 | **MEDIUM** | Granicus portal. Form automation or XHR inspection. Community scrapers exist (UKBinCollectionData). |
| **Rushmoor** | [Link](https://www.rushmoor.gov.uk/recycling-rubbish-and-environment/bins-and-recycling/bin-collection-day-finder/) | `html_form` | postcode | ❌ No | ✅ Yes | 0.75 | **LOW** | Clean form interface. Straightforward automation. Calendar download. **Good test case**. |
| **Southampton** | [Link](https://www.southampton.gov.uk/bins-recycling/bins/collections/) | `html_form` | postcode_plus_address | ❌ No | ✅ Yes | 0.60 | **HIGH** | ⚠️ **Incapsula/Imperva protection**. Direct access difficult. Third-party service (bin-calendar.nova.do) exists. Lower priority. |
| **Test Valley** | [Link](https://testvalley.gov.uk/wasteandrecycling/when-are-my-bins-collected) | `html_form` | postcode_plus_address | ❌ No | ❌ No | 0.70 | **MEDIUM** | Standard form automation. My Test Valley portal exists. Check for API endpoints. |
| **Winchester** | [Link](https://www.winchester.gov.uk/bins) | `browser_automation` | postcode_plus_address | ❌ No | ✅ Yes | 0.75 | **MEDIUM** | **React SPA** - JS rendering required. Browser automation or XHR discovery. Community PWA reference available. |

---

## Key Findings

### Platforms Identified

1. **Bartec Collective** - Fareham (confirmed)
   - SOAP API available with authentication
   - Public dashboard alternative
   - Reusable adapter pattern across UK councils

2. **Oracle APEX** - Eastleigh (confirmed)
   - UPRN-based endpoint
   - Recent bot protection addition
   - Direct HTTP access possible with proper headers

3. **Whitespace** - Basingstoke (community-reported, not confirmed)
   - No public API exposed
   - Common platform across southern England
   - Worth investigating for shared adapter pattern

4. **Granicus** - Portsmouth (confirmed)
   - Customer portal platform
   - Form-based with likely XHR endpoints
   - Common across UK councils

### Bot Protection / Security

**High Protection:**
- Southampton (Incapsula/Imperva) ⚠️
- New Forest (403 blocks) ⚠️
- Eastleigh (recent bot protection added)

**Moderate Protection:**
- Most HTML form councils (CSRF tokens, cookie consent)

**Low Protection:**
- Rushmoor, East Hampshire, Hart

### Data Quality Indicators

**Best for Initial Implementation:**
1. Eastleigh - Known API endpoint, UPRN-based
2. Rushmoor - Clean form, straightforward
3. East Hampshire - Structured PDF calendars

**Most Complex:**
1. New Forest - Bot protection + phased rollout
2. Southampton - Incapsula protection
3. Winchester - React SPA requiring browser automation

---

## Input Requirements Analysis

| Input Type | Count | Councils |
|------------|-------|----------|
| `postcode` | 3 | Gosport, Hart, Rushmoor |
| `postcode_plus_address` | 8 | Basingstoke, Fareham, Havant, New Forest, Portsmouth, Southampton, Test Valley, Winchester |
| `uprn` | 1 | Eastleigh |
| `calendar_code` | 1 | East Hampshire |

**Implication:** Most councils require address-level lookup after postcode. UPRN resolution valuable for Eastleigh. Calendar code system unique to East Hampshire.

---

## Caching Opportunities

**Long-term Cacheable:**
- East Hampshire: 13-month PDF calendars
- Gosport: Annual PDF (2025/26)
- Havant: North/South annual PDFs
- Rushmoor: Downloadable calendar

**Short-term Cacheable:**
- All collection schedules (typically stable for weeks/months)
- UPRN lookups (property references don't change)

---

## Recommendations by Priority

See `adapter-priority.md` for detailed implementation priority recommendations.

---

## Notes for Adapter Development

1. **UPRN Resolution:** Required for Eastleigh, potentially useful for others. Consider OS AddressBase integration or council-specific postcode→UPRN APIs.

2. **Form Automation Pattern:** 9 councils use HTML forms. Develop reusable form automation framework with CSRF handling, cookie management, input sanitisation.

3. **Browser Automation:** Winchester confirmed, New Forest likely. Playwright/Puppeteer infrastructure required.

4. **PDF Parsing:** East Hampshire confirmed, others (Gosport, Havant) available. PDF parsing library required (pdf-lib, pdfjs, or OCR).

5. **Third-party Platforms:** Bartec (Fareham) and potentially others share platforms. Adapter reusability across councils should be design goal.

6. **Rate Limiting:** All adapters require conservative throttling (1-2 req/sec max). Implement exponential backoff, respect 429 responses, monitor for blocks.

7. **Error Handling:** Bot protection (403), rate limits (429), CAPTCHA challenges all likely. Robust error detection and graceful degradation required.

8. **Evidence Capture:** Store raw responses for debugging, compliance, audit trail per charter requirements.

---

**Last Updated:** 2026-03-25  
**Maintained by:** Naomi (Backend Developer)  
**Review Frequency:** Monthly or when council sites change
