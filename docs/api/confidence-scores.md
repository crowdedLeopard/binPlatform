# Hampshire Bin Platform — Confidence Scores

> See also: [Endpoints](./endpoints.md) · [Error Codes](./error-codes.md)

Confidence scores give you a data-quality signal alongside every bin collection result. Rather than returning data with no indication of reliability, the platform computes a score for every acquisition that reflects how much you should trust the dates returned.

---

## What Is a Confidence Score?

A confidence score is a floating-point number in the range **0.0–1.0** attached to every `CollectionEvent` and to the `meta` object in address and collection responses.

```
0.0 ──────────────────────────────────── 1.0
STALE    UNVERIFIED    LIKELY    CONFIRMED
```

- **1.0** = maximum confidence — fresh data from a well-tested, reliable source with all validations passing
- **0.0** = zero confidence — unsupported adapter or catastrophically degraded data

Scores are computed consistently across all 13 councils using the same engine, so a `0.85` from Winchester means the same as a `0.85` from Eastleigh.

---

## Named Thresholds

The platform defines four named levels that map score ranges to human-readable interpretations:

| Level | Score range | Meaning |
|---|---|---|
| **CONFIRMED** | ≥ 0.8 | High confidence — data was acquired from a reliable source, passed all validations, and is fresh |
| **LIKELY** | ≥ 0.6 and < 0.8 | Likely accurate — data acquired successfully but with minor concerns (e.g. slightly stale, moderate-risk upstream) |
| **UNVERIFIED** | ≥ 0.4 and < 0.6 | Uncertain — data present but reliability is questionable; consider re-querying or showing a caveat to users |
| **STALE** | < 0.4 | Stale or unreliable — data should not be displayed without a warning; re-acquisition is recommended |

These map directly to the `ConfidenceLevel` type in the codebase (`confirmed`, `likely`, `unverified`, `stale`).

> **Note on the STALE threshold:** A separate internal threshold at **0.2** is used to trigger automatic re-acquisition. Data at 0.2–0.4 is "stale" from a display perspective but the platform has not yet queued a refresh; data below 0.2 will trigger a background re-acquisition.

---

## How Scores Are Calculated

Confidence is a **weighted multi-factor score** computed from four components, with multiplicative penalties applied afterwards.

### The Formula

```
base_score = (method_score × 0.35)
           + (freshness_score × 0.25)
           + (validation_score × 0.25)
           + (health_score × 0.15)

final_score = base_score
            × (0.85 if partial_data)
            × (0.90 if stale_cache)
            × (max(0.5, 1.0 - parse_warnings × 0.05))

final_score = clamp(final_score, 0.0, 1.0)
```

### Component 1: Method Score (weight 35%)

The acquisition method is the strongest single signal. Structured APIs are more reliable than scraped HTML, which is more reliable than PDF calendars.

| Method | Base score | Upstream risk modifier | Notes |
|---|---|---|---|
| `api` | 1.00 | low: ×1.0 / medium: ×0.9 / high: ×0.75 | Official REST or JSON API |
| `hidden_json` | 0.95 | same modifiers | Undocumented JSON endpoint embedded in website |
| `html_form` | 0.85 | same modifiers | HTML form submission and scraping |
| `browser_automation` | 0.75 | same modifiers | Playwright/Puppeteer to interact with council website |
| `pdf_calendar` | 0.70 | same modifiers | Parsing a published PDF calendar |
| `unknown` | 0.30 | same modifiers | Method not yet identified |
| `unsupported` | 0.00 | — | Council not yet supported |

**Upstream risk modifiers** reflect how brittle the council's data source is (likelihood of breaking changes, bot protection, reliability):

- `low` → ×1.0 (no reduction)
- `medium` → ×0.9 (10% reduction)
- `high` → ×0.75 (25% reduction)

**Example:** An `html_form` adapter with `medium` upstream risk scores `0.85 × 0.9 = 0.765` for the method component.

### Component 2: Freshness Score (weight 25%)

Data decays over time. Each acquisition method has a "fresh window" (during which it scores 1.0) and a linear decay rate after that window.

| Method | Fresh window | Decay rate | Minimum score |
|---|---|---|---|
| `api` | 4 hours | −2.5% per hour | 0.20 |
| `hidden_json` | 4 hours | −2.5% per hour | 0.20 |
| `html_form` | 4 hours | −3.0% per hour | 0.20 |
| `browser_automation` | 4 hours | −3.0% per hour | 0.20 |
| `pdf_calendar` | 24 hours | −1.5% per hour | 0.20 |
| `unknown` | 1 hour | −10% per hour | 0.10 |
| `unsupported` | 0 hours | immediate | 0.00 |

