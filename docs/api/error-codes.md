# Hampshire Bin Platform — Error Codes Reference

> See also: [Endpoints](./endpoints.md) · [Confidence Scores](./confidence-scores.md)

All API errors use a consistent JSON envelope. The `code` field is machine-readable and stable across versions. The `message` field is human-readable but **must not** be parsed programmatically — use `code` for branching logic.

---

## Error Response Format

```json
{
  "error": {
    "code": "INVALID_POSTCODE",
    "message": "The provided postcode is not in valid UK format",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "details": {
      "example": "SO23 8QT"
    }
  }
}
```

| Field | Type | Description |
|---|---|---|
| `error.code` | `string` | Machine-readable error code — use this for error handling logic |
| `error.message` | `string` | Human-readable description — suitable to display to end users |
| `error.requestId` | `string` (UUID) | Unique request identifier — include this when contacting support |
| `error.details` | `object` | Optional structured context (field names, expected values, etc.) |

---

## Error Codes

### `INVALID_POSTCODE`

| | |
|---|---|
| **HTTP status** | `400 Bad Request` |
| **Category** | Input validation |

**Description:** The postcode provided does not match the UK postcode format. The platform validates postcodes against the pattern `^[A-Za-z]{1,2}[0-9][0-9A-Za-z]?\s?[0-9][A-Za-z]{2}$` before routing to a council adapter.

**Typical causes:**
- Postcode contains extra characters or punctuation
- Postcode is truncated (outward code only, e.g. `SO23` without the inward part)
- Non-UK postcode format (e.g. US ZIP code or Irish Eircode)
- Empty string passed in the path segment

**How to fix:**
1. Validate the postcode on the client side before sending the request
2. Strip leading/trailing whitespace
3. Both `SO238QT` and `SO23 8QT` are accepted — a single internal space is optional

**Example response:**
```json
{
  "error": {
    "code": "INVALID_POSTCODE",
    "message": "The provided postcode is not in valid UK format",
    "requestId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "details": {
      "example": "SO23 8QT"
    }
  }
}
```

---

### `POSTCODE_NOT_HAMPSHIRE`

| | |
|---|---|
| **HTTP status** | `404 Not Found` |
| **Category** | Service area |

**Description:** The postcode is a valid UK postcode but falls outside Hampshire's service area. The platform only covers the 13 Hampshire councils.

**Typical causes:**
- Postcode is in an adjacent county (Dorset, Wiltshire, West Sussex, Surrey)
- Postcode is in the Isle of Wight (separate council, not covered)
- User entered a postcode for a different part of the country

**How to fix:**
- Check whether the postcode begins with a Hampshire outward code: `SO`, `PO`, `GU`, `RG`, `SP`. Note that `GU` and `RG` also cover parts of Surrey, so this is a rough guide only.
- Display a clear message to users that the service is Hampshire-only
- Consider linking users to their local council's own website

**Example response:**
```json
{
  "error": {
    "code": "POSTCODE_NOT_HAMPSHIRE",
    "message": "This service only covers Hampshire councils. The provided postcode is outside our service area.",
    "requestId": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "details": {
      "postcodePrefix": "BH"
    }
  }
}
```

---

### `PROPERTY_NOT_FOUND`

| | |
|---|---|
| **HTTP status** | `404 Not Found` |
| **Category** | Resource not found |

**Description:** No property exists for the given `propertyId`, or the property record has expired.

**Typical causes:**
- The `propertyId` UUID was not returned by `/postcodes/:postcode/addresses` — it may have been invented or copied from a different environment
- The property was resolved in a previous session but the platform has re-indexed or re-keyed its property store
- Typo in the UUID

**How to fix:**
- Always obtain `propertyId` from a fresh call to `GET /v1/postcodes/:postcode/addresses` — do not hardcode or cache property IDs long-term
- If a stored ID stops working, re-query the postcode endpoint to get a new ID

**Example response:**
```json
{
  "error": {
    "code": "PROPERTY_NOT_FOUND",
    "message": "No property found matching the provided criteria",
    "requestId": "c3d4e5f6-a7b8-9012-cdef-123456789012"
  }
}
```

