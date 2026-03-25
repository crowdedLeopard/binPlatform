# Hampshire Council Adapter Research — UKBinCollectionData

**Research Date:** 2026-03-25  
**Community Project:** https://github.com/robbrad/UKBinCollectionData  
**Researcher:** Holden (Lead Architect)

## Summary

**9 councils found** in the UKBinCollectionData community project with working implementations for Hampshire.  
**5 councils** have significant method mismatches requiring fixes.  
**4 councils** are substantially correct or not yet implemented upstream.

### Quick Wins Identified
1. **Southampton** — Direct UPRN endpoint already correct ✅
2. **Fareham** — Wrong method: uses simple internetlookups/search_data.aspx, NOT SOAP API
3. **Rushmoor** — Wrong method: uses direct JSON API, NOT browser automation
4. **Gosport** — Wrong method: uses Supatrak API with hardcoded auth, NOT browser automation
5. **Basingstoke** — Wrong method: uses cookie-based direct GET, NOT form automation
6. **Hart** — Wrong method: uses JSON API endpoint, NOT browser automation

---

## Council-by-Council Analysis

### 1. Eastleigh Borough Council
**Community Method:**
- URL: `https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates/your-waste-bin-and-recycling-collections?uprn={uprn}`
- Method: GET with Selenium WebDriver (browser automation)
- Input: UPRN
- Parsing: HTML using BeautifulSoup, looks for `dl.dl-horizontal` element
- Bin types: Household Waste, Recycling, Food Waste, Glass Box, Garden Waste

**Our Method:**
- URL: `https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates/your-waste-bin-and-recycling-collections`
- Method: GET (HTML parsing)
- Input: UPRN via `?uprn=` parameter
- Notes: "UPRN-based HTML parsing, dl.dl-horizontal element"

**Gap:** NONE — Our method is correct!

**Status:** ✅ **WORKING** — Already correctly implemented

**Confidence:** HIGH — The adapter config notes exactly match the community implementation.

---

### 2. Fareham Borough Council
**Community Method:**
- URL: `https://www.fareham.gov.uk/internetlookups/search_data.aspx`
- Method: GET with parameters
- Params: `?type=JSON&list={dataset_name}&Road or Postcode={postcode}`
- Dataset migration: `DomesticBinCollections2025on` (new) fallback to `DomesticBinCollections` (old)
- Input: Postcode
- Parsing: Direct JSON response
- No UPRN, no authentication, no SOAP
- Regex extracts: `(\d{1,2}/\d{1,2}/\d{4}|today)\s*\(([^)]+)\)` from `BinCollectionInformation` or `DomesticBinDay`

**Our Method:**
- URL: `https://farehamgw.bartecmunicipal.com/API/CollectiveAPI.asmx` (WRONG!)
- Method: SOAP API (WRONG!)
- Input: UPRN (WRONG!)
- Notes: "Bartec Collective platform" (INCORRECT ASSUMPTION)

**Gap:** 🚨 **COMPLETELY WRONG** — We assumed Bartec SOAP but it's a simple JSON lookup endpoint!

**Fix Required:**
1. Change adapter from `BartecBaseAdapter` to simple HTTP fetch
2. Update URL to `https://www.fareham.gov.uk/internetlookups/search_data.aspx`
3. Change input from UPRN to postcode
4. Add dual dataset support: try `DomesticBinCollections2025on` first, fallback to `DomesticBinCollections`
5. Parse JSON response directly (fields: `BinCollectionInformation` or `DomesticBinDay`, `GardenWasteDay`)
6. Regex pattern: `(\d{1,2}/\d{1,2}/\d{4}|today)\s*\(([^)]+)\)`

**Status:** ❌ **BLOCKED** — Complete rewrite required

**Effort:** Medium (2-3 hours) — Adapter needs to be rewritten from scratch, removing SOAP logic

**Priority:** 🔥 **HIGH** — Simple JSON endpoint, should be easiest to fix after Southampton

**Confidence:** VERY HIGH — Community implementation is battle-tested and clear

---

### 3. Portsmouth City Council
**Community Method:**
- URL: `https://my.portsmouth.gov.uk/en/AchieveForms/?form_uri=...`
- Method: Selenium WebDriver (browser automation with iframe navigation)
- Input: Postcode + UPRN
- Workflow:
  1. Switch to iframe `#fillform-frame-1`
  2. Fill postcode in `input[name="postcode_search"]`
  3. Click `#lookupAddress`
  4. Select UPRN from dropdown `select[name="Choose_Address"]`
  5. Wait for results (`h4` containing "next 10 collection dates")
  6. Parse HTML with BeautifulSoup from elements with `data-field-name` starting with "html"

