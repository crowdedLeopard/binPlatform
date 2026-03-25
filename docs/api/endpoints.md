# Hampshire Bin Platform — API Endpoint Reference

**OpenAPI version:** 3.1.0  
**Base URL:** `https://api.hampshire-bins.example.com`  
**Staging:** `https://staging-api.hampshire-bins.example.com`  
**Local:** `http://localhost:3000`

> See also: [Error Codes](./error-codes.md) · [Confidence Scores](./confidence-scores.md) · [README](./README.md)

---

## Authentication

| Endpoint type | Method | Header |
|---|---|---|
| Public | API key | `X-API-Key: hb_live_<32 chars>` |
| Admin | JWT bearer | `Authorization: Bearer <jwt>` |

Admin JWTs must carry the `admin` scope and are obtained via the OAuth 2.0 flow documented separately. Contact the platform team to obtain API keys.

---

## Rate Limiting

All responses include the following headers:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Requests allowed per minute (default: 60) |
| `X-RateLimit-Remaining` | Remaining requests in the current window |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

When a rate limit is exceeded the response is **429** with a `Retry-After` header (seconds until reset).

---

## Response Envelope

All successful responses wrap the payload in a `data` key (or `stats`/`alerts`/`adapters` for admin endpoints):

```json
{
  "data": { ... }
}
```

All error responses use a consistent structure — see [Error Codes](./error-codes.md).

---

## Councils

### `GET /v1/councils`

List all supported Hampshire councils with adapter status.

**Authentication:** `X-API-Key`

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `string` | No | Filter by adapter status. One of: `active`, `beta`, `development`, `disabled`, `unsupported` |

#### Example Request

```http
GET /v1/councils HTTP/1.1
Host: api.hampshire-bins.example.com
X-API-Key: hb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Example Response — 200 OK

```json
{
  "data": [
    {
      "councilId": "eastleigh",
      "councilName": "Eastleigh Borough Council",
      "adapterStatus": "implemented",
      "lookupMethod": "hidden_json",
      "upstreamRiskLevel": "low"
    },
    {
      "councilId": "winchester",
      "councilName": "Winchester City Council",
      "adapterStatus": "implemented",
      "lookupMethod": "html_form",
      "upstreamRiskLevel": "medium"
    },
    {
      "councilId": "gosport",
      "councilName": "Gosport Borough Council",
      "adapterStatus": "postponed",
      "lookupMethod": "unknown",
      "upstreamRiskLevel": "high"
    }
  ]
}
```

#### Response Fields — `Council` object

| Field | Type | Always present | Description |
|---|---|---|---|
| `councilId` | `string` | ✓ | Kebab-case council identifier. One of the 13 Hampshire council IDs listed below |
| `councilName` | `string` | ✓ | Official council name |
| `adapterStatus` | `string` | ✓ | Implementation status: `implemented`, `postponed`, `stub`, `disabled` |
| `lookupMethod` | `string` | ✓ | How the adapter acquires data: `api`, `hidden_json`, `html_form`, `pdf_calendar`, `browser_automation`, `browser_json`, `unknown`, `unsupported` |
| `upstreamRiskLevel` | `string` | ✓ | Brittleness of upstream source: `low`, `medium`, `high`, `critical` |
| `killSwitchActive` | `boolean` | Admin only | Whether the kill switch is currently active |
| `lastHealthCheck` | `string` (ISO 8601) | Admin only | Timestamp of last health check |
| `currentConfidence` | `number` (0.0–1.0) | Admin only | Current confidence score |

**Council IDs:** `basingstoke-deane`, `east-hampshire`, `eastleigh`, `fareham`, `gosport`, `hart`, `havant`, `new-forest`, `portsmouth`, `rushmoor`, `southampton`, `test-valley`, `winchester`

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### `GET /v1/councils/:councilId`

Get detailed information about a specific council.

**Authentication:** `X-API-Key`

#### Path Parameters

| Parameter | Type | Required | Pattern | Example |
|---|---|---|---|---|
| `councilId` | `string` | ✓ | `^[a-z][a-z0-9-]*[a-z0-9]$` | `basingstoke-deane` |

#### Example Request

```http
GET /v1/councils/winchester HTTP/1.1
Host: api.hampshire-bins.example.com
X-API-Key: hb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Example Response — 200 OK

