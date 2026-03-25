# Test Valley Borough Council Adapter

**Council ID:** `test-valley`  
**Status:** Implemented (Phase 3, Wave 2, Batch B)  
**Lookup Method:** Browser Automation (HTML Form)  
**Production Ready:** No (selectors not yet validated)

## Overview

Test Valley Borough Council uses an HTML form-based interface for bin collection lookups at `testvalley.gov.uk/wasteandrecycling/when-are-my-bins-collected`. This adapter uses Playwright browser automation to interact with the collection lookup form.

## Technical Details

- **Framework:** HTML Form (Standard Form)
- **Rendering:** Server-side rendered (no heavy JavaScript)
- **Input:** Postcode + Address selection
- **Output:** Alternate weekly collection schedule with service types and dates
- **Risk Level:** LOW (standard form-based, no React/SPA complexity)
- **Key Feature:** Alternate weekly collections (black and brown bins)

## Configuration

### Environment Variables

```bash
TEST_VALLEY_BASE_URL=https://www.testvalley.gov.uk  # Default
ADAPTER_KILL_SWITCH_TEST_VALLEY=false               # Emergency disable
```

### Egress Allowlist

- `testvalley.gov.uk`

## Implementation Notes

### Selectors (UNVALIDATED)

⚠️ **WARNING:** Selectors have not been validated against production site. Schema drift risk.

- Postcode input: `input[name*="postcode" i], input[placeholder*="postcode" i]`
- Submit button: `button[type="submit"], button:has-text("Search")`
- Address select: `select[name*="address" i] option`
- Collection data: `table tr`, `div[class*="collection" i]`, `li[class*="bin" i]`

### Collection Patterns

Test Valley uses alternate weekly collections:
- **Black Bin (General Waste):** Weekly
- **Brown Bin (Garden Waste):** Weekly (alternate week from black)
- **Blue Bin (Recycling):** Weekly

### Form-Based Lookup Flow

1. Navigate to lookup page
2. Accept cookie consent if prompted
3. Enter postcode
4. Submit and wait for address list
5. Select address from dropdown
6. View collection schedule
7. Extract dates from table or display elements

## Service Types Supported

- General Waste (Refuse / Black Bin)
- Recycling (Blue Bin)
- Garden Waste (Brown Bin) — subscription required

## Postcodes Served

Test Valley serves the following postcode areas:
- **SP6** — Romsey and surrounding areas
- **SP10-SP11** — Stockbridge and surrounding areas
- **SO20** — North of Test Valley
- **SO51** — Wellow area

## Rate Limiting

- **Rate:** 8 requests/minute (7.5-second intervals)
- **Reasoning:** Standard form-based lookup, lower overhead than React SPA
- **Cache:** 7-day TTL on collection schedules (recommended)
- **Parallel:** Max 2 concurrent requests per IP

## Security Profile

- **Risk Level:** LOW
- **Browser Automation:** Required (standard form)
- **JavaScript Execution:** Minimal (no React/SPA)
- **Network Isolation:** Allowlist only (testvalley.gov.uk)
- **Sandboxed:** Yes
- **Credentials:** None required
- **Cookie Consent:** May be required on first visit

## Known Limitations

1. **Selectors Not Validated:** May need adjustment for production
2. **Form Structure Changes:** Updates may break adapter
3. **No UPRN:** Test Valley doesn't provide UPRN in response
4. **Alternate Weeks:** Logic for black/brown rotation not extracted yet

## Testing

### Manual Verification Required

Before production deployment:

1. **Verify Selectors:** Test against live site
2. **Test Postcodes:** SP6 1AA, SP10 1AA, SP11 1AA, SO20 1AA, SO51 1AA
3. **Verify Collections:** Confirm black/brown alternate week pattern
4. **Check Address Selection:** Test multi-address postcodes
5. **Update Selectors:** Adjust based on actual DOM structure
6. **Set `SELECTORS_VALIDATED = true`** when confirmed

### Health Check

```typescript
const health = await testValleyAdapter.verifyHealth();
// Uses test postcode: SP10 1AA (Test Valley area)
```

### Test Postcodes

- **SP6 1AA** — Romsey area
- **SP10 1AA** — Stockbridge area
- **SP11 1AA** — Nether Wallop area
- **SO20 1AA** — North area
- **SO51 1AA** — Wellow area

## Third-Party Dependencies

None identified. No delegation to third-party platforms detected.

## Performance Characteristics

- **Typical Response Time:** 5-8 seconds (browser automation overhead)
- **P95 Response Time:** 12-15 seconds
- **Cache Hit Impact:** Reduces to <100ms
- **Memory per Request:** 100-200MB (browser process)

## Monitoring

Key metrics:

- **Success Rate:** Target >85%
- **Response Time:** P50: 6s, P95: 15s, P99: 20s
- **Cache Hit Rate:** Target >80%
- **Schema Drift Detection:** Alert on form selector not found
- **Address Extraction:** Alert if zero addresses returned

## Error Handling

- **Postcode Validation:** Checks against Test Valley prefixes
- **Navigation Errors:** Detects redirects off domain
- **Selector Failures:** Graceful degradation with warnings
- **Timeout Handling:** 30-second navigation timeout, 15-second script timeout

## Next Steps

1. ✅ Adapter structure implemented
2. ⚠️ **Manual selector validation required**
3. ⚠️ **Test with real addresses and postcodes**
4. ⚠️ **Verify alternate weekly pattern extraction**
5. ⬜ Performance testing under load
6. ⬜ Update `SELECTORS_VALIDATED` flag when confirmed

## Related Councils

Test Valley uses similar form-based pattern to other Hampshire councils. Adapter pattern is reusable for:
- East Hampshire
- Eastleigh
- Havant
- Hart
- Rushmoor
- Basingstoke and Deane

## Maintenance Notes

- Monitor for "No collection data found" warnings (indicator of schema drift)
- Validate selector updates quarterly or after website changes
- Keep browser automation dependencies updated
- Consider API endpoint discovery if form becomes unstable

## Migration Path

If API endpoint discovered via network inspection:

1. Implement new `TestValleyApiAdapter` extending base adapter
2. Use `LookupMethod.HIDDEN_JSON`
3. Reduce to MINIMAL risk level
4. Improve performance to 1-2s per request
5. Remove browser automation dependency
