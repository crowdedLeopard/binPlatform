# Winchester City Council - Acquisition Notes

**Council ID:** `winchester`  
**Last Updated:** 2026-03-25

## Official URL
https://www.winchester.gov.uk/bins

## Lookup Mechanism
**Method:** Browser Automation Required (React SPA)  
**Tech:** JavaScript Single Page Application

## Technical Details
- **Framework:** React (path: /icollectionday/)
- **Rendering:** Client-side JavaScript required
- **HTML Fetch:** Returns empty shell, no content without JS execution
- **Portal:** my.winchester.gov.uk/icollectionday/

## Acquisition Strategy
### Option A: Browser Automation (Recommended)
1. Use Playwright/Puppeteer
2. Load page with JS execution
3. Enter postcode/address
4. Wait for results render
5. Extract collection dates from DOM

### Option B: XHR Endpoint Discovery
1. Use browser dev tools (Network tab)
2. Inspect XHR/Fetch calls during lookup
3. Reverse-engineer API endpoints
4. Replicate calls directly (if auth not required)

## Community Resources
**bin-collection-app** (GitHub: EnterTheVortex2/bin-collection-app)
- React/TypeScript PWA for Winchester
- Shows collection logic and data structures
- Reference implementation for date handling
- Tech stack: React, Vite, vite-plugin-pwa, date-fns

## Security Notes
- React SPA likely calls backend API
- May have auth tokens or CSRF protection
- Browser automation avoids reverse-engineering
- Check robots.txt for both main site and my.winchester

## Brittleness: MEDIUM
- React updates could change component structure
- API endpoints (if discovered) may change
- Browser automation more resilient than API calls

## Infrastructure Required
- Playwright or Puppeteer
- Headless browser runtime
- Screenshot capability (for debugging)
- Longer execution time vs. direct HTTP

## Caching
- Collection schedule: 7 days TTL
- Aggressive caching essential (browser automation is expensive)

## Rate Limiting
- Very conservative: 5-10 seconds between requests
- Browser automation creates more load than HTTP
- Respect upstream resources

## Implementation Priority
⚠️ Phase 4 - Complex Cases (after infrastructure ready)

**Estimated Effort:** 2-3 days (browser automation)  
**Confidence:** 75%  
**Risk:** Medium
