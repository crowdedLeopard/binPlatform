# Test Valley Borough Council - Acquisition Notes
**Council ID:** `test-valley` | **Last Updated:** 2026-03-25

## Official URL
https://testvalley.gov.uk/wasteandrecycling/when-are-my-bins-collected

## Lookup Mechanism
**Method:** HTML Form | **Input:** Postcode or address

## Key Points
- Standard postcode lookup form
- Alternate weekly collections (black bin household waste, brown bin recycling)
- My Test Valley portal exists: my.testvalley.gov.uk
- Bins must be out by 7am on collection day
- No downloadable calendar identified

## Acquisition Strategy
1. POST form with postcode/address
2. Parse HTML response for collection schedule
3. Check My Test Valley portal for potential API endpoints
4. Standard form automation pattern

## Portal Investigation
- my.testvalley.gov.uk may have structured endpoints
- Worth inspecting for JSON/API patterns
- Could simplify acquisition if API exists

## Brittleness: MEDIUM
- HTML structure changes
- No calendar download complicates caching
- Portal changes could affect lookup

## Caching
- Collection schedule: 7 days TTL (no long-term calendar available)
- More frequent updates needed vs. councils with calendars

## Community Resources
- Check UKBinCollectionData for existing implementations

## Priority: Phase 3 (Standard Forms)
**Effort:** 1-2 days | **Confidence:** 70% | **Risk:** Medium
