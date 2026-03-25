# Hampshire Bin Platform API Documentation

**Version:** 1.0  
**Base URL:** `https://api.hampshirebins.uk/v1`  
**Status:** Beta  
**Last Updated:** 2026-03-25

---

## Overview

The Hampshire Bin Platform API provides programmatic access to household bin collection schedules across 13 Hampshire councils. The API is RESTful, returns JSON responses, and uses standard HTTP status codes.

**Coverage:**
- 11 operational councils (84.6% of Hampshire population)
- 2 postponed councils (partnership outreach in progress)
- 580,000+ households covered

---

## Base URL

```
Production:  https://api.hampshirebins.uk/v1
Staging:     https://staging-api.hampshirebins.uk/v1
```

---

## Authentication

### Public Endpoints

The following endpoints are **publicly accessible** without authentication:

- `GET /v1/councils` — List all councils
- `GET /v1/councils/:councilId` — Council details
- `GET /v1/councils/:councilId/health` — Health status

### Protected Endpoints

All other endpoints require an API key. Obtain your API key from the developer portal or contact the API team.

**Authentication Methods:**

**Option 1: X-Api-Key Header (Recommended)**
```http
GET /v1/postcodes/SO50%201AA/addresses HTTP/1.1
Host: api.hampshirebins.uk
X-Api-Key: your-api-key-here
```

**Option 2: Authorization Bearer Header**
```http
GET /v1/postcodes/SO50%201AA/addresses HTTP/1.1
Host: api.hampshirebins.uk
Authorization: Bearer your-api-key-here
```

### API Key Tiers

| Tier | Rate Limit | Quota | Features |
|------|------------|-------|----------|
| **Public** | 10 req/min/IP | 500/day | Basic access, councils only |
| **Developer** | 60 req/min | 10,000/day | Address resolution, collections |
| **Production** | 300 req/min | 100,000/day | All features, SLA support |

**Note:** Beta launch includes Developer tier only. Production tier available Month 2.

---

## Rate Limits

### Rate Limit Headers

Every response includes rate limit information:

```http
HTTP/1.1 200 OK
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 57
X-RateLimit-Reset: 1679408400
```

**Header Descriptions:**
- `X-RateLimit-Limit` — Maximum requests per window
- `X-RateLimit-Remaining` — Requests remaining in current window
- `X-RateLimit-Reset` — Unix timestamp when limit resets

### Rate Limit by Endpoint

| Endpoint | Public (no key) | Developer | Production |
|----------|----------------|-----------|------------|
| `/councils` | 100/min/IP | 300/min | 1000/min |
| `/postcodes/:postcode/addresses` | 10/min/IP | 60/min | 300/min |
| `/properties/:propertyId/*` | 10/min/IP | 60/min | 300/min |
| `/admin/*` | N/A | N/A | Unlimited (admin only) |

### Rate Limit Exceeded

When rate limit is exceeded, the API returns:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60

{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Try again in 60 seconds.",
    "requestId": "req_abc123",
    "retryAfter": 60
  }
}
```

**Best Practices:**
- Respect `Retry-After` header
- Implement exponential backoff
- Cache responses when possible
- Use batch operations where available (future feature)

---

## Response Format

### Success Response

All successful responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "metadata": {
    "requestId": "req_abc123",
    "timestamp": "2026-03-25T10:30:00Z",
    "version": "v1"
  }
}
```

### Error Response

All error responses follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "requestId": "req_abc123",
    "details": {
      "field": "Additional context (optional)"
    }
  }
}
```

**Important:** Always include `requestId` when reporting issues.

---

## Error Codes

The API uses standardized error codes across all endpoints. See [Error Codes Documentation](./error-codes.md) for full details.

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_POSTCODE` | 400 | Postcode format invalid or not UK postcode |
| `POSTCODE_NOT_HAMPSHIRE` | 400 | Postcode is not in Hampshire |
| `PROPERTY_NOT_FOUND` | 404 | No property found at given address |
| `ADAPTER_UNAVAILABLE` | 503 | Council adapter temporarily unavailable |
| `ADAPTER_DISABLED` | 503 | Council adapter disabled via kill switch |
| `RATE_LIMITED` | 429 | Too many requests |
| `UNAUTHORIZED` | 401 | Invalid or missing API key |
| `FORBIDDEN` | 403 | Valid key but insufficient permissions |
| `INTERNAL_ERROR` | 500 | Internal server error (contact support) |
| `BAD_REQUEST` | 400 | Malformed request |
| `NOT_FOUND` | 404 | Endpoint does not exist |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

**Note:** Error codes are stable across API versions. Safe to use in client logic.

---

## Versioning

The API uses URL path versioning:

```
https://api.hampshirebins.uk/v1/councils
                           ^^
                           Version
```

**Current Version:** `v1`  
**Stability:** Beta (breaking changes possible with 30-day notice)

### Version Lifecycle

| Version | Status | Release Date | Deprecation Date | Sunset Date |
|---------|--------|--------------|------------------|-------------|
| **v1** | **Beta** | 2026-04-01 | TBD | TBD |
| v2 | Planned | TBD | N/A | N/A |

