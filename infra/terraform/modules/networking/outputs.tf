output "api_nsg_id" {
  description = "Network Security Group ID for API service"
  value       = azurerm_network_security_group.api.id
}

output "adapter_worker_nsg_id" {
  description = "Network Security Group ID for adapter workers"
  value       = azurerm_network_security_group.adapter_worker.id
}

output "database_nsg_id" {
  description = "Network Security Group ID for database"
  value       = azurerm_network_security_group.database.id
}

output "redis_nsg_id" {
  description = "Network Security Group ID for Redis cache"
  value       = azurerm_network_security_group.redis.id
}

output "admin_nsg_id" {
  description = "Network Security Group ID for admin service"
  value       = azurerm_network_security_group.admin.id
}

output "network_policy_summary" {
  description = "Summary of network security policy enforcement"
  value = {
    api_service = {
      inbound  = "HTTPS from load balancer only"
      outbound = "Database, Redis, Key Vault, Monitoring ONLY - NO INTERNET"
    }
    adapter_workers = {
      inbound  = "Internal queue/API only"
      outbound = "Council URLs (allowlist), Database, Redis, Blob Storage - NO GENERAL INTERNET"
    }
    database = {
      inbound  = "API and Worker subnets only on port 5432"
      outbound = "DENIED - NO OUTBOUND ACCESS"
    }
    redis = {
      inbound  = "API and Worker subnets only on port 6379"
      outbound = "DENIED - NO OUTBOUND ACCESS"
    }
    admin_service = {
      inbound  = "VPN/Bastion only - NO PUBLIC ACCESS"
      outbound = "Database, Redis, SSO provider ONLY"
    }
  }
}
