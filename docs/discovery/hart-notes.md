# Hart District Council - Acquisition Notes
**Council ID:** `hart` | **Last Updated:** 2026-03-25

## Official URL
https://www.hart.gov.uk/waste-and-recycling/when-my-bin-day

## Lookup Mechanism
**Method:** HTML Form | **Input:** Postcode

## Key Points
- Clean postcode lookup form
- Year-round calendar download available
- Alternative map tool: maps.hart.gov.uk/mycouncil.aspx
- Backend platform unconfirmed (not Whitespace/Bartec/Alloy per research)

## Acquisition Strategy
1. POST form with postcode
2. Parse HTML response for collection day
3. Download calendar for year-ahead data
4. Map tool as fallback if main form blocks

## Brittleness: MEDIUM
- Standard HTML structure brittleness
- Form parameter changes possible
- Calendar download adds resilience

## Caching
- Collection schedule: 7 days TTL
- Calendar file: 365 days

## Priority: Phase 3 (Standard Forms)
**Effort:** 1-2 days | **Confidence:** 70% | **Risk:** Medium
