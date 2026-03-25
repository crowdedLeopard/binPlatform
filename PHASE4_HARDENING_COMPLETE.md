# Phase 4: Adapter & API Hardening - Complete

## Summary

Naomi completed comprehensive security hardening across adapters, API endpoints, and error responses:

## Deliverables

1. **Error Response Hardening** (src/api/middleware/error-handler.ts)
   - Never leaks stack traces, file paths, DB queries
   - Consistent error shape with requestId
   - Dual Hono + Fastify support

2. **API Request Hardening** (src/api/middleware/request-hardening.ts)
   - 10KB request size limit
   - Strict path validation (blocks path traversal)
   - 30s timeout enforcement
   - Auto-inject requestId
   - Method validation (405 not 404)

3. **Adapter Sanitisation** (src/adapters/base/sanitise.ts)
   - Strip HTML (prevent XSS)
   - Truncate long strings
   - Validate dates, enums, formats
   - Filter unknown fields

4. **Rate Limit Tiers** (src/api/middleware/rateLimit.ts)
   - PUBLIC_READ: 200/min
   - ADDRESS_RESOLUTION: 20/min (expensive)
   - COLLECTION_DATA: 60/min
   - HEALTH: 600/min
   - ADMIN_WRITE: 10/min

5. **Cache Poisoning Prevention** (src/storage/cache/client.ts)
   - Namespaced keys: cache:{councilId}:{type}:{...}
   - Key validation (no path traversal)
   - 1MB max cached value size
   - Auto-delete corrupted values

6. **Adapter Validator** (src/adapters/base/adapter-validator.ts)
   - Validates schema conformance
   - Adds warnings (doesn't throw)
   - Checks dates, confidence, required fields

7. **Selector Validation Guide** (docs/adapters/selector-validation-guide.md)
   - Process for validating 11 browser adapters
   - Known fragile patterns documented
   - Quarterly validation schedule

## Files Created

- src/api/middleware/error-handler.ts (368 lines)
- src/api/middleware/request-hardening.ts (322 lines)
- src/adapters/base/sanitise.ts (427 lines)
- src/adapters/base/adapter-validator.ts (369 lines)
- docs/adapters/selector-validation-guide.md (397 lines)
- .squad/decisions/inbox/naomi-phase4-hardening.md (442 lines)

## Files Modified

- src/api/middleware/rateLimit.ts (enhanced with tiered limits)
- src/storage/cache/client.ts (enhanced with poisoning prevention)
- .squad/agents/naomi/history.md (appended Phase 4 learnings)

## Key Patterns Established

1. **Defense in Depth:** Error handler + request hardening + sanitisation + validation
2. **Generic Errors:** Never leak internal details (stack, paths, SQL)
3. **Tiered Rate Limits:** Match limits to endpoint cost
4. **Namespaced Cache Keys:** Prevent collision, enable invalidation
5. **Warn, Don't Throw:** Degraded result > no result

## Next Steps (Phase 5)

1. Integrate sanitisation into base adapter class
2. Configure rate limits on all route definitions
3. Enable cache validation callbacks
4. Create adapter quality dashboard
5. Schedule quarterly selector validation

---

**Date:** 2026-03-26
**Author:** Naomi (Backend Developer)
**Status:** ✅ Complete