```json
{
  "data": {
    "councilId": "winchester",
    "councilName": "Winchester City Council",
    "adapterStatus": "implemented",
    "lookupMethod": "html_form",
    "upstreamRiskLevel": "medium",
    "website": "https://www.winchester.gov.uk",
    "binInfoUrl": "https://www.winchester.gov.uk/bins-recycling/bin-collection-day",
    "supportedServiceTypes": [
      "general_waste",
      "recycling",
      "garden_waste",
      "food_waste"
    ],
    "capabilities": {
      "supports_address_lookup": true,
      "supports_collection_services": true,
      "supports_collection_events": true,
      "provides_uprn": false,
      "max_event_range_days": 90
    },
    "limitations": [
      "Does not provide UPRN",
      "Date range limited to 90 days"
    ],
    "is_production_ready": true,
    "last_updated": "2026-03-01",
    "health": {
      "status": "healthy",
      "last_success": "2026-03-25T12:00:00Z",
      "success_rate_24h": 0.98,
      "avg_response_time_ms": 850
    }
  }
}
```

#### Response Fields — `CouncilDetail` object

Extends the `Council` object (see above) with:

| Field | Type | Description |
|---|---|---|
| `website` | `string` (URI) | Council website URL |
| `binInfoUrl` | `string` (URI) | Direct URL to the bin collection lookup page |
| `supportedServiceTypes` | `string[]` | Service types this council reports (e.g. `general_waste`, `recycling`) |
| `capabilities.supports_address_lookup` | `boolean` | Whether address lookup is available |
| `capabilities.supports_collection_services` | `boolean` | Whether service metadata is available |
| `capabilities.supports_collection_events` | `boolean` | Whether individual collection events are available |
| `capabilities.provides_uprn` | `boolean` | Whether the council returns UPRNs for properties |
| `capabilities.max_event_range_days` | `integer` | Maximum number of days ahead events are available |
| `limitations` | `string[]` | Known limitations of this adapter |
| `is_production_ready` | `boolean` | Whether the adapter is production-grade |
| `last_updated` | `string` (ISO date) | Date adapter metadata was last reviewed |
| `health.status` | `string` | Current health: `healthy`, `degraded`, `unavailable` |
| `health.last_success` | `string` (ISO 8601) | Timestamp of last successful acquisition |
| `health.success_rate_24h` | `number` (0.0–1.0) | Proportion of successful requests in the last 24 hours |
| `health.avg_response_time_ms` | `number` | Average response time in milliseconds |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | No council with that `councilId` exists |
| 500 | `INTERNAL_ERROR` | Unexpected server error |

---

### `GET /v1/councils/:councilId/health`

Get the current adapter health status for a specific council.

**Authentication:** `X-API-Key`

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `councilId` | `string` | ✓ | Council identifier |

#### Example Request

