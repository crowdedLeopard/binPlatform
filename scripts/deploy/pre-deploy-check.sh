#!/usr/bin/env bash
# Pre-deployment validation — run BEFORE terraform apply
set -euo pipefail

echo "=== Hampshire Bin Platform — Pre-Deployment Check ==="

# Check Azure CLI
echo -n "Azure CLI... "
az --version --output none 2>&1 && echo "✓" || { echo "✗ — install from https://aka.ms/install-azure-cli"; exit 1; }

# Check authentication
echo -n "Azure auth... "
az account show --output none 2>&1 && echo "✓" || { echo "✗ — run: az login"; exit 1; }

# Show current subscription
SUBSCRIPTION=$(az account show --query "{name:name, id:id}" --output json)
echo "Subscription: $SUBSCRIPTION"

# Check Terraform
echo -n "Terraform... "
terraform version >/dev/null 2>&1 && echo "✓" || { echo "✗ — install from https://terraform.io"; exit 1; }

# Check Docker
echo -n "Docker... "
docker --version >/dev/null 2>&1 && echo "✓" || { echo "✗ — Docker required for image build"; exit 1; }

# Check Node.js
echo -n "Node.js... "
node --version >/dev/null 2>&1 && echo "✓" || { echo "✗ — Node.js required for migrations"; exit 1; }

# Check required env vars
echo ""
echo "Checking required configuration..."
REQUIRED_VARS=(
  "TF_VAR_location"
  "TF_VAR_environment"
)
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "⚠ $var not set (will use Terraform defaults)"
  else
    echo "✓ $var = ${!var}"
  fi
done

echo ""
echo "=== Pre-deployment check complete ==="
echo "Run: ./scripts/deploy/deploy-staging.sh"
