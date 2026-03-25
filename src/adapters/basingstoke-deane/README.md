# Basingstoke & Deane Borough Council Adapter

**Council ID:** `basingstoke-deane`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ⚠️ Selectors Not Yet Validated

---

## ⚠️ IMPORTANT: Selectors Require Validation

This adapter has been implemented based on common council website patterns but **has not yet been validated against the live Basingstoke & Deane website**. Before deploying to production:

1. Test against live site with real postcodes
2. Verify all selectors match actual page structure
3. Update selectors as needed
4. Set `SELECTORS_VALIDATED = true` in `index.ts`

---

## Acquisition Path

### Method: Browser Automation (Playwright)

Basingstoke uses an HTML form-based bin collection lookup with Whitespace backend (community-reported, not confirmed).

**Lookup Page:**
```
https://www.basingstoke.gov.uk/bincollections
```

**Workflow:**
1. Navigate to lookup page
2. Fill postcode/street/house name input field
3. Submit form
4. Parse results (address selection if multiple)
5. Extract collection schedule from results page

---

## Input Requirements

### Primary Input: Postcode

**Format:** UK postcode (e.g., `RG24 8PJ`, `RG21 3DS`)

**Validation:**
- Must match UK postcode pattern
- Normalized with single space between outward and inward codes
- Case-insensitive

### Optional Inputs

The form may also accept:
- Street name
- House name or number

---

## Service Types Supported

- **General Waste** (Rubbish / Black Bin)
- **Recycling** (Blue Bin)
- **Food Waste**
- **Garden Waste** (Subscription service)

---

## Browser Automation Configuration

### Security Hardening

**Allowed Domains:**
- `basingstoke.gov.uk` only

**Timeouts:**
- Navigation: 30 seconds
- Script execution: 15 seconds

**Network Isolation:**
- Allowlist-only (basingstoke.gov.uk)
- Cloud metadata endpoints blocked
- No general internet access

**Evidence Capture:**
- Screenshots on failure
- HTML response storage

---

## Selectors Used (⚠️ REQUIRES VALIDATION)

### Postcode Input
```
input[name*="postcode" i]
input[id*="postcode" i]
input[placeholder*="postcode" i]
```

### Submit Button
```
button[type="submit"]
input[type="submit"]
button:has-text("Search")
button:has-text("Find")
```

### Address Selection
```
select[name*="address" i] option
ul li a
div.address-item
label:has(input[type="radio"])
table tbody tr
```

### Collection Data
```
table tr
.collection-item
.bin-schedule div
dl dt
ul li
```

**These selectors are based on common patterns and MUST be verified against the live site.**

---

## Environment Variables

### Base URL (Optional)
```bash
BASINGSTOKE_BASE_URL=https://www.basingstoke.gov.uk
```

### Kill Switch
```bash
ADAPTER_KILL_SWITCH_BASINGSTOKE_DEANE=true
```

---

## Caching Strategy

**TTL:** 7 days

**Rationale:**
- Collections are weekly/fortnightly
- Browser automation is expensive
- Aggressive caching reduces load

---

## Security Profile

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Browser Automation Required** | Yes |
| **Executes JavaScript** | Yes (basingstoke.gov.uk only) |
| **External Domains** | basingstoke.gov.uk |
| **Handles Credentials** | No |
| **Network Isolation** | Allowlist only |
| **Sandboxed** | Yes |

---

## Performance Characteristics

### Expected Execution Time

- **Address resolution:** 5-10 seconds
- **Collection schedule:** 8-15 seconds
- **Total end-to-end:** 10-20 seconds

### Resource Usage

- **Memory:** ~200-400MB per browser instance
- **CPU:** Moderate during page load
- **Network:** ~500KB-2MB per lookup

---

## Known Risks

### Brittleness: MEDIUM-HIGH

1. **HTML Structure Changes** — Form field names or result selectors change
2. **Whitespace Platform Updates** — Backend platform changes could alter interface
3. **Cookie Consent Banners** — May block form interaction
4. **Bot Detection** — Council may implement rate limiting or CAPTCHA

### Mitigation

- Schema drift detection (selector presence checks)
- Automated alerts on failure rate increase
- Community scraper (UKBinCollectionData) as reference
- Fallback to API if discovered

---

## Testing Postcodes

```
RG24 8PJ  (Basingstoke town center)
RG21 3DS  (Residential area)
```

---

## Implementation Notes

### Based on Discovery Research

- Community reports indicate Whitespace backend (not confirmed)
- No public API exposed in research
- UKBinCollectionData project has working scraper (reference pattern)
- Form accepts postcode, street name, or house name

### Next Steps Before Production

1. ✅ Implement adapter skeleton (DONE)
2. ⏸️ Validate selectors against live site
3. ⏸️ Test with real postcodes
4. ⏸️ Adjust selectors based on actual HTML structure
5. ⏸️ Set `SELECTORS_VALIDATED = true`
6. ⏸️ Integration testing
7. ⏸️ Production deployment

---

## References

- [Basingstoke Bin Collections](https://www.basingstoke.gov.uk/bincollections)
- Discovery Notes: `docs/discovery/basingstoke-deane-notes.md`
- Council Registry: `data/council-registry.json`
- UKBinCollectionData: Community scraper reference