```http
GET /v1/councils/eastleigh/health HTTP/1.1
Host: api.hampshire-bins.example.com
X-API-Key: hb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Example Response — 200 OK

```json
{
  "data": {
    "councilId": "eastleigh",
    "status": "healthy",
    "lastSuccessAt": "2026-03-25T11:45:00Z",
    "lastFailureAt": "2026-03-20T08:12:00Z",
    "successRate24h": 1.0,
    "avgResponseTimeMs": 420,
    "checkedAt": "2026-03-25T12:00:00Z"
  }
}
```

#### Response Fields — `AdapterHealth` object

| Field | Type | Always present | Description |
|---|---|---|---|
| `councilId` | `string` | ✓ | Council identifier |
| `status` | `string` | ✓ | `healthy`, `degraded`, `unhealthy`, or `unknown` |
| `lastSuccessAt` | `string` (ISO 8601) | No | Timestamp of last successful data acquisition |
| `lastFailureAt` | `string` (ISO 8601) | No | Timestamp of last failed acquisition |
| `successRate24h` | `number` (0.0–1.0) | No | Proportion of successful acquisitions in last 24 hours |
| `avgResponseTimeMs` | `number` | No | Average upstream response time in milliseconds |
| `checkedAt` | `string` (ISO 8601) | ✓ | When this health snapshot was taken |

**Status meanings:**

| Status | Description |
|---|---|
| `healthy` | Adapter is operating normally (success rate ≥ 90%) |
| `degraded` | Adapter is partially working but experiencing elevated errors |
| `unhealthy` | Adapter is failing consistently — data may be unavailable |
| `unknown` | No health checks have been performed yet |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `NOT_FOUND` | Council not found |

---

## Properties

### `GET /v1/postcodes/:postcode/addresses`

Look up residential addresses in Hampshire by postcode. The postcode is used to route the request to the correct council adapter.

**Authentication:** `X-API-Key`

#### Path Parameters

| Parameter | Type | Required | Pattern | Example |
|---|---|---|---|---|
| `postcode` | `string` | ✓ | `^[A-Za-z]{1,2}[0-9][0-9A-Za-z]?\s?[0-9][A-Za-z]{2}$` | `SO23 8QT` |

Spaces in the postcode are optional — `SO23 8QT` and `SO238QT` are both accepted.

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `addressFragment` | `string` | No | Free-text filter (e.g. street name or house number). Max 100 characters. Reduces results on the server side. |

#### Example Request

```http
GET /v1/postcodes/SO23%208QT/addresses?addressFragment=High+Street HTTP/1.1
Host: api.hampshire-bins.example.com
X-API-Key: hb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Example Response — 200 OK

```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "councilLocalId": "12345678",
      "uprn": "100062087432",
      "address": "Flat 2, 15 High Street, Winchester, SO23 8QT",
      "postcode": "SO23 8QT",
      "councilId": "winchester",
      "ambiguous_council": false
    },
    {
      "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
      "councilLocalId": "12345679",
      "uprn": null,
      "address": "17 High Street, Winchester, SO23 8QT",
      "postcode": "SO23 8QT",
      "councilId": "winchester",
      "ambiguous_council": false
    }
  ],
  "meta": {
    "councilId": "winchester",
    "lookupMethod": "html_form",
    "confidence": 0.87,
    "durationMs": 920,
    "fromCache": false,
    "warnings": []
  }
}
```

#### Response Fields — `data[]` (`AddressCandidate` objects)

| Field | Type | Always present | Description |
|---|---|---|---|
| `id` | `string` (UUID) | ✓ | **Property identifier** — pass this as `propertyId` to `/collections` and `/services` |
| `councilLocalId` | `string` | No | Council's own internal identifier for this property |
| `uprn` | `string` | No | Unique Property Reference Number — present only if the council provides it |
| `address` | `string` | ✓ | Full formatted address string |
| `postcode` | `string` | ✓ | Postcode (normalised, with space) |
| `councilId` | `string` | ✓ | Council that owns this property |
| `ambiguous_council` | `boolean` | ✓ | `true` if the postcode overlaps two council boundaries. Verify the address with the stated council before using. Defaults to `false`. |

#### Response Fields — `meta` (`AcquisitionMeta` object)

| Field | Type | Description |
|---|---|---|
| `councilId` | `string` | Council that handled this request |
| `lookupMethod` | `string` | Acquisition method used |
| `confidence` | `number` (0.0–1.0) | Confidence score for this result — see [Confidence Scores](./confidence-scores.md) |
| `durationMs` | `integer` | Time taken to acquire data in milliseconds |
| `fromCache` | `boolean` | Whether the result was served from cache |
| `warnings` | `string[]` | Non-fatal warnings encountered during acquisition (e.g. `"partial_data"`) |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 400 | `INVALID_POSTCODE` | Postcode does not match the UK postcode format |
| 400 | `BAD_REQUEST` | Other validation failure (e.g. `addressFragment` too long) |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `POSTCODE_NOT_HAMPSHIRE` | Postcode is valid UK format but outside Hampshire's service area |
| 404 | `NOT_FOUND` | No addresses found for this postcode |
| 429 | `RATE_LIMITED` | Too many requests |
| 502 | `ADAPTER_UNAVAILABLE` | Upstream council service returned an error |
| 503 | `SERVICE_UNAVAILABLE` | Adapter is temporarily unavailable or disabled |

