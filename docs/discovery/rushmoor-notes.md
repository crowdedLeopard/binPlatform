# Rushmoor Borough Council - Acquisition Notes

**Council ID:** `rushmoor`  
**Last Updated:** 2026-03-25  
**Status:** ⭐ High Priority - Phase 1 Implementation

---

## Official Waste Collection Page

**Primary URL:** https://www.rushmoor.gov.uk/recycling-rubbish-and-environment/bins-and-recycling/bin-collection-day-finder/

---

## Lookup Mechanism

### Method: HTML Form Submission

**Input:** Postcode or street name  
**Form Type:** POST or GET (requires inspection)  
**Response:** HTML with collection schedule

### How It Works

1. User enters postcode or street name in search box
2. Form submits to backend
3. Response returns collection days and calendar download link
4. Clean, user-friendly interface (good for straightforward automation)

---

## Required Inputs

**Primary:** Postcode (with or without space)  
**Optional:** Street name

**Validation:**
- Postcode format: AA9A 9AA or similar UK postcode patterns
- Street name: Free text (sanitise for form injection)

---

## Parsing Strategy

**Response Format:** HTML (expected)

**Extract:**
- Next collection dates for: Green bin (rubbish), Blue bin (recycling), Glass box/purple bin, Food waste (weekly), Garden waste (if subscribed)
- Collection day of week
- Calendar download link (cache opportunity)

**Tools:** Cheerio/BeautifulSoup for HTML parsing

---

## Security Considerations

### Form Protection
- CSRF token likely (inspect form for hidden fields)
- Cookie consent may be required
- Standard input sanitisation

### Rate Limiting
- Low-risk profile suggests reasonable tolerance
- Start with 1-2 req/sec
- Monitor for blocks

---

## Brittleness Concerns

**Medium Risk:**
- HTML structure changes
- Form parameter names change
- Calendar format changes

**Mitigation:** Version detection, graceful degradation

---

## Caching Strategy

**Collection Schedule:** 7 days TTL  
**Calendar File:** 180 days (if downloadable calendar available)  
**Postcode→Address:** 90 days

---

## Implementation Checklist

- [ ] Inspect form (parameters, method, CSRF token)
- [ ] Test form submission manually
- [ ] Build form automation (handle CSRF)
- [ ] Parse HTML response
- [ ] Extract collection dates
- [ ] Download and cache calendar if available
- [ ] Rate limiting
- [ ] Error handling

---

**Confidence Level:** HIGH (75%)  
**Implementation Priority:** 🥇 Phase 1 - Implement First  
**Estimated Effort:** 1-2 days  
**Upstream Risk:** Low
