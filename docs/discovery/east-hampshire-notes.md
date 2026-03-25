# East Hampshire District Council - Acquisition Notes

**Council ID:** `east-hampshire`  
**Last Updated:** 2026-03-25

## Official URL
https://www.easthants.gov.uk/bin-collections/find-your-bin-calendar

## Lookup Mechanism
**Method:** PDF Calendar System (Two-phase)  
**Input:** Address → Calendar Number → PDF Calendar

## How It Works
### Phase 1: Address Lookup
- Tool: http://maps.easthants.gov.uk "where I live"
- Input: Address or postcode
- Output: Calendar number (under "waste and recycling")

### Phase 2: PDF Download
- PDF calendars cover 13-month periods
- Organised by weekday and area (Round 1, Round 2, etc.)
- Downloadable from council site

## Acquisition Strategy
1. Automate address → calendar number lookup via maps tool
2. Map calendar number → PDF URL
3. Download PDF
4. Parse PDF for collection dates (OCR or structured text extraction)

## PDF Characteristics
- Structured format (predictable layout)
- 13-month coverage
- Separate calendars per collection round
- Holiday changes marked

## Parsing Tools
- PDF text extraction: pdfjs, pdf-lib
- OCR if needed: Tesseract
- Date parsing: date-fns, moment

## Security Notes
- Check robots.txt for maps subdomain
- Map lookup may have bot detection
- PDF download should be straightforward

## Brittleness: LOW
- PDF format more stable than HTML
- 13-month calendars reduce change frequency
- Calendar numbering system stable

## Caching
- Calendar number mapping: 90 days
- PDF calendars: 13 months (entire validity period)
- Aggressive caching reduces upstream load

## Reusability
PDF parsing infrastructure useful for:
- Gosport (annual PDF calendars)
- Havant (North/South PDF calendars)
- Any future councils using PDF pattern

## Implementation Priority
⭐ Phase 2 - Implement Second (Pattern Value)

**Estimated Effort:** 2-3 days  
**Confidence:** 85%  
**Risk:** Low
