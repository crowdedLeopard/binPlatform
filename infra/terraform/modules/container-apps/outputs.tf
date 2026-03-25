output "api_url" {
  description = "Public API URL"
  value       = "https://${azurerm_container_app.api.ingress[0].fqdn}"
}

output "api_fqdn" {
  description = "API fully qualified domain name"
  value       = azurerm_container_app.api.ingress[0].fqdn
}

output "api_principal_id" {
  description = "API system-assigned managed identity principal ID"
  value       = azurerm_container_app.api.identity[0].principal_id
}

output "worker_principal_id" {
  description = "Worker system-assigned managed identity principal ID"
  value       = azurerm_container_app.worker.identity[0].principal_id
}

output "container_app_environment_id" {
  description = "Container App Environment ID"
  value       = azurerm_container_app_environment.main.id
}

output "container_app_environment_default_domain" {
  description = "Container App Environment default domain"
  value       = azurerm_container_app_environment.main.default_domain
}
