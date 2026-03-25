terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.85"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-binday-tfstate"
    storage_account_name = "stbindaytfstate"
    container_name       = "tfstate"
    key                  = "production/terraform.tfstate"
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
    virtual_machine {
      delete_os_disk_on_deletion     = true
      graceful_shutdown              = true
      skip_shutdown_and_force_delete = false
    }
  }
}

###############################################################################
# Locals
###############################################################################

locals {
  environment  = "production"
  project      = "binday"
  location     = var.location
  name_prefix  = "${local.project}-${local.environment}"

  common_tags = {
    Environment = local.environment
    Project     = local.project
    ManagedBy   = "Terraform"
    Owner       = var.owner
  }
}

###############################################################################
# Resource Group
###############################################################################

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name_prefix}"
  location = local.location
  tags     = local.common_tags
}

###############################################################################
# Modules
###############################################################################

module "networking" {
  source = "../../modules/networking"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = local.environment
  name_prefix         = local.name_prefix
  address_space       = var.vnet_address_space
  tags                = local.common_tags
}

module "database" {
  source = "../../modules/database"

  resource_group_name    = azurerm_resource_group.main.name
  location               = azurerm_resource_group.main.location
  environment            = local.environment
  name_prefix            = local.name_prefix
  subnet_id              = module.networking.database_subnet_id
  sku_name               = "GP_Standard_D4s_v3"
  storage_mb             = 131072
  backup_retention_days  = 35
  geo_redundant_backup   = true
  administrator_login    = var.db_admin_username
  administrator_password = var.db_admin_password
  tags                   = local.common_tags

  depends_on = [module.networking]
}

module "storage" {
  source = "../../modules/storage"

  resource_group_name      = azurerm_resource_group.main.name
  location                 = azurerm_resource_group.main.location
  environment              = local.environment
  name_prefix              = local.name_prefix
  account_replication_type = "GRS"
  account_tier             = "Standard"
  enable_versioning        = true
  soft_delete_retention    = 30
  tags                     = local.common_tags
}

module "api" {
  source = "../../modules/api"

  resource_group_name  = azurerm_resource_group.main.name
  location             = azurerm_resource_group.main.location
  environment          = local.environment
  name_prefix          = local.name_prefix
  subnet_id            = module.networking.app_subnet_id
  min_replicas         = 3
  max_replicas         = 10
  cpu                  = "1.0"
  memory               = "2Gi"
  container_image      = var.api_container_image
  container_registry   = var.container_registry
  db_connection_string = module.database.connection_string
  storage_account_name = module.storage.account_name
  storage_account_key  = module.storage.account_key
  tags                 = local.common_tags

  depends_on = [module.networking, module.database, module.storage]
}

module "monitoring" {
  source = "../../modules/monitoring"

  resource_group_name   = azurerm_resource_group.main.name
  location              = azurerm_resource_group.main.location
  environment           = local.environment
  name_prefix           = local.name_prefix
  log_retention_days    = 90
  enable_alerts         = true
  alert_email           = var.alert_email
  api_app_id            = module.api.app_id
  db_server_name        = module.database.server_name
  storage_account_id    = module.storage.account_id
  tags                  = local.common_tags

  depends_on = [module.api, module.database, module.storage]
}

###############################################################################
# Outputs
###############################################################################

output "resource_group_name" {
  description = "Name of the production resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "ID of the production resource group"
  value       = azurerm_resource_group.main.id
}

output "vnet_id" {
  description = "ID of the virtual network"
  value       = module.networking.vnet_id
}

output "vnet_name" {
  description = "Name of the virtual network"
  value       = module.networking.vnet_name
}

output "app_subnet_id" {
  description = "ID of the application subnet"
  value       = module.networking.app_subnet_id
}

output "database_server_name" {
  description = "Name of the PostgreSQL flexible server"
  value       = module.database.server_name
}

output "database_server_fqdn" {
  description = "FQDN of the PostgreSQL flexible server"
  value       = module.database.server_fqdn
}

output "database_name" {
  description = "Name of the application database"
  value       = module.database.database_name
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = module.storage.account_name
}

output "storage_account_id" {
  description = "ID of the storage account"
  value       = module.storage.account_id
}

output "storage_primary_endpoint" {
  description = "Primary blob endpoint of the storage account"
  value       = module.storage.primary_blob_endpoint
}

output "api_app_name" {
  description = "Name of the Container App"
  value       = module.api.app_name
}

output "api_app_url" {
  description = "URL of the production API"
  value       = module.api.app_url
}

output "api_app_id" {
  description = "ID of the Container App"
  value       = module.api.app_id
}

output "log_analytics_workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = module.monitoring.workspace_id
}

output "application_insights_connection_string" {
  description = "Application Insights connection string"
  value       = module.monitoring.app_insights_connection_string
  sensitive   = true
}

output "application_insights_instrumentation_key" {
  description = "Application Insights instrumentation key"
  value       = module.monitoring.instrumentation_key
  sensitive   = true
}
