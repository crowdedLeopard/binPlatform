#!/usr/bin/env bash
# Full staging deployment — Azure Container Apps
# Beta scope: Eastleigh, Fareham, Rushmoor only
set -euo pipefail

ENVIRONMENT="staging"
LOCATION="${AZURE_LOCATION:-uksouth}"
RESOURCE_GROUP="rg-binplatform-${ENVIRONMENT}"
ACR_NAME="acrbinplatform${ENVIRONMENT}"  # must be globally unique, lowercase
KEY_VAULT_NAME="kv-binplatform-${ENVIRONMENT}"

echo "=== Hampshire Bin Platform — Staging Deployment ==="
echo "Environment: $ENVIRONMENT"
echo "Location: $LOCATION"
echo "Resource Group: $RESOURCE_GROUP"
echo ""

# Step 1: Create resource group
echo "[1/8] Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags environment="$ENVIRONMENT" project="binplatform"

# Step 2: Create Azure Container Registry
echo "[2/8] Creating Container Registry..."
az acr create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$ACR_NAME" \
  --sku Basic \
  --admin-enabled false

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer --output tsv)
echo "ACR: $ACR_LOGIN_SERVER"

# Step 3: Build and push images
echo "[3/8] Building and pushing container images..."

# Authenticate Docker to ACR
az acr login --name "$ACR_NAME"

IMAGE_TAG=$(git rev-parse --short HEAD)

# Build API image
docker build \
  --file deploy/Dockerfile \
  --tag "${ACR_LOGIN_SERVER}/binplatform-api:${IMAGE_TAG}" \
  --tag "${ACR_LOGIN_SERVER}/binplatform-api:latest" \
  .

# Build monitor image
docker build \
  --file deploy/Dockerfile.monitor \
  --tag "${ACR_LOGIN_SERVER}/binplatform-monitor:${IMAGE_TAG}" \
  --tag "${ACR_LOGIN_SERVER}/binplatform-monitor:latest" \
  .

# Push images
docker push "${ACR_LOGIN_SERVER}/binplatform-api:${IMAGE_TAG}"
docker push "${ACR_LOGIN_SERVER}/binplatform-api:latest"
docker push "${ACR_LOGIN_SERVER}/binplatform-monitor:${IMAGE_TAG}"
docker push "${ACR_LOGIN_SERVER}/binplatform-monitor:latest"

echo "Images pushed: ${IMAGE_TAG}"

# Step 4: Create Key Vault for secrets
echo "[4/8] Setting up Key Vault..."
az keyvault create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$KEY_VAULT_NAME" \
  --location "$LOCATION" \
  --sku standard \
  --enable-rbac-authorization true

KEY_VAULT_URI=$(az keyvault show --name "$KEY_VAULT_NAME" --query properties.vaultUri --output tsv)
echo "Key Vault: $KEY_VAULT_URI"

# Step 5: Terraform for networking, database, Container Apps
echo "[5/8] Running Terraform..."
cd infra/terraform/environments/staging

# Create terraform.tfvars
cat > terraform.tfvars <<EOF
location       = "${LOCATION}"
environment    = "${ENVIRONMENT}"
resource_group = "${RESOURCE_GROUP}"
acr_name       = "${ACR_NAME}"
image_tag      = "${IMAGE_TAG}"
key_vault_name = "${KEY_VAULT_NAME}"

# Beta: enable only 3 councils
enabled_adapters = ["eastleigh", "fareham", "rushmoor"]

# Kill switches: disable all others
adapter_kill_switches = {
  basingstoke_deane = true
  east_hampshire    = true
  gosport           = true
  hart              = true
  havant            = true
  new_forest        = true
  portsmouth        = true
  southampton       = true
  test_valley       = true
  winchester        = true
}
EOF

terraform init
terraform plan -out=staging.tfplan
echo ""
echo "⚠ Review the plan above."
read -p "Apply? (yes/no): " CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Cancelled."; exit 0; }
terraform apply staging.tfplan
cd -

# Step 6: Run database migrations
echo "[6/8] Running database migrations..."
# Get DB connection string from Key Vault / Terraform output
DB_URL=$(terraform -chdir=infra/terraform/environments/staging output -raw database_url 2>/dev/null || echo "")
if [ -z "$DB_URL" ]; then
  echo "⚠ DB_URL not found in outputs — set DATABASE_URL manually and run: npm run db:migrate"
else
  DATABASE_URL="$DB_URL" npm run db:migrate
fi

# Step 7: Verify deployment
echo "[7/8] Verifying deployment..."
API_URL=$(terraform -chdir=infra/terraform/environments/staging output -raw api_url 2>/dev/null || echo "")
if [ -n "$API_URL" ]; then
  echo "API URL: $API_URL"
  sleep 30  # wait for container to start
  
  # Health check
  echo -n "Health check... "
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/health/ready")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo "✓ (200)"
  else
    echo "✗ (HTTP $HTTP_STATUS) — check container logs"
  fi
  
  # Councils endpoint
  echo -n "Councils API... "
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${API_URL}/v1/councils")
  [ "$HTTP_STATUS" = "200" ] && echo "✓" || echo "✗ (HTTP $HTTP_STATUS)"
fi

# Step 8: Configure beta adapter kill switches
echo "[8/8] Configuring beta kill switches..."
echo "Beta mode: Eastleigh, Fareham, Rushmoor ONLY"
echo "All other adapters are kill-switched via Terraform variable."
echo ""
echo "=== Staging deployment complete ==="
echo "API: ${API_URL:-<check Terraform outputs>}"
echo "ACR: $ACR_LOGIN_SERVER"
echo "Key Vault: $KEY_VAULT_URI"
echo "Resource Group: $RESOURCE_GROUP"
echo ""
echo "Next: Run ./scripts/deploy/seed-api-keys.sh to create admin API keys"
