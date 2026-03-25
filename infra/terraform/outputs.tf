output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_location" {
  description = "Location of the resource group"
  value       = azurerm_resource_group.main.location
}

# TODO: Add outputs for:
# - Database connection string (sensitive)
# - Redis connection string (sensitive)
# - Storage account name
# - Storage container name
# - API endpoint URL
# - Application Insights instrumentation key (sensitive)
