# Hampshire Council Adapter Priority Recommendations

**Generated:** 2026-03-25  
**Author:** Naomi (Backend Developer)  
**Purpose:** Prioritise adapter implementation based on acquisition mechanism complexity, risk, and reusability

---

## Priority Framework

Adapters are prioritised based on:
1. **Technical Feasibility** - Clean acquisition path with predictable structure
2. **Upstream Risk** - Bot protection, rate limiting, brittleness
3. **Reusability** - Platform patterns applicable to other councils
4. **Learning Value** - Teaches patterns useful for remaining councils
5. **Stability** - Established services vs. in-flux systems

---

## Phase 1: Foundation Adapters (Implement First)

### 1. Eastleigh Borough Council ⭐⭐⭐⭐⭐

**Why First:**
- **Known API endpoint**: `my.eastleigh.gov.uk/apex/EBC_Waste_Calendar?UPRN=<uprn>`
- **Machine-readable**: Oracle APEX application returns structured data
- **High confidence**: Community-verified working endpoint
- **UPRN pattern**: Teaches UPRN resolution (valuable for other councils)
- **Direct HTTP**: No JavaScript rendering, no complex form automation

**Challenges:**
- Recent bot protection addition (403 errors reported)
- Requires UPRN lookup (postcode → UPRN resolution)
- May need User-Agent and session management

**Learning Value:**
- UPRN resolution strategy
- Handling Oracle APEX endpoints
- Bot protection mitigation (User-Agent, headers, throttling)
- Cache strategy for collection schedules

**Effort Estimate:** Medium (2-3 days)
- Build UPRN resolution (postcode → UPRN lookup via OS AddressBase or council API)
- HTTP client with proper headers and session management
- Response parsing (likely HTML or JSON)
- Bot protection handling (User-Agent rotation, throttling)

**Success Criteria:**
- Reliably fetch collection schedule given UPRN
- Handle 403 responses gracefully
- Cache responses effectively
- Document UPRN resolution pattern for reuse

---

### 2. Rushmoor Borough Council ⭐⭐⭐⭐

**Why Second:**
- **Clean interface**: Straightforward postcode/street name form
- **Low complexity**: No JavaScript rendering, minimal bot protection
- **Downloadable calendar**: Year-round cache opportunity
- **Low risk**: Council site appears stable and tolerant
- **Form automation pattern**: Teaches reusable pattern for 9 councils

**Challenges:**
- Standard form automation (CSRF, cookie handling)
- HTML parsing required
- Address-level lookup needed

**Learning Value:**
- Form automation framework (reusable for 9 other councils)
- HTML response parsing
- Calendar download and caching
- CSRF token handling
- Input sanitisation patterns

**Effort Estimate:** Low-Medium (1-2 days)
- Build form automation framework (POST with CSRF handling)
- HTML parser for collection schedule extraction
- Calendar download/parse for caching
- Input validation and sanitisation

**Success Criteria:**
- Form submission with postcode → parse results
- Extract collection dates reliably
- Download and cache calendar file
- Reusable form automation framework for other councils

---

## Phase 2: Platform Pattern Adapters (Implement Second)

### 3. Fareham Borough Council (Bartec) ⭐⭐⭐⭐

**Why Third:**
- **Platform identified**: Bartec Collective (SOAP API)
- **Reusable pattern**: Bartec used by many UK councils
- **Multiple options**: SOAP API (requires credentials) OR public dashboard scraping
- **High value**: Adapter pattern reusable across other Bartec councils

**Challenges:**
- API requires authentication credentials (may need council partnership)
- SOAP XML parsing (more complex than REST JSON)
- Alternative dashboard scraping if API unavailable
- Credential management and token refresh

**Learning Value:**
- Bartec platform integration (reusable across UK)
- SOAP API client development
- Authentication token management
- Alternative fallback strategy (dashboard scraping)

**Effort Estimate:** Medium-High (3-4 days)
- Option A: SOAP API client (if credentials obtainable)
  - SOAP envelope construction
  - Token authentication flow
  - XML response parsing
- Option B: Dashboard scraping (farehamgw.bartecmunicipal.com)
  - HTML scraping of public dashboard
  - Session management
  - Response parsing

**Success Criteria:**
- Authenticate with Bartec API (if credentials available) OR scrape dashboard
- Features_Get call returning collection dates by UPRN
- Document Bartec adapter pattern for reuse
- Handle token expiry and refresh

---

