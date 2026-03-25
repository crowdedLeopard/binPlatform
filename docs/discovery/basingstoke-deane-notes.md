# Basingstoke & Deane Borough Council - Acquisition Notes

**Council ID:** `basingstoke-deane`  
**Last Updated:** 2026-03-25

## Official URL
https://www.basingstoke.gov.uk/bincollections

## Lookup Mechanism
**Method:** HTML Form (Whitespace backend, no public API)  
**Input:** Postcode, street name, or house name  
**Output:** HTML response with collection schedule

## Platform
**Backend:** Whitespace (community-reported, not confirmed)  
**API:** No public API exposed  
**Pattern:** Common across southern England councils

## Acquisition Path
1. POST form with postcode/street/house name
2. Parse HTML response for collection dates
3. Extract: Rubbish, recycling, food waste, garden waste dates

## Security Notes
- Check robots.txt
- Standard CSRF protection expected
- Input sanitisation required
- Community scraper exists (UKBinCollectionData) as reference

## Brittleness: MEDIUM
- No API contract
- HTML structure changes would break adapter
- Whitespace backend updates could change interface

## Rate Limiting
Unknown - start with 1-2 req/sec, monitor for blocks

## Community Resources
- UKBinCollectionData has working scraper
- Example postcode: RG24 8PJ (test case)

## Caching
- Collection schedule: 7 days TTL
- Postcode lookup: 90 days

## Implementation Priority
⚠️ Phase 5 - Consider after form automation framework proven

**Estimated Effort:** 2-3 days  
**Confidence:** 65%  
**Risk:** Medium
