terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

# Container App Environment
resource "azurerm_container_app_environment" "main" {
  name                       = "cae-binplatform-${var.environment}"
  location                   = var.location
  resource_group_name        = var.resource_group_name
  log_analytics_workspace_id = var.log_analytics_workspace_id
  
  tags = {
    environment = var.environment
    project     = "binplatform"
  }
}

# API Container App
resource "azurerm_container_app" "api" {
  name                         = "ca-binplatform-api-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "api"
      image  = "${var.acr_login_server}/binplatform-api:${var.image_tag}"
      cpu    = var.environment == "production" ? 1.0 : 0.5
      memory = var.environment == "production" ? "2Gi" : "1Gi"

      # Environment variables from Key Vault
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Kill switch env vars (non-secret)
      dynamic "env" {
        for_each = var.kill_switches
        content {
          name  = "ADAPTER_KILL_SWITCH_${upper(replace(env.key, "_", ""))}"
          value = tostring(env.value)
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = "3000"
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    
    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.acr_pull.id
  }

  tags = {
    environment = var.environment
    project     = "binplatform"
  }
}

# Worker Container App (for background jobs)
resource "azurerm_container_app" "worker" {
  name                         = "ca-binplatform-worker-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    min_replicas = 1
    max_replicas = var.environment == "production" ? 5 : 2

    container {
      name   = "worker"
      image  = "${var.acr_login_server}/binplatform-monitor:${var.image_tag}"
      cpu    = 1.0
      memory = "2Gi"

      # Environment variables from Key Vault
      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Kill switch env vars
      dynamic "env" {
        for_each = var.kill_switches
        content {
          name  = "ADAPTER_KILL_SWITCH_${upper(replace(env.key, "_", ""))}"
          value = tostring(env.value)
        }
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
    }
  }

  identity {
    type = "SystemAssigned"
  }

  registry {
    server   = var.acr_login_server
    identity = azurerm_user_assigned_identity.acr_pull.id
  }

  tags = {
    environment = var.environment
    project     = "binplatform"
  }
}

# Managed Identity for ACR Pull
resource "azurerm_user_assigned_identity" "acr_pull" {
  name                = "id-binplatform-acrpull-${var.environment}"
  resource_group_name = var.resource_group_name
  location            = var.location

  tags = {
    environment = var.environment
    project     = "binplatform"
  }
}

# Grant Container Apps pull access to ACR
resource "azurerm_role_assignment" "acr_pull" {
  scope                = var.acr_id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.acr_pull.principal_id
}

# Grant API system identity access to Key Vault
resource "azurerm_role_assignment" "api_keyvault" {
  scope                = var.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_container_app.api.identity[0].principal_id
}

# Grant Worker system identity access to Key Vault
resource "azurerm_role_assignment" "worker_keyvault" {
  scope                = var.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_container_app.worker.identity[0].principal_id
}
