# Fareham Borough Council Adapter

**Council ID:** `fareham`  
**Platform:** Bartec Collective (SOAP/XML API)  
**Status:** ✅ Production Ready (Phase 3)  
**Last Updated:** 2026-03-25

---

## Acquisition Path

### Method: Bartec Collective SOAP API

Fareham uses the **Bartec Municipal Technologies** platform for waste management. This is a widely-used platform across UK councils, making this adapter pattern reusable.

**Endpoint:** `https://farehamgw.bartecmunicipal.com/API/CollectiveAPI.asmx` (configurable via `FAREHAM_API_ENDPOINT` env var)

**API Method:** `Features_Get`  
**Protocol:** SOAP 1.1/1.2 (XML over HTTP)  
**Authentication:** Optional (Basic Auth via `FAREHAM_API_USERNAME` and `FAREHAM_API_PASSWORD`)

### Request Flow

1. **Input:** UPRN (Unique Property Reference Number)
2. **SOAP Request:** POST to Bartec endpoint with `Features_Get` method
3. **XML Response:** Bartec returns collection schedule in XML format
4. **Parse:** Extract service codes, dates, container information
5. **Normalize:** Map Bartec service codes to canonical types

---

## Service Code Mapping

Bartec uses proprietary service codes that vary slightly by council. Common mappings:

| Bartec Code | Canonical Type | Notes |
|-------------|----------------|-------|
| `RES`, `REFUSE` | `general_waste` | Black bin |
| `REC`, `RECYCLE` | `recycling` | Blue bin |
| `GW`, `GARDEN` | `garden_waste` | Brown/green bin (subscription) |
| `FOOD` | `food_waste` | Food caddy |
| `GLASS` | `glass` | Glass collection |

Unknown service codes are logged and mapped to `other` with a warning.

---

## Example SOAP Request

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Features_Get xmlns="http://bartec-systems.com">
      <UPRN>100062483936</UPRN>
    </Features_Get>
  </soap:Body>
</soap:Envelope>
```

## Example XML Response

```xml
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Features_GetResponse>
      <Features_GetResult>
        <UPRN>100062483936</UPRN>
        <Address>1 Example Road, Fareham</Address>
        <Postcode>PO16 7XX</Postcode>
        <Services>
          <Service>
            <ServiceCode>RES</ServiceCode>
            <ServiceName>Refuse Collection</ServiceName>
            <NextCollection>2026-04-01</NextCollection>
            <Frequency>Fortnightly</Frequency>
            <Container>240L Wheeled Bin</Container>
            <Color>Black</Color>
          </Service>
          <Service>
            <ServiceCode>REC</ServiceCode>
            <ServiceName>Recycling Collection</ServiceName>
            <NextCollection>2026-04-08</NextCollection>
            <Frequency>Fortnightly</Frequency>
            <Container>240L Wheeled Bin</Container>
            <Color>Blue</Color>
          </Service>
        </Services>
      </Features_GetResult>
    </Features_GetResponse>
  </soap:Body>
</soap:Envelope>
```

---

## Security Considerations

### XML Parsing
- **Library:** `fast-xml-parser` (safe, no code execution)
- **Validation:** Input sanitization on all parsed values
- **Namespace handling:** Removes namespace prefixes for easier parsing
- **Fault handling:** SOAP faults extracted and categorized as errors

### Network Isolation
- **Egress allowlist:** `farehamgw.bartecmunicipal.com`, `fareham.gov.uk` only
- **Cloud metadata blocked:** `169.254.169.254` prohibited
- **Timeout enforcement:** 30s total request timeout

### Credentials
- **Storage:** Azure Key Vault (accessed via managed identity)
- **Environment variables:** `FAREHAM_API_USERNAME`, `FAREHAM_API_PASSWORD` (optional)
- **Transmission:** Basic Auth over HTTPS only
- **Rotation:** 90-day credential rotation policy

---

## Caching Strategy

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Collection schedules | 7 days | Collections are weekly/fortnightly |
| UPRN mappings | 90 days | Property references are stable |
| API tokens | Session-based | Token validity period (if used) |

---

## Error Handling

### SOAP Faults
Bartec may return SOAP fault messages for invalid requests:

```xml
<soap:Fault>
  <faultcode>soap:Client</faultcode>
  <faultstring>UPRN not found</faultstring>
</soap:Fault>
```

Faults are categorized as:
- `NOT_FOUND` — UPRN not in Bartec system
- `SERVER_ERROR` — Bartec API error
- `AUTH_REQUIRED` — Authentication failed (if credentials required)

### Network Errors
- `TIMEOUT` — Request exceeded 30s
- `NETWORK_ERROR` — Connection refused or DNS failure

---

## Rate Limiting

**Limit:** 30 requests/minute (conservative)  
**Backoff:** Exponential (10s → 20s → 40s on consecutive failures)  
**Circuit breaker:** 5 consecutive failures → 1 hour pause

---

## Reusability

This adapter extends **`BartecBaseAdapter`**, a reusable base class for all councils using Bartec Collective.

**Reusable components:**
- SOAP envelope construction
- XML response parsing
- Service code mapping
- SOAP fault handling
- Date parsing (Bartec date formats)

**Other Bartec councils:** This pattern can be applied to any UK council using Bartec Municipal Technologies platform.

---

## Configuration

### Required Environment Variables
- `FAREHAM_API_ENDPOINT` (optional, default: `https://farehamgw.bartecmunicipal.com/API/CollectiveAPI.asmx`)

### Optional (if authentication required)
- `FAREHAM_API_USERNAME`
- `FAREHAM_API_PASSWORD`

### Kill Switch
- `ADAPTER_KILL_SWITCH_FAREHAM=true` — Disable adapter without deployment

---

## Monitoring

### Health Check
- **Endpoint:** `GET /adapters/fareham/health`
- **Test UPRN:** `100062483936` (plausible Fareham UPRN)
- **Success criteria:** SOAP response received without fault

### Metrics
- Success rate (target: >95%)
- Response time (P50, P95, P99)
- SOAP fault frequency
- Authentication failure rate (if credentials used)

---

## Known Limitations

1. **UPRN Dependency:** Requires UPRN input — postcode lookup must be handled externally
2. **Endpoint Configuration:** Bartec endpoint may vary or require council partnership
3. **Authentication:** May require credentials depending on Bartec configuration
4. **Response Variance:** Bartec XML schema may differ slightly between council implementations

---

## Troubleshooting

### "SOAP Fault: UPRN not found"
- UPRN may not be in Bartec system
- Verify UPRN is valid for Fareham area
- Check UPRN resolution service

### "Network error: Connection refused"
- Bartec endpoint may be incorrect
- Check `FAREHAM_API_ENDPOINT` configuration
- Verify network egress allowlist includes Bartec domain

### "Authentication required"
- Bartec endpoint requires credentials
- Set `FAREHAM_API_USERNAME` and `FAREHAM_API_PASSWORD`
- Contact Fareham council for API access

---

## References

- **Bartec Municipal Technologies:** https://www.bartec.co.uk
- **Discovery Notes:** `docs/discovery/fareham-notes.md`
- **Base Adapter:** `src/adapters/base/bartec-adapter.ts`

---

**Adapter Owner:** Naomi (Backend Developer)  
**Platform Owner:** Bartec Municipal Technologies  
**Council Contact:** Fareham Borough Council Waste Services
