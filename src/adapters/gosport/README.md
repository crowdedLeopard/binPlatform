# Gosport Borough Council Adapter

**Council ID:** `gosport`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ⚠️ Selectors Not Yet Validated

---

## ⚠️ IMPORTANT: Selectors Require Validation

This adapter has been implemented based on common council website patterns but **has not yet been validated against the live Gosport website**. Selectors must be verified before production use.

---

## Acquisition Path

### Method: Browser Automation (Playwright)

**Lookup Page:**
```
https://www.gosport.gov.uk/refuserecyclingdays
```

**Workflow:**
1. Navigate to lookup page
2. Handle cookie consent banner (if present)
3. Fill postcode input field (requires space format)
4. Submit form
5. Parse results (address selection if multiple)
6. Extract collection schedule

---

## Input Requirements

### Primary Input: Postcode

**Format:** UK postcode with space (e.g., `PO12 1AA`, `PO13 9XX`)

**Served Postcodes:** PO12, PO13

---

## Service Types Supported

- **General Waste** (Rubbish)
- **Recycling**
- **Food Waste**
- **Garden Waste** (if offered)

---

## Special Handling

### Cookie Consent Banner

Gosport has a cookie consent banner that may need automated dismissal before form interaction.

### PDF Calendar Option

Annual PDF calendar available (2025/26) — could be implemented as fallback or caching opportunity.

---

## Environment Variables

```bash
GOSPORT_BASE_URL=https://www.gosport.gov.uk
ADAPTER_KILL_SWITCH_GOSPORT=true
```

---

## Security Profile

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Browser Automation Required** | Yes |
| **External Domains** | gosport.gov.uk |
| **Sandboxed** | Yes |

---

## Testing Postcodes

```
PO12 1AA  (Gosport town)
PO13 9XX  (Lee-on-the-Solent area)
```

---

## References

- [Gosport Refuse & Recycling Days](https://www.gosport.gov.uk/refuserecyclingdays)
- Discovery Notes: `docs/discovery/gosport-notes.md`