**Our Method:**
- Method: Playwright browser automation (React SPA scraper)
- Notes: "React SPA scraper"

**Gap:** Minor — Method is correct (browser automation), but specific iframe and selector details missing

**Status:** 🟡 **NEEDS REFINEMENT** — Browser automation is correct approach, needs exact selectors

**Effort:** Low (1 hour) — Add iframe handling and correct selectors

**Priority:** MEDIUM — Browser automation already in place, just needs selector updates

**Confidence:** HIGH — Community implementation provides exact selectors

---

### 4. Southampton City Council
**Community Method:**
- URL: `https://www.southampton.gov.uk/whereilive/waste-calendar?UPRN={uprn}`
- Method: GET with requests (simple HTTP fetch)
- Input: UPRN
- Headers: Realistic browser headers to avoid Incapsula detection
- Parsing: Regex on HTML response, extract calendar view section (#calendar1...listView)
- Pattern: `(Glass|Recycling|General Waste|Garden Waste).*?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})`
- Date format: MM/DD/YYYY (US format!)

**Our Method:**
- URL: `https://www.southampton.gov.uk/whereilive/waste-calendar?UPRN={uprn}` ✅
- Method: GET (HIDDEN_JSON lookup method) ✅
- Input: UPRN ✅
- Parsing: Extract `#calendar1.*?listView` section, regex pattern ✅
- Pattern: `(Glass|Recycling|General Waste|Garden Waste).*?([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})` ✅

**Gap:** NONE — Our implementation is 100% aligned with community!

**Status:** ✅ **WORKING** — Implementation is correct and matches community exactly

**Confidence:** VERY HIGH — Already tested and validated

---

### 5. Winchester City Council
**Community Method:**
- URL: `http://www.winchester.gov.uk/bin-calendar` (note: HTTP not HTTPS!)
- Method: Selenium WebDriver (browser automation)
- Input: Postcode + PAON (Property Address/Number)
- Workflow:
  1. Navigate to bin-calendar page
  2. Fill postcode in `#postcodeSearch`
  3. Click button `.govuk-button.mt-4`
  4. Select address from dropdown `#addressSelect` matching PAON
  5. Wait for results container `.ant-row.justify-content-between`
  6. Parse cards `div.p-2.d-flex.flex-column.justify-content-between`
  7. Extract bin type from `<h3>` and date from `div.fw-bold` (format: "Friday 5 December")
- Year handling: If current month > 10 and collection month < 3, assume next year

**Our Method:**
- URL: `https://www.winchester.gov.uk` (base URL only)
- Method: Browser automation (React SPA scraper)
- Notes: "React SPA scraper"

**Gap:** Missing exact selectors and workflow

**Status:** 🟡 **NEEDS IMPLEMENTATION** — Correct approach, needs exact workflow

**Effort:** Medium (2 hours) — Browser automation in place, add exact selectors

**Priority:** MEDIUM

**Confidence:** HIGH — Community selectors are specific

---

### 6. New Forest District Council
**Community Method:**
- URL: `https://forms.newforest.gov.uk/ufs/FIND_MY_BIN_BAR.eb`
- Method: Selenium WebDriver (complex form automation)
- Input: Postcode + UPRN
- Workflow:
  1. Navigate and refresh (important to avoid redirect issues!)
  2. Fill postcode in `input#CTID-JmLqCKl2-_-A` using JavaScript DOM manipulation
  3. Click submit `input[type="submit"]`
  4. Select UPRN from dropdown `select#CTID-KOeKcmrC-_-A`
  5. Click submit again
  6. Handle TWO PATHS:
     - Legacy: Link "Find your current bin collection day" → extract from old format
     - New: Parse table `table.eb-1j4UaesZ-tableContent` with rows `.eb-1j4UaesZ-tableRow`
- Special handling: Uses `driver.execute_script` to force values into inputs

**Our Method:**
- Config: APIBroker pattern (id: `629ee3ce5acb1`)
- Method: GET with JSON response
- Notes: "API broker pattern"

**Gap:** 🚨 **COMPLETELY WRONG** — It's NOT an API broker, it's a complex Selenium form!

**Status:** ❌ **BLOCKED** — Needs complete rewrite for browser automation

**Effort:** HIGH (4-5 hours) — Complex dual-path form automation

**Priority:** LOW — Complex implementation, other wins first

**Confidence:** MEDIUM — Community code works but is complex

---

### 7. Test Valley Borough Council
**Community Method:**
- URL: `https://testvalley.gov.uk/wasteandrecycling/when-are-my-bins-collected/when-are-my-bins-collected`
- Method: Selenium WebDriver
- Input: Postcode + PAON
- Workflow:
  1. Fill `#postcodeSearch`
  2. Click `.govuk-button`
  3. Select from `#addressSelect` matching PAON
  4. Wait for `h2.mt-4.govuk-heading-s` containing "Your next collections"
  5. Parse `div.p-2` elements for bin type (`h3`) and dates (`div.fw-bold`, "followed by" pattern)
- Date handling: Format "Monday 5 January" — use `get_next_occurrence_from_day_month()` helper
- User agent: Realistic Chrome UA to bypass Cloudflare

**Our Method:**
- Method: Form-based scraper (HTML)
- Notes: "Form-based scraper"

**Gap:** Missing implementation details

**Status:** 🟡 **NEEDS IMPLEMENTATION** — Form approach correct, needs selectors

**Effort:** Medium (2 hours)

**Priority:** MEDIUM

**Confidence:** HIGH

---

### 8. Basingstoke & Deane Borough Council
**Community Method:**
- URL: `https://www.basingstoke.gov.uk/bincollections`
- Method: GET with cookies (requests library, not browser)
- Cookie: `WhenAreMyBinsCollected={uprn}`
- Input: UPRN
- Parsing: BeautifulSoup HTML, find `div#{collection_class}` for each bin type
- Collection classes: `rteelem_ctl03_pnlCollections_{Refuse|Recycling|Glass|GardenWaste|Food}`
- Extract dates from `<li>` elements using regex `\d{1,2}\s\w+\s\d{4}`
- Special: SSL verification disabled (`verify=False`)

**Our Method:**
- Method: Form-based scraper (HTML)
- Notes: "Form-based scraper, check your collection day page"

**Gap:** 🚨 **WRONG METHOD** — It's NOT a form, it's a direct GET with a cookie!

**Fix Required:**
1. Change from browser automation to simple HTTP fetch
2. Set cookie: `WhenAreMyBinsCollected={uprn}`
3. GET `https://www.basingstoke.gov.uk/bincollections`
4. Parse HTML for each bin type div by ID
5. Add SSL handling (council may have cert issues)

**Status:** ❌ **NEEDS REWRITE** — Simple fix, just wrong approach

**Effort:** LOW (1 hour) — Simple HTTP fetch, much easier than browser automation

**Priority:** 🔥 **HIGH** — Easy win, should work immediately

**Confidence:** VERY HIGH

---

### 9. Gosport Borough Council
**Community Method:**
- URL: `https://api.supatrak.com/API/JobTrak/NextCollection`
- Method: GET with Authorization header
- Headers: `Authorization: Basic VTAwMDE4XEFQSTpUcjRja2luZzEh` (HARDCODED!)
- Input: Postcode
- Params: `?postcode={postcode}`
- Response: JSON array with `WasteType` and `NextCollection` (ISO format)
- Parsing: Direct JSON, parse ISO date strings

**Our Method:**
- Method: Form-based scraper (HTML)
- Notes: "Form-based scraper"

**Gap:** 🚨 **COMPLETELY WRONG** — It's a direct API with hardcoded auth!

**Fix Required:**
1. Change from browser automation to HTTP fetch
2. Add Authorization header (hardcoded in community project!)
3. GET `https://api.supatrak.com/API/JobTrak/NextCollection?postcode={postcode}`
4. Parse JSON response directly
5. Security concern: Hardcoded API credentials in community project (may be public-facing)

**Status:** ❌ **NEEDS REWRITE** — Simple API but uses hardcoded credentials

**Effort:** LOW (1 hour) — Simple API call

**Priority:** 🔥 **HIGH** — Easy win, but credential security concern

**Confidence:** HIGH — API is straightforward, but credentials may change

**Security Warning:** ⚠️ Community project has hardcoded Basic auth credentials. This is a shared public credential for Gosport's Supatrak instance.

---

### 10. Hart District Council
**Community Method:**
- URL: `https://www.hart.gov.uk/bbd-whitespace/next-collection-dates`
- Method: GET with requests (simple HTTP fetch)
- Params: `?uri=entity:node/172&uprn={uprn}`
- Input: UPRN
- Response: JSON array with single object containing HTML table in `data` field
- Parsing: BeautifulSoup on returned HTML string, extract `<tr>` rows
- Cells: `td.bin-service` (bin types, may have multiple separated by `&`), `td.bin-service-date` (date format: "23 January")
- Date handling: Parse "DD Month", assume current year unless date has passed

**Our Method:**
- Method: Form-based scraper (browser automation)
- Notes: "Form-based scraper"

**Gap:** 🚨 **WRONG METHOD** — It's NOT a form, it's a direct JSON API!

**Fix Required:**
1. Change from browser automation to HTTP fetch
2. GET `https://www.hart.gov.uk/bbd-whitespace/next-collection-dates?uri=entity:node/172&uprn={uprn}`
3. Parse JSON response, extract `[0].data` field (HTML string)
4. Parse HTML table from data field
5. Handle multiple bin types separated by `&` in single row
6. Date format: "23 January" → add year logic

**Status:** ❌ **NEEDS REWRITE** — Simple JSON API wrapping HTML

**Effort:** MEDIUM (1.5 hours) — JSON + HTML parsing combination

**Priority:** 🔥 **HIGH** — Much simpler than browser automation

**Confidence:** VERY HIGH — Clear API structure

---

### 11. Rushmoor Borough Council
**Community Method:**
- URL: `https://www.rushmoor.gov.uk/Umbraco/Api/BinLookUpWorkAround/Get`
- Method: GET with params
- Params: `?selectedAddress={uprn}`
- Input: UPRN
- Response: HTML-wrapped JSON (XML/HTML hybrid)
- Parsing: BeautifulSoup extracts `<p>` content, then JSON.parse the string
- JSON structure: `{ NextCollection: { RefuseCollectionBinDate, RecyclingCollectionDate, GardenWasteCollectionDate, FoodWasteCollectionDate, ...ExceptionMessage fields } }`
- Date format: ISO 8601 `YYYY-MM-DDTHH:MM:SS`
- Bin types: Green general waste, Blue recycling, Brown garden, Black food
- Exception messages: Appended in parentheses if present

**Our Method:**
- Method: Browser automation (Playwright)
- Notes: "API broker pattern"

**Gap:** 🚨 **WRONG METHOD** — It's NOT browser automation, it's a direct API endpoint!

**Fix Required:**
1. Change from `BrowserAdapter` to simple HTTP fetch
2. GET `https://www.rushmoor.gov.uk/Umbraco/Api/BinLookUpWorkAround/Get?selectedAddress={uprn}`
3. Parse HTML response, extract `<p>` tag content
4. JSON.parse the extracted string
5. Extract `NextCollection` object
6. Handle exception messages (append in parentheses if present)
7. Parse ISO date format

**Status:** ❌ **NEEDS REWRITE** — Simple API disguised as HTML

**Effort:** LOW (1 hour) — Simple HTTP + JSON parsing

**Priority:** 🔥 **VERY HIGH** — Currently using heavyweight browser automation for a simple API call!

**Confidence:** VERY HIGH — Clear and simple API

---

### Councils NOT Found in Community Project
- **East Hampshire District Council** — No implementation found
- **Havant Borough Council** — No implementation found

These councils require manual investigation and are not yet solved by the community.

---

## Immediate Action Items

| Council | Fix | Effort | Priority | Expected Success Rate |
|---------|-----|--------|----------|----------------------|
| **Rushmoor** | Change from browser→API, parse JSON from HTML wrapper | 1h | 🔥 CRITICAL | 95% |
| **Basingstoke** | Change from form→cookie GET, parse HTML divs | 1h | 🔥 CRITICAL | 95% |
| **Gosport** | Change from form→API, add auth header | 1h | 🔥 HIGH | 90% (credential risk) |
| **Hart** | Change from form→API, parse JSON→HTML table | 1.5h | 🔥 HIGH | 95% |
| **Fareham** | Rewrite from SOAP→JSON, dual dataset support | 2-3h | 🔥 HIGH | 95% |
| **Southampton** | ✅ Already correct | 0h | — | ✅ DONE |
| **Eastleigh** | ✅ Already correct | 0h | — | ✅ DONE |
| **Portsmouth** | Add iframe handling + selectors | 1h | MEDIUM | 80% |
| **Winchester** | Add exact selectors + year logic | 2h | MEDIUM | 85% |
| **Test Valley** | Add exact selectors + date logic | 2h | MEDIUM | 85% |
| **New Forest** | Rewrite to complex form automation | 4-5h | LOW | 70% (complexity) |

---

## Top 3 Easiest Wins (Smallest Code Change, Highest Success Probability)

### 🥇 1. Rushmoor Borough Council
**Why:** Currently using Playwright browser automation for a simple GET API call. The API returns JSON wrapped in HTML `<p>` tags.  
**Fix:** Replace entire BrowserAdapter implementation with simple `fetch()` call.  
**Code Change:** ~50 lines → ~100 lines (simpler adapter)  
**Expected Time to First Data:** 30 minutes after deployment  
**Success Probability:** 95%

### 🥈 2. Basingstoke & Deane Borough Council
**Why:** Direct GET with a single cookie. No form submission, no JavaScript, no browser needed.  
**Fix:** Replace form scraper with HTTP fetch + cookie header.  
**Code Change:** ~50 lines  
**Expected Time to First Data:** 30 minutes  
**Success Probability:** 95%

### 🥉 3. Hart District Council
**Why:** Simple JSON API that returns HTML in the response. Two-step parsing but no browser needed.  
**Fix:** Replace browser automation with fetch + JSON parse + HTML parse.  
**Code Change:** ~80 lines  
**Expected Time to First Data:** 1 hour (need to verify UPRN format)  
**Success Probability:** 95%

---

## Key Technical Insights

### 1. UPRN vs Postcode Input Patterns
- **UPRN-only:** Southampton, Eastleigh, Basingstoke, Hart, Rushmoor
- **Postcode-only:** Fareham, Gosport
- **Postcode + PAON/UPRN:** Portsmouth, Winchester, Test Valley, New Forest

### 2. Date Format Variations
- **DD/MM/YYYY:** Most councils (UK standard)
- **MM/DD/YYYY:** Southampton (US format! ⚠️)
- **ISO 8601:** Rushmoor, Gosport
- **"Friday 5 December":** Winchester, Test Valley (needs year inference)

### 3. Response Format Patterns
- **Direct JSON:** Fareham, Gosport
- **JSON wrapped in HTML:** Rushmoor, Hart
- **Pure HTML parsing:** Southampton, Eastleigh, Basingstoke
- **Browser-required SPA:** Portsmouth, Winchester, Test Valley, New Forest

### 4. Authentication & Security
- **No auth:** Most councils (public endpoints)
- **Hardcoded Basic Auth:** Gosport (⚠️ security concern)
- **Cloudflare/Incapsula protection:** Test Valley, Southampton (need realistic User-Agent)
- **SSL issues:** Basingstoke (`verify=False` in community code)

---

## Next Steps

1. **Immediate (Today):**
   - Fix Rushmoor (1 hour)
   - Fix Basingstoke (1 hour)
   - Fix Hart (1.5 hours)
   - Total: ~3.5 hours for 3 new working councils

2. **Short-term (This Week):**
   - Fix Gosport (1 hour, assess credential security)
   - Fix Fareham (2-3 hours)
   - Total: 5 working councils

3. **Medium-term (Next Week):**
   - Portsmouth selector refinement (1 hour)
   - Winchester implementation (2 hours)
   - Test Valley implementation (2 hours)
   - Total: 8 working councils

4. **Long-term (Future):**
   - New Forest complex form (4-5 hours)
   - East Hampshire (manual investigation required)
   - Havant (manual investigation required)

---

## Confidence Assessment

**High Confidence (90%+ success):**
- Southampton ✅
- Eastleigh ✅
- Rushmoor (after fix)
- Basingstoke (after fix)
- Hart (after fix)
- Fareham (after fix)

**Medium Confidence (70-90%):**
- Gosport (credential dependency)
- Portsmouth (complex iframe)
- Winchester (selector validation needed)
- Test Valley (Cloudflare handling)

**Low Confidence (<70%):**
- New Forest (dual-path complexity)
- East Hampshire (no community reference)
- Havant (no community reference)

---

**Research completed:** 2026-03-25  
**Ready for implementation:** Rushmoor, Basingstoke, Hart (immediate wins)
