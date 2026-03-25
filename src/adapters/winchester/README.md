# Winchester City Council Adapter

**Council ID:** `winchester`  
**Status:** Implemented (Phase 3, Wave 2, Batch B)  
**Lookup Method:** Browser Automation (React SPA)  
**Production Ready:** No (selectors not yet validated)

## Overview

Winchester City Council uses a JavaScript-rendered React SPA for bin collection lookups at `my.winchester.gov.uk/icollectionday/`. This adapter uses Playwright browser automation to interact with the React application.

## Technical Details

- **Framework:** React Single Page Application
- **Rendering:** Client-side JavaScript required
- **Input:** Postcode (SO21-SO23, SO32)
- **Output:** Collection schedule with service types and dates
- **Risk Level:** MEDIUM (browser automation, React SPA)

## Configuration

### Environment Variables

```bash
WINCHESTER_BASE_URL=https://www.winchester.gov.uk  # Default
ADAPTER_KILL_SWITCH_WINCHESTER=false              # Emergency disable
```

### Egress Allowlist

- `winchester.gov.uk`

## Implementation Notes

### Selectors (UNVALIDATED)

⚠️ **WARNING:** Selectors have not been validated against production site. Schema drift risk.

- Postcode input: `input[name*="postcode" i], input[placeholder*="postcode" i]`
- Submit button: `button[type="submit"], button:has-text("Search")`
- Address select: `select[name*="address" i] option`
- Collection data: `table tr`, `div[class*="collection" i]`

### React SPA Considerations

1. **JavaScript Execution Required**: Empty HTML shell without JS
2. **Wait Times**: Increased timeouts for React rendering (2-3s)
3. **Dynamic Selectors**: React components may use generated class names
4. **XHR Inspection Recommended**: Discover underlying API endpoints

### Alternative: API Discovery

Portsmouth discovery notes suggest XHR endpoint inspection. Winchester React app likely calls backend API:

1. Use browser dev tools → Network tab
2. Perform manual lookup
3. Inspect XHR/fetch calls
4. Reverse-engineer API endpoints
5. If found, implement as `LookupMethod.HIDDEN_JSON` (faster, more reliable)

## Service Types Supported

- General Waste (Refuse)
- Recycling
- Glass
- Food Waste
- Garden Waste (subscription required)

## Rate Limiting

- **Rate:** 6 requests/minute (10-second intervals)
- **Reasoning:** Browser automation creates significant load
- **Cache:** 7-day TTL on collection schedules (aggressive caching essential)

## Security Profile

- **Risk Level:** MEDIUM
- **Browser Automation:** Required
- **JavaScript Execution:** Yes (from winchester.gov.uk)
- **Network Isolation:** Allowlist only (winchester.gov.uk)
- **Sandboxed:** Yes
- **Credentials:** None required

## Known Limitations

1. **Selectors Not Validated:** Schema drift risk — selectors may not match production
2. **React Updates:** Application updates may break adapter
3. **Performance:** 8-15s per request (browser overhead)
4. **Resource Intensive:** 200-400MB memory per execution

## Testing

### Manual Verification Required

Before production deployment:

1. **Verify Selectors:** Test against live site
2. **Update Selectors:** Adjust based on actual DOM structure
3. **Set `SELECTORS_VALIDATED = true`** when confirmed
4. **Test Postcodes:** SO21 1AA, SO22 4NR, SO23 8UD, SO32 1AA

### Health Check

```typescript
const health = await winchesterAdapter.verifyHealth();
// Uses test postcode: SO23 8UD (Winchester city centre)
```

## Third-Party Dependencies

None identified. No delegation to third-party platforms detected.

## Community Resources

- **bin-collection-app** (GitHub: EnterTheVortex2/bin-collection-app)
  - React/TypeScript PWA for Winchester
  - Reference implementation for data structures
  - Tech: React, Vite, date-fns

## Migration Path

If API endpoint discovered via XHR inspection:

1. Implement new `WinchesterApiAdapter` extending base adapter
2. Use `LookupMethod.HIDDEN_JSON`
3. Reduce from MEDIUM to LOW risk level
4. Improve performance to 1-2s per request
5. Remove browser automation dependency

## Monitoring

Key metrics:

- **Success Rate:** Target >85% (lower than API due to DOM brittleness)
- **Response Time:** P50: 10s, P95: 18s, P99: 25s
- **Cache Hit Rate:** Target >80%
- **Schema Drift Detection:** Alert on selector not found

## Next Steps

1. ✅ Adapter implemented
2. ⚠️ **Manual selector validation required**
3. ⚠️ **XHR endpoint discovery recommended**
4. ⬜ Production testing with real postcodes
5. ⬜ Update `SELECTORS_VALIDATED` flag when confirmed

## Related Councils

Winchester pattern (React SPA) is unique in this implementation phase. If other Hampshire councils adopt similar JavaScript frameworks, this pattern is reusable.