**Examples:**
- API data fetched 2 hours ago → freshness = 1.0 (within 4-hour window)
- API data fetched 12 hours ago → 8 hours past window × 2.5% = −20% → freshness = 0.80
- PDF data fetched 24 hours ago → freshness = 1.0 (within 24-hour window)
- PDF data fetched 48 hours ago → 24 hours past window × 1.5% = −36% → freshness = 0.64

### Component 3: Validation Score (weight 25%)

During parsing, the adapter runs field-level validations (date format, service type enum, postcode format, etc.). Each failed validation reduces the score:

```
validation_score = max(0.0, 1.0 - (failed_validations × 0.1))
```

- 0 failures → 1.0
- 1 failure → 0.9
- 3 failures → 0.7
- 10 or more failures → 0.0

If no validations were run, the score defaults to 1.0 (benefit of the doubt).

### Component 4: Health Score (weight 15%)

The adapter's recent health performance contributes a small weighting. An adapter that has been failing frequently will drag down confidence even on successful acquisitions.

```
health_score = adapter.successRate24h
```

A healthy adapter (100% success rate) contributes 1.0; a degraded adapter (60% success rate) contributes 0.6.

### Multiplicative Penalties

After the weighted average is computed, penalties are applied multiplicatively:

| Condition | Penalty |
|---|---|
| **Partial data** — response was missing expected fields | ×0.85 (−15%) |
| **Stale cache** — served from cache past its freshness window | ×0.90 (−10%) |
| **Parse warnings** — non-fatal issues during parsing | ×max(0.5, 1.0 − warnings × 0.05) |

Multiple penalties stack multiplicatively: partial data + stale cache = ×0.85 × 0.90 = ×0.765 total.

---

## Full Example: Score Breakdown

**Scenario:** A `hidden_json` adapter with medium upstream risk, data cached 6 hours ago, 1 parse warning, all validations passed, healthy adapter.

```
Method:
  base = 0.95 (hidden_json)
  risk_modifier = 0.9 (medium)
  method_score = 0.95 × 0.9 = 0.855

Freshness:
  fresh_window = 4 hours
  age = 6 hours → 2 hours past window
  decay = 2 × 0.025 = 0.05
  freshness_score = 1.0 - 0.05 = 0.95

Validation:
  passed = 6, failed = 0
  validation_score = 1.0

Health:
  success_rate_24h = 0.97
  health_score = 0.97

Base score:
  (0.855 × 0.35) + (0.95 × 0.25) + (1.0 × 0.25) + (0.97 × 0.15)
  = 0.299 + 0.238 + 0.250 + 0.146
  = 0.933

Penalties:
  parse_warnings = 1 → 1.0 - (1 × 0.05) = 0.95

Final score:
  0.933 × 0.95 = 0.886 → CONFIRMED ✓
```

This matches what you would see in the API response:

```json
{
  "confidence": 0.886,
  "confidenceFactors": {
    "method": 0.855,
    "freshness": 0.95,
    "validation": 1.0,
    "health": 0.97
  }
}
```

---

## When to Re-Query

| Confidence score | `meta.fromCache` | Recommendation |
|---|---|---|
| ≥ 0.8 (CONFIRMED) | either | Display confidently. No action needed. |
| 0.6–0.79 (LIKELY) | `false` | Display with normal confidence. Monitor if score continues to drop. |
| 0.6–0.79 (LIKELY) | `true` | Consider re-querying within the next few hours. |
| 0.4–0.59 (UNVERIFIED) | either | Show data but add a caveat: *"Dates may not be up to date."* Consider re-querying. |
| < 0.4 (STALE) | either | Do not display dates without a prominent warning. Re-query immediately. Check `GET /v1/councils/:councilId/health` — the adapter may be degraded. |

You can also check `meta.nextRefreshAt` (present on collection responses) to see when the platform will automatically refresh the data. If `nextRefreshAt` is in the past, the data has not yet been refreshed and you may want to re-query.

---

## How to Use Confidence Scores in Your Application

### Display guidelines

Map the confidence level to a UI treatment:

| Level | Score | Suggested UI |
|---|---|---|
| CONFIRMED | ≥ 0.8 | Show dates normally — no caveats needed |
| LIKELY | 0.6–0.79 | Show dates normally, optionally add a subtle "last verified X hours ago" note |
| UNVERIFIED | 0.4–0.59 | Show dates with a visible warning: *"Dates may not be accurate — please verify with your council"* |
| STALE | < 0.4 | Show a maintenance banner rather than potentially wrong dates |

### Notifications and reminders