---

### `ADAPTER_UNAVAILABLE`

| | |
|---|---|
| **HTTP status** | `502 Bad Gateway` |
| **Category** | Upstream error |

**Description:** The council's upstream data source returned an error or was unreachable. The platform successfully forwarded the request to the adapter, but the adapter could not retrieve data from the council's website or API.

**Typical causes:**
- Council website is down for maintenance
- Network timeout reaching the council's server
- The council's anti-bot protection blocked the request
- Unexpected HTTP 5xx from the council's own infrastructure

**How to fix:**
- Retry with exponential backoff — transient upstream issues often resolve within minutes
- Check `GET /v1/councils/:councilId/health` to see the adapter's current success rate
- If the problem persists for several hours, the council's upstream may be having a longer outage — check the council's own website directly
- Subscribe to platform status alerts for proactive notification of known outages

**Example response:**
```json
{
  "error": {
    "code": "ADAPTER_UNAVAILABLE",
    "message": "Council service is temporarily unavailable. Please try again later.",
    "requestId": "d4e5f6a7-b8c9-0123-defa-234567890123",
    "details": {
      "councilId": "fareham"
    }
  }
}
```

---

### `ADAPTER_DISABLED`

| | |
|---|---|
| **HTTP status** | `503 Service Unavailable` |
| **Category** | Kill switch |

**Description:** An administrator has manually disabled this council's adapter via the kill switch. The adapter will not process requests until it is re-enabled.

**Typical causes:**
- Planned maintenance on the platform
- The council's upstream has changed its schema and the adapter needs updating
- A security concern triggered a precautionary shutdown
- The adapter was producing incorrect data that required investigation

**How to fix:**
- This is not a transient error — retrying will not help while the kill switch is active
- Display a maintenance message to users: *"Collection data for [Council] is currently unavailable due to maintenance. Please check back later."*
- Monitor `GET /v1/councils/:councilId/health` or subscribe to platform alerts for restoration notification
- Platform administrators can restore the adapter via `POST /v1/admin/adapters/:councilId/enable`

**Example response:**
```json
{
  "error": {
    "code": "ADAPTER_DISABLED",
    "message": "Council service is currently disabled for maintenance",
    "requestId": "e5f6a7b8-c9d0-1234-efab-345678901234",
    "details": {
      "councilId": "eastleigh"
    }
  }
}
```

---

### `RATE_LIMITED`

| | |
|---|---|
| **HTTP status** | `429 Too Many Requests` |
| **Category** | Rate limiting |

**Description:** The API key has exceeded the request quota for the current rate limit window (default: 60 requests per minute).

**Response headers included:**

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Total requests allowed per minute |
| `X-RateLimit-Remaining` | Requests remaining in the current window (`0` when this error fires) |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |
| `Retry-After` | Seconds until the rate limit resets |

**Typical causes:**
- Automated scripts or batch jobs querying too quickly
- Fan-out from a single key serving many users
- Missing caching on the client side — re-querying the same property/postcode repeatedly

**How to fix:**
1. Read the `Retry-After` header and delay the next request by that many seconds
2. Cache postcode lookup results — address lists change infrequently (days to weeks)
3. Cache collection results — the platform's own cache means re-querying the same property within a few hours returns the same data
4. If your use case requires higher throughput, contact the platform team to discuss a rate limit increase

**Example response:**
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Please slow down your requests.",
    "requestId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
    "details": {
      "retryAfter": 23
    }
  }
}
```

---

### `UNAUTHORIZED`

| | |
|---|---|
| **HTTP status** | `401 Unauthorized` |
| **Category** | Authentication |

**Description:** The request did not include valid authentication credentials. For public endpoints, the `X-API-Key` header is missing or the key is unrecognised. For admin endpoints, the `Authorization: Bearer` header is missing or the JWT is malformed/expired.

**Typical causes:**
- `X-API-Key` header not included in the request
- API key has been revoked or never existed
- JWT has expired (admin endpoints)
- JWT signature is invalid (admin endpoints)
- Using a staging key against production, or vice versa

**How to fix:**
- Ensure `X-API-Key` is present in every request to public endpoints
- Check the key format: `hb_live_` followed by 32 alphanumeric characters
- For admin endpoints, obtain a fresh JWT via the OAuth 2.0 flow and check expiry before use
- Do not embed API keys in client-side code — proxy through a backend

**Example response:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required. Please provide a valid API key.",
    "requestId": "a7b8c9d0-e1f2-3456-abcd-567890123456"
  }
}
```

