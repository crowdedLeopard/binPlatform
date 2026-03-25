# Azure Monitor Workspace and Alerting for Hampshire Bin Platform
# Provides unified monitoring, alerting, and log analytics

# Azure Monitor Workspace (Log Analytics)
resource "azurerm_log_analytics_workspace" "main" {
  name                = "${var.project_name}-logs-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  sku                 = var.log_analytics_sku
  retention_in_days   = var.log_retention_days

  tags = merge(var.tags, {
    Component = "Monitoring"
  })
}

# Application Insights for API monitoring
resource "azurerm_application_insights" "api" {
  name                = "${var.project_name}-api-insights-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "web"

  tags = merge(var.tags, {
    Component = "API"
  })
}

# Application Insights for Worker monitoring
resource "azurerm_application_insights" "worker" {
  name                = "${var.project_name}-worker-insights-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  workspace_id        = azurerm_log_analytics_workspace.main.id
  application_type    = "other"

  tags = merge(var.tags, {
    Component = "Worker"
  })
}

# Action Group for alerts (email, SMS, webhook)
resource "azurerm_monitor_action_group" "ops" {
  name                = "${var.project_name}-ops-alerts-${var.environment}"
  resource_group_name = var.resource_group_name
  short_name          = "ops-alerts"

  # Email notifications
  dynamic "email_receiver" {
    for_each = var.alert_email_addresses
    content {
      name          = "email-${email_receiver.key}"
      email_address = email_receiver.value
    }
  }

  # Webhook notifications (Slack, Teams, etc.)
  dynamic "webhook_receiver" {
    for_each = var.alert_webhook_urls
    content {
      name        = "webhook-${webhook_receiver.key}"
      service_uri = webhook_receiver.value
    }
  }

  tags = var.tags
}

# =====================================================================
# METRIC ALERTS
# =====================================================================

# Alert: Adapter Unavailable (critical)
resource "azurerm_monitor_metric_alert" "adapter_unavailable" {
  name                = "${var.project_name}-adapter-unavailable-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.worker.id]
  description         = "Alert when an adapter health status indicates unavailability"
  severity            = 0 # Critical
  frequency           = "PT1M"
  window_size         = "PT5M"
  enabled             = true

  criteria {
    metric_namespace = "Azure.ApplicationInsights"
    metric_name      = "customMetrics/adapter_health_status"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 0.5 # Less than 0.5 = unavailable
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = var.tags
}

# Alert: Adapter Confidence Degraded (warning)
resource "azurerm_monitor_metric_alert" "adapter_confidence_degraded" {
  name                = "${var.project_name}-adapter-confidence-degraded-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.worker.id]
  description         = "Alert when adapter confidence score drops below 50%"
  severity            = 2 # Warning
  frequency           = "PT5M"
  window_size         = "PT15M"
  enabled             = true

  criteria {
    metric_namespace = "Azure.ApplicationInsights"
    metric_name      = "customMetrics/adapter_confidence_score"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 0.5
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = var.tags
}

# Alert: Breaking Schema Drift Detected (critical)
resource "azurerm_monitor_metric_alert" "breaking_drift" {
  name                = "${var.project_name}-breaking-drift-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.worker.id]
  description         = "Alert on breaking schema drift detection"
  severity            = 0 # Critical
  frequency           = "PT1M"
  window_size         = "PT1M"
  enabled             = true

  criteria {
    metric_namespace = "Azure.ApplicationInsights"
    metric_name      = "customMetrics/adapter_drift_breaking_total"
    aggregation      = "Total"
    operator         = "GreaterThan"
    threshold        = 0
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = var.tags
}

# Alert: High API Error Rate (warning)
resource "azurerm_monitor_metric_alert" "api_error_rate" {
  name                = "${var.project_name}-api-error-rate-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.api.id]
  description         = "Alert when API error rate exceeds threshold"
  severity            = 2 # Warning
  frequency           = "PT1M"
  window_size         = "PT5M"
  enabled             = true

  dynamic_criteria {
    metric_namespace  = "Azure.ApplicationInsights"
    metric_name       = "requests/failed"
    aggregation       = "Count"
    operator          = "GreaterThan"
    alert_sensitivity = "Medium"
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = var.tags
}

# Alert: Synthetic Check Failures (critical)
resource "azurerm_monitor_metric_alert" "synthetic_check_failure" {
  name                = "${var.project_name}-synthetic-check-failure-${var.environment}"
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_application_insights.worker.id]
  description         = "Alert when synthetic monitoring checks fail"
  severity            = 0 # Critical
  frequency           = "PT5M"
  window_size         = "PT10M"
  enabled             = true

  criteria {
    metric_namespace = "Azure.ApplicationInsights"
    metric_name      = "customMetrics/synthetic_check_success"
    aggregation      = "Average"
    operator         = "LessThan"
    threshold        = 0.5 # More than 50% failures
  }

  action {
    action_group_id = azurerm_monitor_action_group.ops.id
  }

  tags = var.tags
}

# =====================================================================
# LOG QUERY ALERTS
# =====================================================================

# Alert: High Abuse Rate
resource "azurerm_monitor_scheduled_query_rules_alert_v2" "high_abuse_rate" {
  name                = "${var.project_name}-high-abuse-rate-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when abuse prevention blocks exceed threshold"
  severity            = 2 # Warning
  enabled             = true

  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"

  criteria {
    query = <<-QUERY
      customMetrics
      | where name == "abuse_blocks_total"
      | summarize AbuseBlocks = sum(value) by bin(timestamp, 5m)
      | where AbuseBlocks > 50
    QUERY

    time_aggregation_method = "Total"
    threshold               = 50
    operator                = "GreaterThan"

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }

  auto_mitigation_enabled = true

  tags = var.tags
}

# =====================================================================
# DIAGNOSTIC SETTINGS
# =====================================================================

# Enable diagnostic logging for the workspace itself
resource "azurerm_monitor_diagnostic_setting" "workspace" {
  name                       = "logs-to-workspace"
  target_resource_id         = azurerm_log_analytics_workspace.main.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id

  enabled_log {
    category = "Audit"
  }

  metric {
    category = "AllMetrics"
    enabled  = true
  }
}
