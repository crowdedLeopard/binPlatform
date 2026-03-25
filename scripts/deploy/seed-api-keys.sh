#!/usr/bin/env bash
# Create initial API keys for staging
set -euo pipefail

API_URL="${1:-}"
ADMIN_KEY="${2:-}"

if [ -z "$API_URL" ] || [ -z "$ADMIN_KEY" ]; then
  echo "Usage: $0 <api-url> <bootstrap-admin-key>"
  echo "Bootstrap admin key is set via BOOTSTRAP_ADMIN_KEY env var in Container App"
  exit 1
fi

echo "Creating API keys..."

# Create a read-only key for testing
echo -n "Read-only key... "
curl -s -X POST "${API_URL}/v1/admin/keys" \
  -H "X-API-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "beta-tester-1", "role": "read", "expiresInDays": 90}' \
  | jq '.key'

echo ""
echo "Keys created. Store securely in Key Vault."
