# Portsmouth City Council - Acquisition Notes
**Council ID:** `portsmouth` | **Last Updated:** 2026-03-25

## Official URL
https://my.portsmouth.gov.uk

## Lookup Mechanism
**Method:** HTML Form (Granicus Portal) | **Input:** Postcode + House Number

## Key Points
- **Platform:** Granicus customer portal (my.portsmouth.gov.uk)
- Form accepts postcode and house number
- No documented public API
- Large urban authority (likely stable patterns)
- Community scrapers exist (UKBinCollectionData)

## Acquisition Strategy
1. Navigate to My Portsmouth portal
2. Handle Granicus session/cookies
3. Submit form (postcode + house number)
4. Parse HTML response
5. Alternative: Inspect XHR traffic to find underlying API

## Platform Notes
- Granicus powers multiple UK council portals
- Likely has session management and CSRF tokens
- Cookie policy consent required
- Portal authentication may be optional for lookup

## Brittleness: MEDIUM
- Granicus platform updates
- Form structure changes
- Session requirements may tighten

## Community Resources
- UKBinCollectionData has Portsmouth scraper (reference)

## Caching
- Collection schedule: 7 days TTL

## Rate Limiting
- Respectful throttling 1-2 req/sec
- Monitor for blocks from Granicus infrastructure

## Priority: Phase 3 (Standard Forms)
**Effort:** 2-3 days | **Confidence:** 65% | **Risk:** Medium
