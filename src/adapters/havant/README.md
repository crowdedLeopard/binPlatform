# Havant Borough Council Adapter

**Council ID:** `havant`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ⚠️ Selectors Not Yet Validated

---

## ⚠️ IMPORTANT: Selectors Require Validation

This adapter has been implemented based on common council website patterns but **has not yet been validated against the live Havant website**. Selectors must be verified before production use.

---

## Acquisition Path

### Method: Browser Automation (Playwright)

**Lookup Page:**
```
https://www.havant.gov.uk/bin-collections
```

**Workflow:**
1. Navigate to lookup page
2. Fill postcode or address input field
3. Submit form
4. Determine North/South area (if needed)
5. Parse results and extract collection schedule

---

## Input Requirements

### Primary Input: Postcode or Address

**Format:** UK postcode (e.g., `PO9 1AA`) or partial address

**Served Postcodes:** PO7, PO8, PO9

---

## Service Types Supported

- **General Waste** (Rubbish) - Alternate weekly
- **Recycling** - Alternate weekly
- **Food Waste** - Weekly (Spring 2026 rollout)
- **Garden Waste** (if offered)

---

## Special Handling

### North/South Area Split

Havant has downloadable PDF calendars split by North/South areas. The adapter should:
1. Determine area from address lookup
2. Store area in property metadata
3. Use area-specific calendar if needed

### Alternate Weekly Service

Rubbish one week, recycling the next. Parser should handle week A/B designation.

### Food Waste Rollout

Food waste collections starting Spring 2026 — adapter should handle both pre- and post-rollout states.

---

## Environment Variables

```bash
HAVANT_BASE_URL=https://www.havant.gov.uk
ADAPTER_KILL_SWITCH_HAVANT=true
```

---

## Security Profile

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Browser Automation Required** | Yes |
| **External Domains** | havant.gov.uk |
| **Sandboxed** | Yes |

---

## Testing Postcodes

```
PO9 1AA  (Havant town)
PO7 5XX  (Leigh Park area)
```

---

## References

- [Havant Bin Collections](https://www.havant.gov.uk/bin-collections)
- Discovery Notes: `docs/discovery/havant-notes.md`