---

### `FORBIDDEN`

| | |
|---|---|
| **HTTP status** | `403 Forbidden` |
| **Category** | Authorisation |

**Description:** The credentials are valid but do not grant access to the requested resource. This occurs on admin endpoints when the JWT does not carry the `admin` scope.

**Typical causes:**
- Using a public API key to access an admin endpoint
- Using a JWT with insufficient scopes (e.g. `read` scope only)
- Attempting to access an admin endpoint from an IP not on the VPN allowlist

**How to fix:**
- Admin endpoints require a JWT with the `admin` scope — these are issued separately to public API keys
- Contact the platform team if you believe you should have admin access

**Example response:**
```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource",
    "requestId": "b8c9d0e1-f2a3-4567-bcde-678901234567"
  }
}
```

---

### `INTERNAL_ERROR`

| | |
|---|---|
| **HTTP status** | `500 Internal Server Error` |
| **Category** | Server error |

**Description:** An unexpected error occurred inside the platform. The request was valid but something went wrong during processing that was not an upstream adapter issue.

**Typical causes:**
- Database connection failure
- Unhandled exception in business logic
- Configuration error on the server
- Out-of-memory or resource exhaustion

**How to fix:**
- This is not caused by the client — no change to the request will fix it
- Retry once after a short delay (30–60 seconds) — transient infrastructure issues often self-resolve
- If the error persists, contact support with the `requestId` from the response — this ID allows the platform team to locate the relevant logs
- Monitor the platform status page for any ongoing incidents

**Example response:**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal server error occurred. Please contact support with the request ID.",
    "requestId": "c9d0e1f2-a3b4-5678-cdef-789012345678"
  }
}
```

---

### `BAD_REQUEST`

| | |
|---|---|
| **HTTP status** | `400 Bad Request` |
| **Category** | Input validation |

**Description:** The request parameters failed validation for a reason other than postcode format. This includes invalid date formats, `to` earlier than `from`, unknown enum values, values exceeding maximum length, and malformed UUIDs.

**Typical causes:**
- `from` or `to` date not in `YYYY-MM-DD` format
- `to` date is before `from` date
- `serviceType` value not in the allowed enum
- `addressFragment` longer than 100 characters
- `propertyId` is not a valid UUID

**How to fix:**
- Check the `details` object in the error response — it will identify which field failed validation and why
- Ensure date strings are ISO 8601 format (`YYYY-MM-DD`)
- Validate UUIDs on the client with a regex or UUID library before sending

**Example response:**
```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid request parameters",
    "requestId": "d0e1f2a3-b4c5-6789-defa-890123456789",
    "details": {
      "to": "Must be on or after 'from' date (2026-03-25)"
    }
  }
}
```

---

### `NOT_FOUND`

| | |
|---|---|
| **HTTP status** | `404 Not Found` |
| **Category** | Resource not found |

**Description:** A generic not-found error for resources that do not exist — typically used when a `councilId` path parameter does not match any known council.

**Typical causes:**
- `councilId` contains a typo (e.g. `east_hampshire` instead of `east-hampshire`)
- Requesting a council that is not yet supported
- Accessing an endpoint path that does not exist

**How to fix:**
- Fetch the council list from `GET /v1/councils` to get the authoritative list of valid council IDs
- Ensure `councilId` values are kebab-case (hyphens, not underscores)

**Example response:**
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "The requested resource was not found",
    "requestId": "e1f2a3b4-c5d6-7890-efab-901234567890"
  }
}
```

