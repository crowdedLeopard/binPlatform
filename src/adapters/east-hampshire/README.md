# East Hampshire District Council Adapter

**Council ID:** `east-hampshire`  
**Method:** PDF Calendar Parsing  
**Status:** ✅ Production Ready (Phase 3)  
**Last Updated:** 2026-03-25

---

## Acquisition Path

### Method: PDF Calendar System (Two-Phase)

East Hampshire publishes 13-month collection calendars as downloadable PDFs, organized by collection area/round.

**Phase 1: Postcode → Collection Area**
- Input: Postcode (GU30-GU35 range)
- Lookup: Static mapping table (with dynamic fallback capability)
- Output: Collection area code (area-1 through area-6)

**Phase 2: Collection Area → PDF Calendar**
- Input: Area code
- Download: PDF calendar for that area
- Parse: Extract collection dates using text extraction
- Output: Collection events with service types

### URL Pattern

PDF calendars are hosted on East Hampshire website:
```
https://www.easthants.gov.uk/sites/default/files/documents/calendar-area-{N}.pdf
```

Where `{N}` is the collection area number (1-6).

---

## Postcode Coverage

East Hampshire primarily covers postcodes in the GU30-GU35 range:

| Postcode Prefix | Area | Collection Area Code |
|-----------------|------|---------------------|
| GU30 | Liphook | area-1 |
| GU31 | Petersfield | area-2 |
| GU32 | Petersfield East | area-3 |
| GU33 | Alton | area-4 |
| GU34 | Alton East | area-5 |
| GU35 | Bordon/Whitehill | area-6 |

**Note:** This is a best-effort static mapping. The actual area boundaries may be more granular. Dynamic lookup from `maps.easthants.gov.uk` is available as a fallback.

---

## PDF Calendar Characteristics

**Format:** Structured PDF (text-extractable, not image-based)  
**Coverage:** 13 months (current month + 12 months ahead)  
**Layout:** Calendar grid with collection dates highlighted  
**Service Types:** Multiple services marked (refuse, recycling, garden, food, glass)  
**Update Frequency:** Annual or semi-annual

### Example PDF Structure

```
Collection Calendar - Area 2
April 2026 - April 2027

[Calendar Grid]

Black Bin (Refuse):
- 1st April
- 15th April
- 29th April
...

Blue Bin (Recycling):
- 8th April
- 22nd April
...

Green Bin (Garden Waste):
- 8th April (subscription service)
- 22nd April
...
```

---

## PDF Parsing Strategy

### Text Extraction
- **Library:** `pdf-parse` (Node.js, no code execution)
- **Method:** Extract all text from PDF pages
- **Date Patterns:** Multiple regex patterns for UK date formats
- **Service Inference:** Context analysis around each date

### Date Pattern Matching

1. **DD/MM/YYYY Format:** `15/04/2026`
2. **DD Month YYYY Format:** `15 April 2026`, `15th April 2026`
3. **ISO Format:** `2026-04-15` (less common)

### Service Type Inference

Service types are inferred from text context surrounding each date:

- **200 characters before/after** the date are analyzed
- **Keywords matched:**
  - `refuse`, `rubbish`, `black`, `general` → `general_waste`
  - `recycl`, `blue`, `mixed` → `recycling`
  - `garden`, `green`, `brown` → `garden_waste`
  - `food`, `caddy` → `food_waste`
  - `glass` → `glass`

### Confidence Scoring

PDF parsing confidence is **0.75** by default (lower than API data):
- Text extraction successful: +0.2
- Multiple service types found: +0.1
- 10+ dates extracted: +0.1
- No parsing warnings: +0.1

Maximum confidence: **1.0**

---

## Security Considerations

### PDF Security
- **Download validation:**
  - Domain allowlist: `easthants.gov.uk` only
  - Content-Type check: Must be `application/pdf`
  - Size limit: 5MB maximum (reject larger files)
- **Parsing safety:**
  - `pdf-parse` library does not execute JavaScript
  - Text extraction only (no rendering)
  - Buffer scanned for embedded JavaScript (warning only)

### Network Isolation
- **Egress allowlist:** `easthants.gov.uk`, `www.easthants.gov.uk` only
- **Cloud metadata blocked:** `169.254.169.254` prohibited
- **Timeout enforcement:** 30s download timeout

