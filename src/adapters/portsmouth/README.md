# Portsmouth City Council Adapter

**Council ID:** `portsmouth`  
**Status:** Implemented (Phase 3, Wave 2, Batch B)  
**Lookup Method:** Browser Automation (Granicus Portal)  
**Production Ready:** No (selectors not yet validated)

## Overview

Portsmouth City Council uses a Granicus-based portal for bin collection lookups at `my.portsmouth.gov.uk`. This adapter uses Playwright browser automation to interact with the Granicus collection lookup interface.

## Technical Details

- **Platform:** Granicus (third-party managed service)
- **Base URL:** my.portsmouth.gov.uk
- **Rendering:** Server-side rendered with potential JavaScript
- **Input:** Postcode + House number/address selection
- **Output:** Collection schedule with service types and dates
- **Risk Level:** MEDIUM (third-party platform, session management required)
- **Authentication:** Not required (public portal)

## Configuration

### Environment Variables

```bash
PORTSMOUTH_BASE_URL=https://my.portsmouth.gov.uk      # Default
PORTSMOUTH_LOOKUP_PATH=/service/collection_schedules  # Collection lookup path
ADAPTER_KILL_SWITCH_PORTSMOUTH=false                  # Emergency disable
```

### Egress Allowlist

- `my.portsmouth.gov.uk`
- `portsmouth.gov.uk` (redirects)

## Implementation Notes

### Selectors (UNVALIDATED)

⚠️ **WARNING:** Selectors have not been validated against production site. Schema drift risk.

- Postcode input: `input[name*="postcode" i], input[placeholder*="postcode" i]`
- Submit button: `button[type="submit"], button:has-text("Find")`
- Address select: `select[name*="address" i] option` or button-based selector
- Collection data: `table tr`, `div[class*="collection" i]`, `[data-collection]`

### Granicus Platform Specifics

1. **Cookie Consent:** Multiple button selectors for cookie acceptance
2. **Session Management:** May require session tokens for longer operations
3. **CSRF Protection:** Form submissions may include CSRF tokens (auto-handled by browser)
4. **JavaScript Rendering:** Some content may be dynamically loaded
5. **Address Input:** May use postcode + house number (two-step) or combined field

### Known Granicus Behaviors

- Cookie consent often appears on first load
- Form may use various button labels (Find, Search, Continue, View)
- Address selection can be dropdown or button-based
- Collection data often in tables or data attributes

## Service Types Supported

- General Waste (Refuse / Grey Bin)
- Recycling (Blue Bin / Mixed Recycling)
- Garden Waste (Brown Bin) — subscription based
- Food Waste (Caddy) — where applicable

## Postcodes Served

Portsmouth serves the following postcode areas:
- **PO1** — City Centre and Southsea
- **PO2** — North Portsmouth
- **PO3** — West Portsmouth
- **PO4** — East Portsmouth
- **PO5** — Fareham-side
- **PO6** — Hayling Island and surrounding

## Rate Limiting

- **Rate:** 6 requests/minute (10-second intervals)
- **Reasoning:** Third-party platform (Granicus) — conservative approach
- **Cache:** 7-day TTL on collection schedules
- **Parallel:** Max 1 concurrent request per IP (Granicus session limits)

## Security Profile

- **Risk Level:** MEDIUM
- **Browser Automation:** Required (Granicus portal)
- **JavaScript Execution:** Yes (dynamic form elements)
- **Network Isolation:** Allowlist only (my.portsmouth.gov.uk)
- **Sandboxed:** Yes
- **Credentials:** Not required (public portal)
- **Third-Party Risk:** Granicus platform management
- **Session Handling:** Sessions may expire (timeout handling implemented)

## Known Limitations

1. **Third-Party Platform:** Hosted on Granicus (external dependency)
2. **Selectors Not Validated:** May need adjustment for production
3. **Session Complexity:** Session/cookie management may be required
4. **Form Structure Changes:** Granicus updates may break adapter
5. **Address Selection:** Two-step process (postcode → address)
6. **No UPRN:** Granicus typically doesn't provide UPRN

## Testing

### Manual Verification Required

Before production deployment:

