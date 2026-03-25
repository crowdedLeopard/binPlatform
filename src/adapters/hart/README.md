# Hart District Council Adapter

**Council ID:** `hart`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ⚠️ Selectors Not Yet Validated

---

## ⚠️ IMPORTANT: Selectors Require Validation

This adapter has been implemented based on common council website patterns but **has not yet been validated against the live Hart website**. Selectors must be verified before production use.

---

## Acquisition Path

### Method: Browser Automation (Playwright)

**Lookup Page:**
```
https://www.hart.gov.uk/waste-and-recycling/when-my-bin-day
```

**Alternative Map Tool:**
```
https://maps.hart.gov.uk/mycouncil.aspx
```

**Workflow:**
1. Navigate to lookup page
2. Fill postcode input field
3. Submit form
4. Parse collection day from results
5. Optional: Download year-round calendar for extended data

---

## Input Requirements

### Primary Input: Postcode

**Format:** UK postcode (e.g., `GU51 1AA`, `GU14 7XX`)

**Served Postcodes:** GU11-GU14, GU17, GU46, GU51-GU52

**Note:** Some postcodes overlap with Rushmoor (GU11, GU14). Address disambiguation may be required.

---

## Service Types Supported

- **General Waste** (Rubbish)
- **Recycling**
- **Food Waste**
- **Garden Waste** (if offered)

---

## Special Handling

### Year-Round Calendar

Hart offers downloadable calendars for the full year. This provides opportunity for:
- Extended event data (365 days)
- Reduced lookup frequency
- Fallback if main form fails

### Map Tool Fallback

If the main form is blocked or changes, `maps.hart.gov.uk/mycouncil.aspx` can be used as fallback.

---

## Environment Variables

```bash
HART_BASE_URL=https://www.hart.gov.uk
ADAPTER_KILL_SWITCH_HART=true
```

---

## Security Profile

| Property | Value |
|----------|-------|
| **Risk Level** | MEDIUM |
| **Browser Automation Required** | Yes |
| **External Domains** | hart.gov.uk, maps.hart.gov.uk (fallback) |
| **Sandboxed** | Yes |

---

## Testing Postcodes

```
GU51 1AA  (Fleet town)
GU14 7XX  (Farnborough - check vs Rushmoor)
GU17 0XX  (Blackwater area)
```

---

## References

- [Hart Bin Day Lookup](https://www.hart.gov.uk/waste-and-recycling/when-my-bin-day)
- Discovery Notes: `docs/discovery/hart-notes.md`
