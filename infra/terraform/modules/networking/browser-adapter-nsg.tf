# Browser Adapter Network Security Group
# Separate, more restrictive NSG for browser-based (Playwright) adapters
# Higher risk profile than API adapters - requires tighter security controls

resource "azurerm_network_security_group" "browser_adapter" {
  name                = "${var.environment}-browser-adapter-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = merge(
    var.tags,
    {
      Purpose = "Browser adapter worker isolation"
      RiskLevel = "High"
    }
  )
}

# Deny all inbound traffic by default
resource "azurerm_network_security_rule" "browser_deny_inbound_all" {
  name                        = "DenyAllInbound"
  priority                    = 4096
  direction                   = "Inbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.browser_adapter.name
}

# Allow HTTPS to council domains only (requires Azure Firewall for FQDN filtering)
# NSG alone cannot enforce domain-based filtering - this is IP-based placeholder
resource "azurerm_network_security_rule" "browser_allow_https_councils" {
  name                        = "AllowHTTPSToCouncils"
  priority                    = 100
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "443"
  source_address_prefix       = var.browser_worker_subnet_prefix
  destination_address_prefix  = "Internet"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.browser_adapter.name
  
  description = "Allow HTTPS to council websites (domain filtering enforced at Azure Firewall level)"
}

# Explicitly block cloud metadata endpoint
resource "azurerm_network_security_rule" "browser_deny_metadata" {
  name                        = "DenyCloudMetadata"
  priority                    = 200
  direction                   = "Outbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = var.browser_worker_subnet_prefix
  destination_address_prefix  = "169.254.169.254/32"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.browser_adapter.name
  
  description = "Block access to cloud metadata endpoint (defense in depth)"
}

# Allow internal monitoring/logging endpoints
resource "azurerm_network_security_rule" "browser_allow_monitoring" {
  name                        = "AllowMonitoring"
  priority                    = 150
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_ranges     = ["443", "8086"]  # HTTPS + InfluxDB/Azure Monitor
  source_address_prefix       = var.browser_worker_subnet_prefix
  destination_address_prefix  = var.monitoring_subnet_prefix
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.browser_adapter.name
  
  description = "Allow telemetry to monitoring subnet (Azure Monitor, App Insights)"
}

# Deny all other outbound traffic
resource "azurerm_network_security_rule" "browser_deny_outbound_all" {
  name                        = "DenyAllOtherOutbound"
  priority                    = 4096
  direction                   = "Outbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "*"
  destination_address_prefix  = "*"
  resource_group_name         = var.resource_group_name
  network_security_group_name = azurerm_network_security_group.browser_adapter.name
  
  description = "Deny all other outbound traffic (allowlist model)"
}

# NSG Flow Logs - Log all denied connections to Azure Monitor
resource "azurerm_network_watcher_flow_log" "browser_adapter" {
  count = var.enable_flow_logs ? 1 : 0

  name                      = "${var.environment}-browser-adapter-flow-log"
  network_watcher_name      = var.network_watcher_name
  resource_group_name       = var.network_watcher_resource_group
  network_security_group_id = azurerm_network_security_group.browser_adapter.id
  storage_account_id        = var.flow_log_storage_account_id
  enabled                   = true
  version                   = 2

  retention_policy {
    enabled = true
    days    = var.flow_log_retention_days
  }

  traffic_analytics {
    enabled               = true
    workspace_id          = var.log_analytics_workspace_id
    workspace_region      = var.location
    workspace_resource_id = var.log_analytics_workspace_resource_id
    interval_in_minutes   = 10
  }

  tags = var.tags
}

# Associate NSG with browser adapter subnet
resource "azurerm_subnet_network_security_group_association" "browser_adapter" {
  subnet_id                 = var.browser_worker_subnet_id
  network_security_group_id = azurerm_network_security_group.browser_adapter.id
}

# Alert on high rate of denied connections (potential security incident)
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "browser_adapter_denied_connections" {
  count = var.enable_flow_logs ? 1 : 0

  name                = "${var.environment}-browser-adapter-denied-connections"
  resource_group_name = var.resource_group_name
  location            = var.location
  
  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"
  scopes               = [var.log_analytics_workspace_resource_id]
  severity             = 2  # Warning
  
  criteria {
    query = <<-QUERY
      AzureNetworkAnalytics_CL
      | where SubType_s == "FlowLog"
      | where NSGList_s contains "${azurerm_network_security_group.browser_adapter.name}"
      | where FlowStatus_s == "D"  // Denied
      | summarize DeniedCount = count() by DestIP = DestIP_s
      | where DeniedCount > 50
      | project DestIP, DeniedCount
    QUERY
    
    time_aggregation_method = "Count"
    threshold               = 1
    operator                = "GreaterThan"
    
    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  auto_mitigation_enabled = false
  description             = "High rate of denied connections from browser adapters (potential compromise or misconfiguration)"
  
  action {
    action_groups = [var.security_alert_action_group_id]
  }

  tags = var.tags
}

output "browser_adapter_nsg_id" {
  description = "Browser adapter network security group ID"
  value       = azurerm_network_security_group.browser_adapter.id
}

output "browser_adapter_nsg_name" {
  description = "Browser adapter network security group name"
  value       = azurerm_network_security_group.browser_adapter.name
}
