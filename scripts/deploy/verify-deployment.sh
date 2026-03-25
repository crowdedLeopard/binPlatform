#!/usr/bin/env bash
# Post-deployment smoke test — run after any deployment
set -euo pipefail

API_URL="${1:?Usage: $0 <api-url> [api-key]}"
API_KEY="${2:-}"

AUTH_HEADER=""
[ -n "$API_KEY" ] && AUTH_HEADER="-H \"X-API-Key: $API_KEY\""

PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" $AUTH_HEADER "$url")
  if [ "$HTTP_STATUS" = "$expected_status" ]; then
    echo "✓ $name ($HTTP_STATUS)"
    ((PASS++))
  else
    echo "✗ $name (expected $expected_status, got $HTTP_STATUS)"
    ((FAIL++))
  fi
}

echo "=== Post-Deployment Verification: $API_URL ==="
echo ""

# Core health
check "Liveness probe"       "${API_URL}/health/live"
check "Readiness probe"      "${API_URL}/health/ready"
check "Metrics endpoint"     "${API_URL}/metrics" 200

# Public API
check "Councils list"        "${API_URL}/v1/councils"
check "Eastleigh council"    "${API_URL}/v1/councils/eastleigh"
check "Fareham council"      "${API_URL}/v1/councils/fareham"
check "Rushmoor council"     "${API_URL}/v1/councils/rushmoor"

# Auth enforcement
check "Admin without key (expect 401)" "${API_URL}/v1/admin/dashboard" 401
check "Unknown endpoint (expect 404)"  "${API_URL}/v1/nonexistent" 404

# Adapter health (requires API key)
if [ -n "$API_KEY" ]; then
  check "Eastleigh health"   "${API_URL}/v1/councils/eastleigh/health"
  check "Fareham health"     "${API_URL}/v1/councils/fareham/health"
  check "Rushmoor health"    "${API_URL}/v1/councils/rushmoor/health"
  check "Admin dashboard"    "${API_URL}/v1/admin/dashboard"
  check "Adapter health"     "${API_URL}/v1/admin/adapters/health"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && echo "✓ All checks passed" && exit 0
echo "✗ $FAIL checks failed — review logs before proceeding"
exit 1