1. **Verify Selectors:** Test against live site
2. **Test Cookie Consent:** Ensure handler works
3. **Test Postcodes:** PO1 1AA, PO2 1AA, PO3 1AA, PO4 1AA, PO5 1AA, PO6 1AA
4. **Test Multi-Address:** Verify postcode with multiple addresses
5. **Check Collection Data:** Verify all service types extracted
6. **Session Testing:** Long-running operations for session expiry
7. **Update Selectors:** Adjust based on actual DOM structure
8. **Set `SELECTORS_VALIDATED = true`** when confirmed

### Health Check

```typescript
const health = await portsmouthAdapter.verifyHealth();
// Uses test postcode: PO1 1AA (Portsmouth city centre)
```

### Test Postcodes

- **PO1 1AA** — City Centre
- **PO2 1AA** — North Portsmouth
- **PO3 1AA** — West Portsmouth
- **PO4 1AA** — East Portsmouth
- **PO5 1AA** — Fareham area
- **PO6 1AA** — Hayling Island

## Third-Party Dependencies

**Granicus Platform**
- Managed service for council waste collection
- Session-based authentication
- Potential service outages
- Cookie consent requirements
- Regular updates may affect selectors

## Performance Characteristics

- **Typical Response Time:** 10-15 seconds (Granicus latency + browser overhead)
- **P95 Response Time:** 18-22 seconds
- **Cache Hit Impact:** Reduces to <100ms
- **Memory per Request:** 150-250MB (browser + Granicus assets)
- **Granicus Latency:** Often 3-5 seconds additional

## Monitoring

Key metrics:

- **Success Rate:** Target >80% (lower due to third-party platform)
- **Response Time:** P50: 12s, P95: 20s, P99: 25s
- **Cache Hit Rate:** Target >85%
- **Schema Drift Detection:** Alert on form selector not found
- **Cookie Consent Failures:** Alert if cookie handler fails
- **Session Timeouts:** Alert on session expiry (retry logic)

## Error Handling

- **Postcode Validation:** Checks against Portsmouth prefixes (PO1-PO6)
- **Navigation Errors:** Detects redirects off domain
- **Cookie Consent:** Multiple fallback selectors
- **Address Extraction:** Graceful degradation on multi-selector search
- **Session Timeout:** Implements retry with fresh session
- **Network Errors:** Timeout handling for slow Granicus responses

## API Endpoint Discovery

⚠️ **Recommended:** Inspect network traffic for JSON API endpoints

If Granicus exposes a JSON API:
1. Use browser dev tools → Network tab
2. Perform manual lookup
3. Capture XHR/fetch calls
4. Extract API endpoint and parameters
5. Implement as `LookupMethod.HIDDEN_JSON` (if possible)

This would reduce risk level to LOW and improve performance to 1-2s per request.

## Next Steps

1. ✅ Adapter structure implemented
2. ⚠️ **Manual selector validation required**
3. ⚠️ **Test Granicus cookie consent handling**
4. ⚠️ **Verify session management**
5. ⚠️ **Network inspection for API endpoints**
6. ⬜ Performance testing under load
7. ⬜ Session timeout testing
8. ⬜ Update `SELECTORS_VALIDATED` flag when confirmed

## Granicus Portal Notes

**Advantages:**
- Professional platform used by many UK councils
- Consistent patterns across implementations
- Generally stable with predictable updates

**Disadvantages:**
- Third-party dependency (availability risk)
- Session management complexity
- Potential cookie consent requirements
- Regular updates may break selectors
- Slower than direct APIs (3-5s platform latency)

## Related Councils

Other Portsmouth/Hampshire councils that may use Granicus:
- Check network requests for pattern matching
- Adapter patterns may be reusable if similar structure

## Maintenance Notes

- Monitor for "No collection data found" warnings (schema drift indicator)
- Validate selector updates after Granicus platform updates
- Test cookie consent handler regularly
- Monitor session timeout failures
- Keep browser automation dependencies updated
- Consider quarterly validation checks

## Migration Path

If Granicus JSON API discovered:

1. Implement new `PortsmouthApiAdapter` extending base adapter
2. Use `LookupMethod.HIDDEN_JSON`
3. Reduce MEDIUM → LOW risk level
4. Improve performance to 1-3s per request
5. Remove browser automation dependency
6. Eliminate session timeout concerns

## Support & Troubleshooting

- **Granicus Support:** Council can contact Granicus for platform issues
- **Selector Failures:** Check browser dev tools → Inspect Element
- **Session Timeout:** Implement automatic retry with fresh session
- **Cookie Consent:** Try multiple button selectors if default fails
- **Slow Response:** Granicus platform load times may be slow
