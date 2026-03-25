# BinDay — Terraform Infrastructure

This directory contains Terraform configurations for deploying the BinDay application to Azure across **staging** and **production** environments.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Repository Layout](#repository-layout)
- [State Management](#state-management)
- [Variable Files](#variable-files)
- [Deploying to Staging](#deploying-to-staging)
- [Deploying to Production](#deploying-to-production)
- [Environment Differences](#environment-differences)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Tool | Minimum Version | Install |
|------|----------------|---------|
| [Terraform](https://developer.hashicorp.com/terraform/downloads) | **1.6.0** | `winget install HashiCorp.Terraform` |
| [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) | 2.55.0 | `winget install Microsoft.AzureCLI` |
| [Docker](https://docs.docker.com/get-docker/) | 24.x | Required only to build/push container images |

### Authenticate with Azure

```bash
az login
az account set --subscription "<your-subscription-id>"
```

Verify the correct subscription is active:

```bash
az account show --query "{name:name, id:id}" -o table
```

---

## Repository Layout

```
infra/terraform/
├── README.md                   # This file
├── environments/
│   ├── production/
│   │   ├── main.tf             # Production root module
│   │   ├── variables.tf        # Input variable declarations
│   │   └── production.tfvars   # Production variable values (git-ignored secrets)
│   └── staging/
│       ├── main.tf             # Staging root module
│       ├── variables.tf        # Input variable declarations
│       └── staging.tfvars      # Staging variable values (git-ignored secrets)
└── modules/
    ├── networking/             # VNet, subnets, NSGs
    ├── database/               # Azure Database for PostgreSQL Flexible Server
    ├── storage/                # Azure Storage Account
    ├── api/                    # Azure Container Apps
    └── monitoring/             # Log Analytics, Application Insights, alerts
```

---

## State Management

Remote state is stored in **Azure Blob Storage** so all team members and CI/CD pipelines share the same state.

### Backend storage account

| Setting | Value |
|---------|-------|
| Resource Group | `rg-binday-tfstate` |
| Storage Account | `stbindaytfstate` |
| Container | `tfstate` |
| Production key | `production/terraform.tfstate` |
| Staging key | `staging/terraform.tfstate` |

### Bootstrap the backend (one-time setup)

Run this once before the first `terraform init`:

```bash
az group create \
  --name rg-binday-tfstate \
  --location uksouth

az storage account create \
  --name stbindaytfstate \
  --resource-group rg-binday-tfstate \
  --sku Standard_GRS \
  --kind StorageV2 \
  --allow-blob-public-access false \
  --min-tls-version TLS1_2

az storage container create \
  --name tfstate \
  --account-name stbindaytfstate \
  --auth-mode login
```

Enable soft-delete and versioning on the container for state file protection:

```bash
az storage account blob-service-properties update \
  --account-name stbindaytfstate \
  --enable-versioning true \
  --enable-delete-retention true \
  --delete-retention-days 30
```

---

## Variable Files

Sensitive values (passwords, connection strings, container registry credentials) **must not** be committed to source control. Provide them via `.tfvars` files that are listed in `.gitignore`.

### Required variables

| Variable | Description |
|----------|-------------|
| `location` | Azure region, e.g. `"uksouth"` |
| `owner` | Team/person tag value, e.g. `"platform-team"` |
| `db_admin_username` | PostgreSQL administrator login |
| `db_admin_password` | PostgreSQL administrator password (min 8 chars) |
| `api_container_image` | Full image tag, e.g. `"myregistry.azurecr.io/binday-api:v1.2.3"` |
| `container_registry` | Azure Container Registry name |
| `alert_email` | Email address for monitoring alerts |
| `vnet_address_space` | CIDR block for the VNet, e.g. `["10.0.0.0/16"]` |

### Example `staging.tfvars`

```hcl
location             = "uksouth"
owner                = "platform-team"
db_admin_username    = "bindayadmin"
db_admin_password    = "REPLACE_ME"
api_container_image  = "stbindayregistry.azurecr.io/binday-api:latest"
container_registry   = "stbindayregistry"
alert_email          = "dev-team@example.com"
vnet_address_space   = ["10.1.0.0/16"]
```

### Example `production.tfvars`

```hcl
location             = "uksouth"
owner                = "platform-team"
db_admin_username    = "bindayadmin"
db_admin_password    = "REPLACE_ME"
api_container_image  = "stbindayregistry.azurecr.io/binday-api:v1.2.3"
container_registry   = "stbindayregistry"
alert_email          = "oncall@example.com"
vnet_address_space   = ["10.0.0.0/16"]
```

> **Tip:** Store production secrets in Azure Key Vault or your CI/CD secret store and inject them as environment variables (`TF_VAR_db_admin_password`) rather than writing them to disk.

---

## Deploying to Staging

```bash
cd infra/terraform/environments/staging

# 1. Initialise — downloads providers and configures remote backend
terraform init

# 2. Validate configuration syntax
terraform validate

# 3. Review the execution plan
terraform plan -var-file="staging.tfvars" -out=staging.tfplan

# 4. Apply the plan
terraform apply staging.tfplan
```

### Destroy staging (cost saving)

```bash
terraform destroy -var-file="staging.tfvars"
```

---

## Deploying to Production

> ⚠️ **Always plan before applying to production.** Review every resource change carefully.

```bash
cd infra/terraform/environments/production

# 1. Initialise
terraform init

# 2. Validate
terraform validate

# 3. Review the plan — save it so apply uses exactly what was reviewed
terraform plan -var-file="production.tfvars" -out=production.tfplan

# 4. Apply
terraform apply production.tfplan
```

### Targeted apply (change a single module)

```bash
terraform plan -var-file="production.tfvars" -target=module.api -out=api.tfplan
terraform apply api.tfplan
```

### View outputs after deploy

```bash
terraform output
# Sensitive outputs:
terraform output application_insights_connection_string
```

---

## Environment Differences

| Configuration | Staging | Production |
|---------------|---------|------------|
| Database SKU | `B_Standard_B1ms` | `GP_Standard_D4s_v3` |
| DB storage | 32 GB | 128 GB |
| DB backup retention | 7 days | 35 days |
| Geo-redundant backup | No | Yes |
| Storage replication | LRS | GRS |
| Blob versioning | Disabled | Enabled |
| Blob soft-delete | 7 days | 30 days |
| API min replicas | 1 | 3 |
| API max replicas | 3 | 10 |
| API CPU | 0.5 vCPU | 1.0 vCPU |
| API memory | 1 Gi | 2 Gi |
| Log retention | 30 days | 90 days |
| Monitoring alerts | Disabled | Enabled |
| Key Vault purge protection | Off | On |
| RG deletion protection | Off | On |

---

## Troubleshooting

### `Error: Failed to get existing workspaces`

The backend storage account or container does not exist yet. Run the [bootstrap commands](#bootstrap-the-backend-one-time-setup) first.

### `Error: A resource with the ID … already exists`

State drift — the resource exists in Azure but not in state. Import it:

```bash
terraform import azurerm_resource_group.main /subscriptions/<sub-id>/resourceGroups/rg-binday-production
```

### `Error: waiting for creation of … (Deadline Exceeded)`

Azure resource provisioning timed out. Re-run `terraform apply` — Terraform is idempotent and will resume from where it left off.

### `Error: Invalid value for "password"`

The `db_admin_password` does not meet Azure's complexity requirements (minimum 8 characters, must include uppercase, lowercase, digit, and special character).

### `Error: Provider produced inconsistent result after apply`

Usually a provider version mismatch. Run:

```bash
terraform init -upgrade
```

### Locked state file

If a previous run was interrupted, the state may be locked. Retrieve the lock ID from the error message, then:

```bash
terraform force-unlock <LOCK_ID>
```

### Formatting and linting

```bash
# Auto-format all .tf files
terraform fmt -recursive

# Lint with tflint (if installed)
tflint --recursive
```

---

## CI/CD Integration

In GitHub Actions, set the following secrets and pass them as environment variables:

```yaml
env:
  ARM_CLIENT_ID:       ${{ secrets.ARM_CLIENT_ID }}
  ARM_CLIENT_SECRET:   ${{ secrets.ARM_CLIENT_SECRET }}
  ARM_SUBSCRIPTION_ID: ${{ secrets.ARM_SUBSCRIPTION_ID }}
  ARM_TENANT_ID:       ${{ secrets.ARM_TENANT_ID }}
  TF_VAR_db_admin_password: ${{ secrets.DB_ADMIN_PASSWORD }}
```

The `azurerm` provider will pick up the `ARM_*` variables automatically — no `az login` is required in CI.