### 4. East Hampshire District Council (PDF Calendar) ⭐⭐⭐⭐

**Why Fourth:**
- **Unique pattern**: PDF calendar system (reusable if other councils use PDFs)
- **High confidence**: Well-structured, predictable format
- **Long cache**: 13-month calendars reduce upstream load
- **Two-phase learning**: Address lookup + PDF parsing

**Challenges:**
- Two-phase acquisition (address → calendar number, then PDF download)
- PDF parsing (OCR or structured text extraction)
- Map-based lookup may have complexity

**Learning Value:**
- Two-phase acquisition pattern
- PDF parsing infrastructure (useful for Gosport, Havant)
- Calendar number mapping system
- Long-term caching strategy

**Effort Estimate:** Medium (2-3 days)
- Phase 1: Address → calendar number lookup (maps.easthants.gov.uk integration)
- Phase 2: PDF download and parsing
- Calendar number caching
- PDF text extraction (pdf-lib, pdfjs, or Tesseract OCR)

**Success Criteria:**
- Address → calendar number resolution
- PDF calendar download
- Extract collection dates from PDF
- Cache calendars (13-month validity)

---

## Phase 3: Standard Form Adapters (Implement Third)

These councils use standard HTML form patterns. Implement after Phase 1-2 establishes reusable frameworks.

### 5. Hart District Council ⭐⭐⭐
- **Pattern:** Standard form automation (reuse Rushmoor framework)
- **Risk:** Medium (no major bot protection identified)
- **Complexity:** Low (postcode form + calendar download)
- **Effort:** 1-2 days

### 6. Gosport Borough Council ⭐⭐⭐
- **Pattern:** Form automation + PDF calendar
- **Risk:** Medium (cookie consent banner)
- **Complexity:** Low-Medium (reuse form + PDF frameworks)
- **Effort:** 1-2 days

### 7. Havant Borough Council ⭐⭐⭐
- **Pattern:** Form automation + PDF calendar (North/South split)
- **Risk:** Medium
- **Complexity:** Medium (area distinction adds minor complexity)
- **Effort:** 1-2 days

### 8. Test Valley Borough Council ⭐⭐⭐
- **Pattern:** Standard form automation
- **Risk:** Medium (no calendar download complicates caching)
- **Complexity:** Low (reuse form framework)
- **Effort:** 1-2 days

### 9. Portsmouth City Council ⭐⭐⭐
- **Pattern:** Granicus portal (form + XHR inspection)
- **Risk:** Medium (portal platform complexity)
- **Complexity:** Medium (session management, potential auth)
- **Effort:** 2-3 days

---

## Phase 4: Complex/Browser Automation (Implement Fourth)

### 10. Winchester City Council ⭐⭐⭐
- **Pattern:** Browser automation (React SPA)
- **Risk:** Medium (JS rendering required)
- **Complexity:** Medium-High (Playwright/Puppeteer infrastructure)
- **Effort:** 2-3 days
- **Notes:** Requires browser automation infrastructure. Community PWA exists as reference. XHR endpoint discovery alternative.

---

## Phase 5: High-Risk/Uncertain (Deprioritise or Postpone)

### 11. Basingstoke & Deane Borough Council ⭐⭐
- **Pattern:** HTML scraping (Whitespace backend, no API)
- **Risk:** Medium (no API, HTML brittleness)
- **Complexity:** Medium (form automation)
- **Effort:** 2-3 days
- **Notes:** Whitespace platform but no public API. Community scrapers exist as reference. Consider after form automation framework proven.

### 12. New Forest District Council ⭐
- **Pattern:** Browser automation (likely)
- **Risk:** **HIGH** (403 bot protection active, phased service rollout)
- **Complexity:** High (bot protection, phasing system, rural geography)
- **Effort:** 3-5 days (uncertain due to bot protection)
- **⚠️ RECOMMENDATION: POSTPONE** - Wait until service rollout completes and bot protection understood. High maintenance risk.

### 13. Southampton City Council ⭐
- **Pattern:** Third-party service or browser automation
- **Risk:** **HIGH** (Incapsula/Imperva protection)
- **Complexity:** High (bot protection blocks direct access)
- **Effort:** 3-4 days (via third-party) or very high (direct access)
- **⚠️ RECOMMENDATION: USE THIRD-PARTY** - Direct access likely impossible. bin-calendar.nova.do UPRN service exists. Consider external integration or deprioritise until protection softens.

---

## Implementation Roadmap