---

## Collections

### `GET /v1/properties/:propertyId/collections`

Get upcoming bin collection events for a specific property. Results are sorted by `collectionDate` ascending.

**Authentication:** `X-API-Key`

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `propertyId` | `string` (UUID) | ✓ | Property identifier returned by the `/addresses` endpoint |

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `from` | `string` (ISO date) | No | Earliest collection date to include (inclusive). Example: `2026-03-25` |
| `to` | `string` (ISO date) | No | Latest collection date to include (inclusive). Example: `2026-04-25` |
| `serviceType` | `string` | No | Filter to a single service type. One of: `general_waste`, `recycling`, `garden_waste`, `food_waste`, `glass`, `paper`, `plastic`, `textiles`, `other` |

#### Example Request

```http
GET /v1/properties/a1b2c3d4-e5f6-7890-abcd-ef1234567890/collections?from=2026-03-25&to=2026-04-25 HTTP/1.1
Host: api.hampshire-bins.example.com
X-API-Key: hb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Example Response — 200 OK

```json
{
  "data": [
    {
      "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
      "serviceId": "d4e5f6a7-b8c9-0123-defa-234567890123",
      "serviceType": "recycling",
      "serviceName": "Recycling Collection",
      "collectionDate": "2026-03-27",
      "timeWindow": {
        "start": "07:00",
        "end": "15:00"
      },
      "isConfirmed": true,
      "isRescheduled": false,
      "rescheduleReason": null,
      "confidence": 0.91,
      "confidenceFactors": {
        "method": 0.95,
        "freshness": 1.0,
        "validation": 1.0,
        "health": 0.98
      },
      "notes": null
    },
    {
      "id": "e5f6a7b8-c9d0-1234-efab-345678901234",
      "serviceId": "f6a7b8c9-d0e1-2345-fabc-456789012345",
      "serviceType": "general_waste",
      "serviceName": "Household Waste",
      "collectionDate": "2026-04-03",
      "timeWindow": null,
      "isConfirmed": true,
      "isRescheduled": true,
      "rescheduleReason": "Good Friday bank holiday",
      "confidence": 0.88,
      "confidenceFactors": {
        "method": 0.95,
        "freshness": 0.95,
        "validation": 0.9,
        "health": 0.98
      },
      "notes": "Moved from 02 Apr due to bank holiday"
    }
  ],
  "meta": {
    "councilId": "winchester",
    "lookupMethod": "html_form",
    "confidence": 0.91,
    "durationMs": 1240,
    "fromCache": true,
    "warnings": [],
    "dataFreshnessHours": 1.5,
    "nextRefreshAt": "2026-03-25T16:00:00Z"
  }
}
```

#### Response Fields — `data[]` (`CollectionEvent` objects)

| Field | Type | Always present | Description |
|---|---|---|---|
| `id` | `string` (UUID) | ✓ | Unique event identifier |
| `serviceId` | `string` (UUID) | No | Identifier of the service this event belongs to |
| `serviceType` | `string` | ✓ | Normalised service type (see values above) |
| `serviceName` | `string` | No | Human-friendly display name (council-specific) |
| `collectionDate` | `string` (ISO date) | ✓ | Date the collection is scheduled |
| `timeWindow.start` | `string` (HH:MM) | No | Earliest time collector may arrive |
| `timeWindow.end` | `string` (HH:MM) | No | Latest time collector may arrive |
| `isConfirmed` | `boolean` | ✓ | Whether this date has been confirmed by the council |
| `isRescheduled` | `boolean` | No | Whether this collection was moved from its normal date |
| `rescheduleReason` | `string` | No | Reason for rescheduling (e.g. `"Good Friday bank holiday"`) |
| `confidence` | `number` (0.0–1.0) | No | Per-event confidence score — see [Confidence Scores](./confidence-scores.md) |
| `confidenceFactors.method` | `number` | No | Method component score |
| `confidenceFactors.freshness` | `number` | No | Freshness component score |
| `confidenceFactors.validation` | `number` | No | Validation component score |
| `confidenceFactors.health` | `number` | No | Adapter health component score |
| `notes` | `string` | No | Free-text notes from the council |

#### Response Fields — `meta` (`CollectionMeta` object)

Extends `AcquisitionMeta` (see `/addresses` above) with:

| Field | Type | Description |
|---|---|---|
| `dataFreshnessHours` | `number` | Hours since this data was fetched from the upstream council |
| `nextRefreshAt` | `string` (ISO 8601) | When the platform will next refresh this data |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 400 | `BAD_REQUEST` | Invalid `propertyId` format, invalid date format, or `to` before `from` |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `PROPERTY_NOT_FOUND` | Property ID is unknown or has expired |
| 429 | `RATE_LIMITED` | Too many requests |
| 502 | `ADAPTER_UNAVAILABLE` | Upstream council service returned an error |

---

### `GET /v1/properties/:propertyId/services`

Get the collection services available at a property (metadata about what bins/collections the property has, without specific dates).

**Authentication:** `X-API-Key`

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `propertyId` | `string` (UUID) | ✓ | Property identifier returned by the `/addresses` endpoint |

#### Example Request

```http
GET /v1/properties/a1b2c3d4-e5f6-7890-abcd-ef1234567890/services HTTP/1.1
Host: api.hampshire-bins.example.com
X-API-Key: hb_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Example Response — 200 OK