**Beta Notice:** During beta phase, we reserve the right to make breaking changes with 30 days notice. After v1 reaches stable status, breaking changes will require a new version (v2).

---

## Deprecation Policy

When an endpoint or field is deprecated:

1. **Announcement:** 90 days before deprecation
   - Email to all API key holders
   - Status page notification
   - Response header: `Sunset: Sat, 01 Jan 2027 00:00:00 GMT`

2. **Deprecation Warning Period:** 90 days
   - Endpoint remains functional
   - Response includes deprecation warning
   - Migration guide provided

3. **Sunset:** Endpoint removed
   - Returns `410 Gone` status
   - Clients must migrate to new version

**Migration Support:** Contact API team for assistance during deprecation period.

---

## Pagination

Currently, pagination is **not implemented** (beta phase). All list responses return complete datasets.

**Future Implementation:** Month 2 will introduce cursor-based pagination for large result sets.

**Planned Format:**
```json
{
  "data": [...],
  "pagination": {
    "cursor": "next_cursor_token",
    "hasMore": true,
    "total": 1337
  }
}
```

---

## Caching

### Client-Side Caching

The API includes standard HTTP cache headers:

```http
Cache-Control: public, max-age=300
ETag: "abc123"
Last-Modified: Tue, 25 Mar 2026 10:00:00 GMT
```

**Recommended Cache TTLs:**

| Endpoint | TTL | Reasoning |
|----------|-----|-----------|
| `/councils` | 5 minutes | Council metadata rarely changes |
| `/councils/:id/health` | 1 minute | Health status changes frequently |
| `/postcodes/:postcode/addresses` | 1 hour | Addresses stable |
| `/properties/:id/collections` | 4 hours | Collection dates change weekly |
| `/properties/:id/services` | 24 hours | Services change rarely |

**Conditional Requests:**

Use `If-None-Match` or `If-Modified-Since` to avoid unnecessary data transfer:

```http
GET /v1/councils HTTP/1.1
If-None-Match: "abc123"

HTTP/1.1 304 Not Modified
```

### Server-Side Caching

The API uses Redis for server-side caching:
- **Councils:** 5 min TTL
- **Property resolution:** 24 hour TTL
- **Collection events:** 4 hour TTL (varies by acquisition method)

**Cache Bypass:** Not available to clients (admin-only feature).

---

## CORS

The API supports Cross-Origin Resource Sharing (CORS) for browser-based applications.

**Allowed Origins (Beta):**
- `http://localhost:*` (development)
- `https://*.hampshirebins.uk` (production domains)

**Production:** Contact API team to allowlist your domain.

**CORS Headers:**
```http
Access-Control-Allow-Origin: https://app.hampshirebins.uk
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Api-Key, Authorization
Access-Control-Max-Age: 3600
```

---

## Idempotency

**GET requests:** Idempotent by nature (multiple requests return same result).

**POST requests:** Currently no POST endpoints for public API. Admin API POST endpoints (kill switches, etc.) are **not idempotent**.

**Future:** Idempotency keys will be supported for write operations in v2.

---

## Request IDs

Every request is assigned a unique `requestId` for tracing and debugging.

**Where to Find:**
- Response body: `metadata.requestId` or `error.requestId`
- Response header: `X-Request-ID`

**Example:**
```http
HTTP/1.1 200 OK
X-Request-ID: req_7f8a9b2c3d4e5f6g

{
  "metadata": {
    "requestId": "req_7f8a9b2c3d4e5f6g"
  }
}
```

**Use Case:** Include `requestId` when contacting support or reporting issues.

---

## Security

### HTTPS Only

All API requests **must** use HTTPS. HTTP requests are redirected to HTTPS with `301 Moved Permanently`.

### TLS Version

- **Minimum:** TLS 1.2
- **Recommended:** TLS 1.3
- **Cipher Suites:** Modern, secure ciphers only (no RC4, DES, 3DES)

### API Key Security

**Best Practices:**
- Never commit API keys to source control
- Use environment variables or secret management
- Rotate keys regularly (90-day rotation recommended)
- Use separate keys for development/staging/production
- Revoke compromised keys immediately

**Compromised Key:** Contact security@hampshirebins.uk immediately.

### Rate Limiting as Security

Rate limits protect against:
- Denial of service attacks
- Credential stuffing
- Data scraping
- Enumeration attacks

**Anomaly Detection:** Unusual patterns trigger security review and may result in key suspension.

---

## Support

### Documentation

- **API Reference:** [endpoints.md](./endpoints.md)
- **Error Codes:** [error-codes.md](./error-codes.md)
- **Confidence Scores:** [confidence-scores.md](./confidence-scores.md)
- **OpenAPI Spec:** `https://api.hampshirebins.uk/v1/openapi.yaml`

### Contact

- **Technical Support:** api-support@hampshirebins.uk
- **Security Issues:** security@hampshirebins.uk
- **Status Page:** https://status.hampshirebins.uk (planned Month 2)
- **GitHub Issues:** https://github.com/hampshire-bins/api/issues (planned Month 2)

### SLA (Production Tier Only)

