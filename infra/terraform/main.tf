# Terraform Configuration for Hampshire Bin Platform

terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.80"
    }
  }

  # TODO: Configure remote state backend (Azure Storage Account)
  # backend "azurerm" {
  #   resource_group_name  = "terraform-state-rg"
  #   storage_account_name = "tfstate${var.environment}"
  #   container_name       = "tfstate"
  #   key                  = "hampshire-bin-platform.tfstate"
  # }
}

provider "azurerm" {
  features {
    resource_group {
      prevent_deletion_if_contains_resources = true
    }
    key_vault {
      purge_soft_delete_on_destroy = false
    }
  }
}

# Resource Group
resource "azurerm_resource_group" "main" {
  name     = "rg-binday-${var.environment}-${var.location_short}"
  location = var.location

  tags = local.common_tags
}

# TODO: Add modules
# module "networking" {
#   source = "./modules/networking"
#   ...
# }

# module "database" {
#   source = "./modules/database"
#   ...
# }

# module "storage" {
#   source = "./modules/storage"
#   ...
# }

# module "api" {
#   source = "./modules/api"
#   ...
# }

locals {
  common_tags = {
    project     = "hampshire-bin-platform"
    environment = var.environment
    managed_by  = "terraform"
    cost_center = var.cost_center
  }
}