```json
{
  "data": [
    {
      "id": "d4e5f6a7-b8c9-0123-defa-234567890123",
      "serviceType": "recycling",
      "name": "Recycling Collection",
      "frequency": "fortnightly",
      "containerType": "240L wheeled bin",
      "containerColour": "blue",
      "isActive": true,
      "requiresSubscription": false
    },
    {
      "id": "f6a7b8c9-d0e1-2345-fabc-456789012345",
      "serviceType": "general_waste",
      "name": "Household Waste",
      "frequency": "fortnightly",
      "containerType": "240L wheeled bin",
      "containerColour": "black",
      "isActive": true,
      "requiresSubscription": false
    },
    {
      "id": "a7b8c9d0-e1f2-3456-abcd-567890123456",
      "serviceType": "garden_waste",
      "name": "Garden Waste",
      "frequency": "fortnightly",
      "containerType": "240L wheeled bin",
      "containerColour": "green",
      "isActive": true,
      "requiresSubscription": true
    }
  ],
  "meta": {
    "councilId": "winchester",
    "lookupMethod": "html_form",
    "confidence": 0.91,
    "durationMs": 780,
    "fromCache": true,
    "warnings": []
  }
}
```

#### Response Fields — `data[]` (`CollectionService` objects)

| Field | Type | Always present | Description |
|---|---|---|---|
| `id` | `string` (UUID) | ✓ | Service identifier |
| `serviceType` | `string` | ✓ | Normalised type: `general_waste`, `recycling`, `garden_waste`, `food_waste`, `glass`, `paper`, `plastic`, `textiles`, `other` |
| `name` | `string` | ✓ | Display name as reported by the council |
| `frequency` | `string` | No | Collection frequency (e.g. `weekly`, `fortnightly`) |
| `containerType` | `string` | No | Container type (e.g. `240L wheeled bin`, `recycling box`) |
| `containerColour` | `string` | No | Container colour |
| `isActive` | `boolean` | ✓ | Whether this service is currently active for the property |
| `requiresSubscription` | `boolean` | No | Whether the resident must opt in or pay for this service (common for garden waste) |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 404 | `PROPERTY_NOT_FOUND` | Property ID is unknown or has expired |
| 429 | `RATE_LIMITED` | Too many requests |
| 502 | `ADAPTER_UNAVAILABLE` | Upstream council returned an error |

