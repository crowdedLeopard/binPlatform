# Havant Borough Council - Acquisition Notes
**Council ID:** `havant` | **Last Updated:** 2026-03-25

## Official URL
https://www.havant.gov.uk/bin-collections

## Lookup Mechanism
**Method:** HTML Form | **Input:** Postcode or address

## Key Points
- Postcode/address lookup form
- Downloadable PDF calendars split by North/South areas (2026)
- Alternate weekly service (rubbish one week, recycling next)
- Food waste collections starting Spring 2026

## Acquisition Strategy
1. POST form with postcode/address
2. Parse HTML response
3. Download area-specific PDF calendar (North or South)
4. Handle area distinction in data model

## Special Handling
- **North/South Area Split:** Determine area from address
- Service changes: Food waste rollout in Spring 2026

## Brittleness: MEDIUM
- HTML structure changes
- North/South area system changes
- PDF calendar format changes

## Caching
- Collection schedule: 7 days TTL
- PDF calendars: 365 days (annual)

## Priority: Phase 3 (Standard Forms)
**Effort:** 1-2 days | **Confidence:** 65% | **Risk:** Medium
