# Eastleigh Borough Council Adapter

**Council ID:** `eastleigh`  
**Adapter Version:** 1.0.0  
**Last Updated:** 2026-03-25  
**Status:** ⚠️ LIMITED - Cloudflare Protection Blocks Direct HTTP Access

---

## Acquisition Path

### Method: HTML Scraping from Waste Collection Page

Eastleigh provides waste collection information via an HTML page that requires UPRN input.

**Endpoint:**
``
https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates/your-waste-bin-and-recycling-collections?uprn=<uprn>
``

**Request Type:** HTTP GET  
**Authentication:** None (public endpoint)  
**Rate Limit:** ~30 requests/minute (conservative)  
**Protection:** Cloudflare Bot Management (blocks non-browser requests)

### ⚠️ Cloudflare Protection Issue

**Current Limitation:** The Eastleigh website is protected by Cloudflare, which blocks automated HTTP requests that don't come from a real browser.

**Symptoms:**
- Direct `fetch()` requests receive Cloudflare challenge page
- Response contains: `"Just a moment..."` and `_cf_chl_opt` JavaScript
- Cannot retrieve actual collection data without JavaScript execution

**Solutions:**
1. **Browser Automation** (Recommended): Use Playwright/Puppeteer to bypass Cloudflare
2. **Cloudflare Bypass Service**: Use third-party services (not recommended for production)
3. **Wait for Council API**: Request official API from Eastleigh Borough Council

**Reference:** UKBinCollectionData project encountered same issue ([Issue #1428](https://github.com/robbrad/UKBinCollectionData/issues/1428))

---

## Current Implementation

The adapter is **partially implemented** with:
- ✅ Correct endpoint URL
- ✅ HTML parser for `dl.dl-horizontal` element
- ✅ Date parsing for "Day, DD MMM YYYY" format
- ✅ Service type mapping (Household Waste, Recycling, Food Waste, Garden Waste, Glass Box)
- ✅ Cloudflare detection and graceful failure
- ❌ Cloudflare bypass (requires browser automation)

**To Enable:** Convert adapter to use `BrowserAdapter` base class with Playwright for JavaScript execution and cookie handling.

---

## References

- **Council Website:** https://www.eastleigh.gov.uk
- **Collection Info:** https://www.eastleigh.gov.uk/waste-bins-and-recycling/collection-dates
- **UKBinCollectionData Eastleigh:** https://github.com/robbrad/UKBinCollectionData/issues/247
- **Cloudflare Issue:** https://github.com/robbrad/UKBinCollectionData/issues/1428

---

## Changelog

### 2026-03-25 — Version 1.0.0
- ✅ Fixed endpoint URL (changed from `/apex/EBC_Waste_Calendar` to correct HTML page)
- ✅ Changed from JSON parsing to HTML parsing
- ✅ Added "Day, DD MMM YYYY" date format support
- ✅ Added Cloudflare detection
- ✅ Updated service type mappings for Eastleigh bin names
- ✅ Evidence storage: raw HTML before parsing
- ❌ Cloudflare protection blocks access — browser automation needed
- ⚠️ Set `isProductionReady: false` until Cloudflare bypass implemented