---

## Admin

> All admin endpoints require a JWT bearer token with the `admin` scope. They are intended for internal use and should be accessed only via VPN or bastion host.

---

### `GET /v1/admin/dashboard`

Summary statistics for the admin dashboard.

**Authentication:** `Authorization: Bearer <jwt>` (admin scope)

#### Example Request

```http
GET /v1/admin/dashboard HTTP/1.1
Host: api.hampshire-bins.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response — 200 OK

```json
{
  "stats": {
    "total_councils": 13,
    "active_adapters": 11,
    "degraded_adapters": 1,
    "disabled_adapters": 1,
    "acquisitions_today": 4823,
    "success_rate": 0.987,
    "avg_confidence": 0.89,
    "pending_drift_alerts": 2,
    "open_security_events": 0
  },
  "metadata": {
    "request_id": "req_abc123",
    "timestamp": "2026-03-25T12:00:00Z"
  }
}
```

#### Response Fields — `stats`

| Field | Type | Description |
|---|---|---|
| `total_councils` | `integer` | Total number of registered councils |
| `active_adapters` | `integer` | Adapters currently marked healthy |
| `degraded_adapters` | `integer` | Adapters experiencing elevated error rates |
| `disabled_adapters` | `integer` | Adapters with kill switch active |
| `acquisitions_today` | `integer` | Number of data acquisition attempts since midnight UTC |
| `success_rate` | `number` (0.0–1.0) | Overall acquisition success rate for the past 24 hours |
| `avg_confidence` | `number` (0.0–1.0) | Mean confidence score across all successful acquisitions today |
| `pending_drift_alerts` | `integer` | Number of unacknowledged schema drift alerts |
| `open_security_events` | `integer` | Number of unresolved security events |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Token lacks `admin` scope |

---

### `GET /v1/admin/adapters`

List all registered adapters with sensitive operational details (health, security profile, kill switch state).

**Authentication:** `Authorization: Bearer <jwt>` (admin scope)

#### Example Request

```http
GET /v1/admin/adapters HTTP/1.1
Host: api.hampshire-bins.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response — 200 OK

```json
{
  "adapters": [
    {
      "council_id": "eastleigh",
      "name": "Eastleigh Borough Council",
      "status": "healthy",
      "kill_switch_active": false,
      "health": {
        "last_success": "2026-03-25T11:50:00Z",
        "last_failure": null,
        "last_failure_category": null,
        "last_failure_message": null,
        "success_rate_24h": 1.0,
        "avg_response_time_ms": 412,
        "acquisition_count_24h": 387,
        "upstream_reachable": true,
        "schema_drift_detected": false
      },
      "security": {
        "risk_level": "low",
        "requires_browser_automation": false,
        "external_domains": ["eastleigh.gov.uk"],
        "last_security_review": "2026-02-15"
      },
      "capabilities": {
        "lookup_method": "hidden_json",
        "rate_limit_rpm": 30,
        "is_production_ready": true,
        "adapter_last_updated": "2026-03-01"
      }
    }
  ],
  "total": 13,
  "metadata": {
    "request_id": "req_def456",
    "timestamp": "2026-03-25T12:00:00Z"
  }
}
```

#### Response Fields — `adapters[]`