### Sprint 1 (Week 1): Foundation
- ✅ **Eastleigh** - API endpoint, UPRN resolution, bot protection handling
- ✅ **Rushmoor** - Form automation framework, HTML parsing

**Deliverables:** UPRN resolution, form automation framework, cache strategy

---

### Sprint 2 (Week 2): Platform Patterns
- ✅ **Fareham** - Bartec platform integration (API or dashboard)
- ✅ **East Hampshire** - PDF calendar system

**Deliverables:** Bartec adapter pattern, PDF parsing infrastructure

---

### Sprint 3 (Week 3-4): Standard Forms
- ✅ **Hart** - Apply form framework
- ✅ **Gosport** - Form + PDF (reuse frameworks)
- ✅ **Havant** - Form + PDF with area split
- ✅ **Test Valley** - Standard form
- ✅ **Portsmouth** - Granicus portal

**Deliverables:** 5 additional councils, form automation proven at scale

---

### Sprint 4 (Week 5): Complex Cases
- ✅ **Winchester** - Browser automation for React SPA
- ✅ **Basingstoke** - HTML scraping (Whitespace)

**Deliverables:** Browser automation infrastructure, 11 councils total

---

### Future Consideration
- ⏸️ **New Forest** - Postpone until service stabilises
- ⏸️ **Southampton** - Evaluate third-party integration or await protection changes

---

## Resource Requirements

### Infrastructure
- **Phase 1-2:** HTTP client, HTML parser, PDF parser, UPRN lookup service
- **Phase 3:** Reuse existing frameworks
- **Phase 4:** Playwright/Puppeteer for browser automation

### Skills
- **Phase 1-2:** TypeScript/Python, HTTP, HTML parsing, SOAP client
- **Phase 3:** Apply existing patterns
- **Phase 4:** Browser automation, JavaScript rendering

### Third-party Services
- **UPRN Lookup:** OS AddressBase or alternative
- **Southampton:** bin-calendar.nova.do (if direct access fails)

---

## Risk Mitigation

### Bot Protection (Eastleigh, Southampton, New Forest)
- Implement User-Agent rotation
- Session management with cookies
- Exponential backoff on 403/429
- Consider residential proxies if needed
- Fallback to browser automation

### Platform Changes
- Store raw responses for debugging
- Version detection (HTML fingerprinting)
- Graceful degradation when parsing fails
- Alert on structure changes

### Rate Limiting
- Global rate limiter (1-2 req/sec per council)
- Per-council throttling configuration
- Exponential backoff on errors
- Queue management for batch requests

### Maintenance
- Automated smoke tests (daily checks)
- Error rate monitoring
- Upstream availability tracking
- Community scraper monitoring (UKBinCollectionData) for early warnings

---

## Success Metrics

**Phase 1 (Foundation):**
- 2 councils operational
- UPRN resolution proven
- Form automation framework built
- <5% error rate

**Phase 2 (Platform Patterns):**
- 4 councils operational
- Bartec pattern documented
- PDF parsing working
- <5% error rate

**Phase 3 (Standard Forms):**
- 9 councils operational
- Form framework proven at scale
- <10% error rate (acceptable with 9 councils)

**Phase 4 (Complex Cases):**
- 11 councils operational
- Browser automation proven
- <15% error rate (acceptable with complexity)

**Overall Target:**
- 11 of 13 councils operational (New Forest, Southampton postponed)
- <10% aggregate error rate
- Cache hit ratio >80%
- P95 response time <10 seconds per lookup

---

## Recommendations Summary

**Implement First (Phase 1):**
1. ✅ **Eastleigh** - API endpoint, teaches UPRN resolution
2. ✅ **Rushmoor** - Clean form, teaches form automation

**Implement Second (Phase 2):**
3. ✅ **Fareham** - Bartec platform pattern (high reusability)
4. ✅ **East Hampshire** - PDF calendar system

**Deprioritise/Postpone:**
- ⏸️ **New Forest** - 403 bot protection, phased rollout complexity
- ⏸️ **Southampton** - Incapsula protection, use third-party alternative

**Reasoning:**
- Phase 1 establishes core patterns (UPRN, form automation)
- Phase 2 captures reusable platform patterns (Bartec, PDF)
- Phase 3 applies frameworks at scale
- Phase 4 handles complex cases once infrastructure mature
- High-risk councils postponed until better understood or infrastructure hardened

---

**Document Owner:** Naomi (Backend Developer)  
**Last Updated:** 2026-03-25  
**Review:** After each sprint completion
