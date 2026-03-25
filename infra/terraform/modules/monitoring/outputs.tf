output "workspace_id" {
  description = "ID of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.id
}

output "workspace_name" {
  description = "Name of the Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.name
}

output "workspace_customer_id" {
  description = "Workspace ID (customer ID) for Log Analytics"
  value       = azurerm_log_analytics_workspace.main.workspace_id
}

output "workspace_primary_key" {
  description = "Primary shared key for Log Analytics workspace"
  value       = azurerm_log_analytics_workspace.main.primary_shared_key
  sensitive   = true
}

output "api_instrumentation_key" {
  description = "Application Insights instrumentation key for API"
  value       = azurerm_application_insights.api.instrumentation_key
  sensitive   = true
}

output "api_connection_string" {
  description = "Application Insights connection string for API"
  value       = azurerm_application_insights.api.connection_string
  sensitive   = true
}

output "worker_instrumentation_key" {
  description = "Application Insights instrumentation key for Worker"
  value       = azurerm_application_insights.worker.instrumentation_key
  sensitive   = true
}

output "worker_connection_string" {
  description = "Application Insights connection string for Worker"
  value       = azurerm_application_insights.worker.connection_string
  sensitive   = true
}

output "action_group_id" {
  description = "ID of the alert action group"
  value       = azurerm_monitor_action_group.ops.id
}