| Field | Type | Description |
|---|---|---|
| `council_id` | `string` | Council identifier |
| `name` | `string` | Official council name |
| `status` | `string` | Adapter health status: `healthy`, `degraded`, `unhealthy`, `unknown` |
| `kill_switch_active` | `boolean` | Whether the kill switch is engaged |
| `health.last_success` | `string` (ISO 8601) | Timestamp of most recent successful acquisition |
| `health.last_failure` | `string` (ISO 8601) | Timestamp of most recent failure |
| `health.last_failure_category` | `string` | Category of last failure (e.g. `network_error`, `parse_error`) |
| `health.last_failure_message` | `string` | Sanitised failure message |
| `health.success_rate_24h` | `number` (0.0–1.0) | Success rate over past 24 hours |
| `health.avg_response_time_ms` | `number` | Average upstream response time |
| `health.acquisition_count_24h` | `integer` | Total acquisition attempts in past 24 hours |
| `health.upstream_reachable` | `boolean` | Whether the upstream URL was reachable at last check |
| `health.schema_drift_detected` | `boolean` | Whether a schema change has been detected |
| `security.risk_level` | `string` | Upstream risk: `low`, `medium`, `high`, `critical` |
| `security.requires_browser_automation` | `boolean` | Whether Playwright/Puppeteer is used |
| `security.external_domains` | `string[]` | External domains contacted during acquisition |
| `security.last_security_review` | `string` (ISO date) | Date of last security review |
| `capabilities.lookup_method` | `string` | Primary data acquisition method |
| `capabilities.rate_limit_rpm` | `integer` | Adapter-level rate limit in requests per minute |
| `capabilities.is_production_ready` | `boolean` | Production readiness flag |
| `capabilities.adapter_last_updated` | `string` (ISO date) | Date adapter code was last updated |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Token lacks `admin` scope |

---

### `POST /v1/admin/adapters/:councilId/disable`

Activate the kill switch for a council adapter. All requests to that council will immediately return `503 ADAPTER_DISABLED` until re-enabled. The action is written to the audit log.

**Authentication:** `Authorization: Bearer <jwt>` (admin scope)

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `councilId` | `string` | ✓ | Council identifier |

#### Example Request

```http
POST /v1/admin/adapters/eastleigh/disable HTTP/1.1
Host: api.hampshire-bins.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response — 200 OK

```json
{
  "council_id": "eastleigh",
  "kill_switch_active": true,
  "disabled_at": "2026-03-25T12:05:00Z",
  "disabled_by": "key_admin_abc",
  "metadata": {
    "request_id": "req_ghi789"
  }
}
```

#### Response Fields

| Field | Type | Description |
|---|---|---|
| `council_id` | `string` | Affected council |
| `kill_switch_active` | `boolean` | Always `true` after a successful disable |
| `disabled_at` | `string` (ISO 8601) | When the kill switch was activated |
| `disabled_by` | `string` | Identifier of the admin actor (API key or user ID) |
| `metadata.request_id` | `string` | Correlation ID for audit purposes |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Token lacks `admin` scope |
| 404 | `NOT_FOUND` | No adapter registered for that `councilId` |
| 500 | `INTERNAL_ERROR` | Database write failed |

---

### `POST /v1/admin/adapters/:councilId/enable`

Clear the kill switch for a council adapter, restoring normal operation. The action is written to the audit log.

**Authentication:** `Authorization: Bearer <jwt>` (admin scope)

#### Path Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `councilId` | `string` | ✓ | Council identifier |

#### Example Request

```http
POST /v1/admin/adapters/eastleigh/enable HTTP/1.1
Host: api.hampshire-bins.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response — 200 OK

```json
{
  "council_id": "eastleigh",
  "kill_switch_active": false,
  "enabled_at": "2026-03-25T14:30:00Z",
  "enabled_by": "key_admin_abc",
  "metadata": {
    "request_id": "req_jkl012"
  }
}
```

#### Response Fields

| Field | Type | Description |
|---|---|---|
| `council_id` | `string` | Affected council |
| `kill_switch_active` | `boolean` | Always `false` after a successful enable |
| `enabled_at` | `string` (ISO 8601) | When the kill switch was cleared |
| `enabled_by` | `string` | Identifier of the admin actor |
| `metadata.request_id` | `string` | Correlation ID for audit purposes |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Token lacks `admin` scope |
| 404 | `NOT_FOUND` | No adapter registered for that `councilId` |
| 500 | `INTERNAL_ERROR` | Database write failed |

---

### `GET /v1/admin/drift-alerts`

List recent schema drift alerts across all councils. Drift is detected when the upstream council website or API changes its response structure in a way the adapter did not expect.

**Authentication:** `Authorization: Bearer <jwt>` (admin scope)

#### Example Request

