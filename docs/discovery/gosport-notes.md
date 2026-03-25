# Gosport Borough Council - Acquisition Notes
**Council ID:** `gosport` | **Last Updated:** 2026-03-25

## Official URL
https://www.gosport.gov.uk/refuserecyclingdays

## Lookup Mechanism
**Method:** HTML Form | **Input:** Postcode (with space required)

## Key Points
- Cookie consent banner present (handle in automation)
- Annual PDF calendar available (2025/26) - caching opportunity
- Form requires postcode with space format
- Standard form automation pattern

## Acquisition Strategy
1. POST form with postcode
2. Handle cookie consent interaction
3. Parse HTML for collection dates
4. Download annual PDF calendar for year-ahead caching

## Brittleness: MEDIUM
- Cookie consent adds automation complexity
- HTML structure changes would break parser
- PDF calendar more stable (annual format)

## Caching
- Collection schedule: 7 days TTL
- PDF calendar: 365 days (annual)

## Priority: Phase 3 (Standard Forms)
**Effort:** 1-2 days | **Confidence:** 70% | **Risk:** Medium