---

### `SERVICE_UNAVAILABLE`

| | |
|---|---|
| **HTTP status** | `503 Service Unavailable` |
| **Category** | Service availability |

**Description:** The platform itself (not a specific council adapter) is temporarily unavailable. This may be returned during planned maintenance windows or when the platform is under severe resource pressure.

**Typical causes:**
- Platform-wide maintenance in progress
- Database is unreachable
- Deployment rollout in progress
- Cascading failures affecting core services

**How to fix:**
- Check the `Retry-After` header if present
- Monitor the platform status page
- Implement a circuit breaker in your integration to avoid hammering the API during an outage
- Cache the last known good response and serve it to users with an appropriate staleness indicator

**Example response:**
```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable",
    "requestId": "f2a3b4c5-d6e7-8901-fabc-012345678901"
  }
}
```

---

## Error Code Quick Reference

| Code | HTTP | Retryable | Client fix? |
|---|---|---|---|
| `INVALID_POSTCODE` | 400 | No | Fix the postcode format |
| `POSTCODE_NOT_HAMPSHIRE` | 404 | No | Postcode is outside service area |
| `PROPERTY_NOT_FOUND` | 404 | No | Re-query `/addresses` for a fresh ID |
| `ADAPTER_UNAVAILABLE` | 502 | Yes (backoff) | Wait and retry |
| `ADAPTER_DISABLED` | 503 | No | Wait for platform maintenance to end |
| `RATE_LIMITED` | 429 | Yes (after delay) | Honour `Retry-After`, add caching |
| `UNAUTHORIZED` | 401 | No | Fix authentication headers |
| `FORBIDDEN` | 403 | No | Use credentials with correct scope |
| `INTERNAL_ERROR` | 500 | Yes (once) | Retry once; contact support if persistent |
| `BAD_REQUEST` | 400 | No | Fix the invalid field (see `details`) |
| `NOT_FOUND` | 404 | No | Fix the resource identifier |
| `SERVICE_UNAVAILABLE` | 503 | Yes (backoff) | Wait for platform to recover |

---

## Handling Errors in Code

### JavaScript / TypeScript

```typescript
const response = await fetch(
  `https://api.hampshire-bins.example.com/v1/postcodes/${postcode}/addresses`,
  { headers: { 'X-API-Key': apiKey } }
);

if (!response.ok) {
  const body = await response.json();
  const code = body.error?.code;

  switch (code) {
    case 'INVALID_POSTCODE':
      // Show inline validation error to user
      showFieldError('postcode', 'Please enter a valid UK postcode');
      break;

    case 'POSTCODE_NOT_HAMPSHIRE':
      // Inform user the service area doesn't cover their postcode
      showMessage('Sorry, this service only covers Hampshire postcodes.');
      break;

    case 'RATE_LIMITED':
      // Back off and retry
      const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
      await sleep(retryAfter * 1000);
      return fetchAddresses(postcode); // retry

    case 'ADAPTER_UNAVAILABLE':
    case 'SERVICE_UNAVAILABLE':
      // Transient — retry with backoff
      await sleep(5000);
      return fetchAddresses(postcode);

    case 'ADAPTER_DISABLED':
      showMessage('Bin collection data for this area is temporarily unavailable.');
      break;

    default:
      // Log requestId for support
      console.error('API error', code, body.error?.requestId);
      showMessage('Something went wrong. Please try again.');
  }
}
```

### Python

```python
import httpx
import time

def fetch_addresses(postcode: str, api_key: str) -> dict:
    resp = httpx.get(
        f"https://api.hampshire-bins.example.com/v1/postcodes/{postcode}/addresses",
        headers={"X-API-Key": api_key}
    )

    if resp.is_success:
        return resp.json()

    error = resp.json().get("error", {})
    code = error.get("code")

    if code == "RATE_LIMITED":
        retry_after = int(resp.headers.get("Retry-After", 60))
        time.sleep(retry_after)
        return fetch_addresses(postcode, api_key)

    raise ApiError(code, error.get("message"), error.get("requestId"))
```