```http
GET /v1/admin/drift-alerts HTTP/1.1
Host: api.hampshire-bins.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response — 200 OK

```json
{
  "alerts": [
    {
      "alert_id": "drift_abc123",
      "council_id": "fareham",
      "severity": "major",
      "drift_type": "field_removed",
      "affected_fields": ["collectionDate", "serviceType"],
      "detected_at": "2026-03-24T09:15:00Z",
      "acknowledged": false
    },
    {
      "alert_id": "drift_def456",
      "council_id": "hart",
      "severity": "minor",
      "drift_type": "value_format_changed",
      "affected_fields": ["postcode"],
      "detected_at": "2026-03-22T14:00:00Z",
      "acknowledged": true
    }
  ],
  "total": 2,
  "metadata": {
    "request_id": "req_mno345",
    "timestamp": "2026-03-25T12:00:00Z"
  }
}
```

#### Response Fields — `alerts[]`

| Field | Type | Description |
|---|---|---|
| `alert_id` | `string` | Unique alert identifier |
| `council_id` | `string` | Council where drift was detected |
| `severity` | `string` | Impact level: `minor` (no data loss), `major` (some data affected), `breaking` (adapter non-functional) |
| `drift_type` | `string` | Type of change detected (e.g. `field_removed`, `value_format_changed`, `endpoint_changed`) |
| `affected_fields` | `string[]` | Names of the response fields that changed |
| `detected_at` | `string` (ISO 8601) | When the drift was first detected |
| `acknowledged` | `boolean` | Whether an admin has reviewed and acknowledged this alert |

**Severity guide:**

| Severity | Meaning | Action required |
|---|---|---|
| `minor` | Cosmetic change, data still usable | Review within 48 hours |
| `major` | Some data fields missing or incorrect | Review and patch within 24 hours |
| `breaking` | Adapter is non-functional | Immediate response required |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Token lacks `admin` scope |

---

### `GET /v1/admin/retention/stats`

Evidence retention statistics — number of files stored, total storage used, and how many files have passed the retention window.

**Authentication:** `Authorization: Bearer <jwt>` (admin scope)

#### Example Request

```http
GET /v1/admin/retention/stats HTTP/1.1
Host: api.hampshire-bins.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### Example Response — 200 OK

```json
{
  "stats": {
    "total_files": 18420,
    "total_size_bytes": 2415919104,
    "expired_count": 342,
    "retention_window_days": 90
  },
  "metadata": {
    "request_id": "req_pqr678",
    "timestamp": "2026-03-25T12:00:00Z"
  }
}
```

#### Response Fields — `stats`

| Field | Type | Description |
|---|---|---|
| `total_files` | `integer` | Total number of evidence files stored (raw upstream responses, screenshots, etc.) |
| `total_size_bytes` | `integer` | Total storage used in bytes |
| `expired_count` | `integer` | Number of files that have exceeded the retention window and are eligible for deletion |
| `retention_window_days` | `integer` | Configured retention window in days (platform default: 90) |

#### Error Responses

| Status | Code | Cause |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 403 | `FORBIDDEN` | Token lacks `admin` scope |

---

## Common Patterns

### Typical integration flow

```
1. GET /v1/postcodes/{postcode}/addresses
   → Returns list of AddressCandidate objects, each with an `id`

2. Present addresses to user, let them pick one

3. GET /v1/properties/{id}/collections?from=today&to=today+30d
   → Returns upcoming bin collections sorted by date

4. Optionally GET /v1/properties/{id}/services
   → Returns service metadata (bin colours, frequencies, subscription status)
```

### Checking council availability before querying

```
GET /v1/councils/{councilId}/health
→ If status is "unhealthy", skip the property lookup and show a maintenance message
→ If status is "degraded", show a warning but continue
→ If status is "healthy", proceed normally
```

### Pagination note

Public endpoints do not use pagination — all results are returned in a single response. Admin endpoints that support pagination (security events, audit log) use cursor-based pagination via the `cursor` query parameter and `pagination.nextCursor` in the response.