If you're sending push notifications or calendar reminders based on collection dates:

- Only send notifications for events with confidence ≥ 0.6 (LIKELY or better)
- For CONFIRMED (≥ 0.8) events, send reminders the evening before as usual
- For LIKELY (0.6–0.79) events, consider re-querying on the morning of the collection to confirm

### Filtering by confidence

You can filter events in your own application layer using `confidence`:

```typescript
const reliableEvents = collections.data.filter(
  event => (event.confidence ?? 1.0) >= 0.6
);
```

Note: if `confidence` is absent (some council adapters don't yet emit it), treat the event as LIKELY (0.7).

### Reading the `confidenceFactors` breakdown

If you want to show users *why* confidence is low, the `confidenceFactors` object identifies which component is dragging the score down:

```typescript
function explainLowConfidence(event: CollectionEvent): string {
  const f = event.confidenceFactors;
  if (!f) return 'Data quality unknown';

  if (f.freshness < 0.5) return 'Data may be out of date';
  if (f.method < 0.6)    return 'Data source is less reliable for this council';
  if (f.validation < 0.8) return 'Some data fields could not be validated';
  if (f.health < 0.7)    return 'Council data service is experiencing issues';

  return 'Data quality is acceptable';
}
```

### Caching strategy

The platform's own cache already improves freshness — `meta.fromCache: true` with `meta.dataFreshnessHours < 4` is not a concern. Build your own client-side cache using `meta.nextRefreshAt` as the cache expiry:

```typescript
const cached = cache.get(propertyId);
if (cached && new Date(cached.meta.nextRefreshAt) > new Date()) {
  return cached; // platform won't have new data yet
}
return await fetchCollections(propertyId);
```

---

## Confidence by Council (Typical Ranges)

| Council | Typical method | Typical score range | Notes |
|---|---|---|---|
| Eastleigh | `hidden_json` | 0.85–0.95 | Very reliable undocumented JSON API |
| Winchester | `html_form` | 0.75–0.90 | Stable form, occasional parse warnings |
| Basingstoke & Deane | `html_form` | 0.75–0.88 | Medium upstream risk |
| Portsmouth | `html_form` | 0.70–0.88 | Medium risk, generally stable |
| Southampton | `hidden_json` | 0.80–0.93 | Good API, low upstream risk |
| Test Valley | `html_form` | 0.72–0.87 | |
| Eastleigh | `hidden_json` | 0.85–0.95 | |
| Fareham | `html_form` | 0.65–0.85 | Medium-high risk; check health before use |
| Hart | `html_form` | 0.70–0.85 | |
| Havant | `html_form` | 0.70–0.85 | |
| Rushmoor | `html_form` | 0.70–0.85 | |
| East Hampshire | `html_form` | 0.70–0.85 | |
| New Forest | `html_form` | 0.68–0.84 | Higher upstream risk |
| Gosport | — | 0.0 | Postponed — adapter not yet implemented |

> These ranges are illustrative. Always use the live `confidence` value in the API response rather than assuming a council's typical range.

---

## Frequently Asked Questions

**Q: Why does the same property return different confidence scores on different days?**  
A: Confidence reflects the *current* state of the data. Freshness decays over time, adapter health fluctuates, and parse results vary. A score from yesterday is not the same as today's score.

**Q: What does it mean if `confidence` is absent from a `CollectionEvent`?**  
A: Some adapters may not yet emit per-event scores (confidence scoring was introduced in Phase 3). The `meta.confidence` on the response envelope always contains an overall acquisition confidence. Treat absent per-event scores as equivalent to the envelope confidence.

**Q: Can I use the confidence score as a boolean "is this data trustworthy"?**  
A: Use the named thresholds rather than a simple threshold of your own choosing — the platform's CONFIRMED (≥0.8) and LIKELY (≥0.6) bands are the intended decision points. Consider your use case: a reminder app should require LIKELY or better; a real-time display might show UNVERIFIED data with a caveat.

**Q: Why is freshness weighted less than the acquisition method?**  
A: Method reliability (35%) dominates because a well-tested API adapter is fundamentally more trustworthy than a scraped HTML form regardless of age. Freshness (25%) matters, but a 2-hour-old API response is nearly as good as a live one for the typical use case (planning bin day). If real-time accuracy is critical, filter on `meta.dataFreshnessHours < 4`.

**Q: Will confidence scores ever reach exactly 1.0?**  
A: In practice, scores above 0.95 are uncommon. A score of 1.0 requires a fresh API call (≤4 hours old) on a council with `low` upstream risk, zero parse warnings, zero validation failures, and a perfectly healthy adapter (100% success rate in the past 24 hours).