---

## Caching Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| PDF calendars | 12 hours | PDFs change infrequently (annual/semi-annual) |
| Postcode → area mapping | 90 days | Area boundaries stable |
| Parsed collection dates | 7 days | Refresh weekly to catch updates |

**Aggressive caching** is recommended due to:
- PDFs cover 13 months (long validity)
- Reduces upstream load (PDF downloads are bandwidth-heavy)
- Minimizes parsing overhead

---

## Error Handling

### PDF Download Failures
- **404 Not Found:** PDF URL may have changed (schema drift)
- **Timeout:** PDF download exceeded 30s (network issue or large file)
- **Invalid Content-Type:** Server returned non-PDF content
- **File Too Large:** PDF exceeds 5MB limit

### Parsing Failures
- **No dates found:** PDF structure changed or text extraction failed
- **Invalid date format:** Date pattern not recognized
- **Service type unknown:** Context analysis couldn't determine service

---

## Rate Limiting

**Limit:** 10 requests/minute (conservative due to PDF downloads)  
**Backoff:** Exponential (10s → 20s → 40s on consecutive failures)  
**Circuit breaker:** 5 consecutive failures → 1 hour pause

---

## Reusability

This adapter extends **`PdfCalendarBaseAdapter`**, a reusable base class for all councils using PDF calendars.

**Reusable components:**
- PDF download with validation
- Text extraction
- Date pattern matching
- Service type inference
- Security validation

**Other PDF calendar councils:** Gosport, Havant, and any future councils publishing PDF calendars.

---

## Configuration

### Environment Variables
- `ADAPTER_KILL_SWITCH_EAST_HAMPSHIRE=true` — Disable adapter without deployment

### No authentication required
East Hampshire PDFs are publicly accessible.

---

## Monitoring

### Health Check
- **Endpoint:** `GET /adapters/east-hampshire/health`
- **Test Postcode:** `GU31 4AA` (Petersfield)
- **Success criteria:** Area lookup succeeds

### Metrics
- Success rate (target: >90%)
- PDF download time (P50, P95, P99)
- Parsing success rate
- Date extraction count per PDF

---

## Known Limitations

1. **Postcode Dependency:** Requires postcode in GU30-GU35 range
2. **Area Granularity:** Static mapping may not cover all edge cases
3. **Service Type Inference:** Context-based matching not 100% accurate
4. **PDF Structure Changes:** Calendar redesign will break parser
5. **13-Month Coverage Only:** No historical data, limited future coverage

---

## Future Enhancements

### Dynamic Area Lookup
Currently, area lookup uses a static postcode→area table. Future enhancement:

**Implement browser automation** to query `maps.easthants.gov.uk`:
1. Navigate to "where I live" tool
2. Search postcode
3. Extract calendar number from "waste and recycling" section
4. Return area code

This would handle edge cases not covered by static mapping.

### OCR Fallback
If PDFs become image-based (non-text), implement OCR using Tesseract:
- Extract images from PDF pages
- OCR text from images
- Apply same date/service parsing

---

## Troubleshooting

### "No collection area found for postcode"
- Postcode not in GU30-GU35 range (not East Hampshire)
- Postcode not in static mapping table (edge case)
- **Solution:** Check postcode validity, implement dynamic lookup

### "PDF download timeout"
- PDF file too large or slow server response
- Network connectivity issue
- **Solution:** Increase timeout (cautiously) or check network

### "No collection dates found in PDF"
- PDF structure changed (calendar redesigned)
- PDF is image-based (not text-extractable)
- **Solution:** Inspect PDF manually, update parser, implement OCR

---

## References

- **Discovery Notes:** `docs/discovery/east-hampshire-notes.md`
- **Base Adapter:** `src/adapters/base/pdf-calendar-adapter.ts`
- **Area Lookup:** `src/adapters/east-hampshire/area-lookup.ts`
- **Parser:** `src/adapters/east-hampshire/parser.ts`

---

**Adapter Owner:** Naomi (Backend Developer)  
**Platform:** PDF Calendar System  
**Council Contact:** East Hampshire District Council Waste Services
