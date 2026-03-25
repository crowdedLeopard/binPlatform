output "api_url" {
  description = "Public API URL"
  value       = module.container_apps.api_url
}

output "resource_group" {
  description = "Resource group name"
  value       = data.azurerm_resource_group.main.name
}

output "database_server" {
  description = "PostgreSQL server FQDN"
  value       = azurerm_postgresql_flexible_server.main.fqdn
}

output "database_url" {
  description = "PostgreSQL connection string"
  value       = "postgresql://${azurerm_postgresql_flexible_server.main.administrator_login}:${random_password.postgres.result}@${azurerm_postgresql_flexible_server.main.fqdn}:5432/${azurerm_postgresql_flexible_server_database.main.name}?sslmode=require"
  sensitive   = true
}

output "redis_hostname" {
  description = "Redis hostname"
  value       = azurerm_redis_cache.main.hostname
}

output "storage_account" {
  description = "Evidence storage account name"
  value       = azurerm_storage_account.evidence.name
}

output "key_vault_uri" {
  description = "Key Vault URI"
  value       = data.azurerm_key_vault.main.vault_uri
}

output "log_analytics_workspace_id" {
  description = "Log Analytics Workspace ID"
  value       = azurerm_log_analytics_workspace.main.id
}