- **Uptime:** 99% monthly uptime guarantee
- **Response Time:** p95 < 2s for cached, p99 < 5s for live
- **Support Response:** <24 hours for technical questions, <4 hours for critical issues
- **Incident Notification:** Email + status page within 15 minutes

**Beta SLA:** Best-effort support, no uptime guarantee.

---

## Quick Start

### 1. Get an API Key

Contact api-support@hampshirebins.uk or sign up at the developer portal (planned Month 2).

### 2. List Available Councils

```bash
curl https://api.hampshirebins.uk/v1/councils
```

Response:
```json
{
  "success": true,
  "data": {
    "councils": [
      {
        "councilId": "eastleigh",
        "councilName": "Eastleigh Borough Council",
        "adapterStatus": "implemented",
        "lookupMethod": "api",
        "upstreamRiskLevel": "medium"
      }
    ]
  }
}
```

### 3. Find Your Address

```bash
curl -H "X-Api-Key: your-key" \
  https://api.hampshirebins.uk/v1/postcodes/SO50%201AA/addresses
```

Response includes `propertyId` for next step.

### 4. Get Collection Dates

```bash
curl -H "X-Api-Key: your-key" \
  https://api.hampshirebins.uk/v1/properties/{propertyId}/collections
```

Response includes next collection dates with confidence scores.

---

## Example Applications

### JavaScript (Node.js)

```javascript
const axios = require('axios');

const client = axios.create({
  baseURL: 'https://api.hampshirebins.uk/v1',
  headers: { 'X-Api-Key': process.env.HAMPSHIRE_BINS_API_KEY }
});

async function getNextCollections(postcode) {
  // Step 1: Resolve address
  const { data: addresses } = await client.get(
    `/postcodes/${encodeURIComponent(postcode)}/addresses`
  );
  
  if (!addresses.data.autoResolved) {
    console.log('Multiple addresses found, user must select');
    return addresses.data.candidates;
  }
  
  const propertyId = addresses.data.propertyId;
  
  // Step 2: Get collections
  const { data: collections } = await client.get(
    `/properties/${propertyId}/collections`
  );
  
  return collections.data.events;
}

getNextCollections('SO50 1AA').then(console.log);
```

### Python

```python
import requests
import os

class HampshireBinsClient:
    def __init__(self, api_key):
        self.base_url = 'https://api.hampshirebins.uk/v1'
        self.session = requests.Session()
        self.session.headers.update({'X-Api-Key': api_key})
    
    def get_collections(self, postcode):
        # Step 1: Resolve address
        resp = self.session.get(f'{self.base_url}/postcodes/{postcode}/addresses')
        resp.raise_for_status()
        addresses = resp.json()
        
        if not addresses['data']['autoResolved']:
            return {'candidates': addresses['data']['candidates']}
        
        property_id = addresses['data']['propertyId']
        
        # Step 2: Get collections
        resp = self.session.get(f'{self.base_url}/properties/{property_id}/collections')
        resp.raise_for_status()
        return resp.json()['data']

client = HampshireBinsClient(os.getenv('HAMPSHIRE_BINS_API_KEY'))
collections = client.get_collections('SO50 1AA')
print(collections)
```

### cURL

```bash
#!/bin/bash
API_KEY="your-api-key"
POSTCODE="SO50 1AA"

# Step 1: Get property ID
PROPERTY=$(curl -s -H "X-Api-Key: $API_KEY" \
  "https://api.hampshirebins.uk/v1/postcodes/${POSTCODE// /%20}/addresses" \
  | jq -r '.data.propertyId')

# Step 2: Get collections
curl -s -H "X-Api-Key: $API_KEY" \
  "https://api.hampshirebins.uk/v1/properties/$PROPERTY/collections" \
  | jq '.data.events[] | {date, binType, confidence}'
```

---

## Changelog

### v1.0.0-beta (2026-04-01)

**Initial beta release**
- 11 councils operational
- Public and protected endpoints
- Confidence scoring
- Overlap postcode handling
- Rate limiting (Developer tier)

**Known Limitations:**
- No pagination (all results returned)
- No batch operations
- Admin endpoints internal-only
- No webhooks

---

## Roadmap

### Month 2 (May 2026)

- Pagination for large result sets
- Production tier with SLA
- Status page
- Developer portal for self-service API keys
- Grafana public dashboards
- Webhook notifications for collection reminders

### Month 3 (June 2026)

- Batch operations (multiple postcodes in one request)
- iCal feed generation
- Historical collection data (past 90 days)
- User-reported corrections
- Partnership recovery for New Forest, Southampton

### v2 Planning (Q3 2026)

- GraphQL endpoint (in addition to REST)
- Postcode autocomplete
- Mobile app SDK (iOS, Android)
- Multi-council accounts (for letting agents, councils)
- Analytics API (aggregate usage stats)

---

**Questions?** Contact api-support@hampshirebins.uk

**Found a bug?** Email security@hampshirebins.uk (security issues) or api-support@hampshirebins.uk (other issues)

**Want to contribute?** We're open to community contributions for council adapters. Contact the team for contribution guidelines.
