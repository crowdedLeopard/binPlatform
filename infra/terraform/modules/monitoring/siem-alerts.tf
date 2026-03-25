# Hampshire Bin Platform - SIEM Alert Rules
# Azure Monitor Scheduled Query Rules for Security Event Correlation

# =====================================================================
# ALERT: Repeated Authentication Failures
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "auth_failures" {
  name                = "${var.project_name}-repeated-auth-failures-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when >10 authentication failures occur from the same IP in 5 minutes"
  severity            = 2 # Warning
  enabled             = true

  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType == "auth.failure"
      | summarize FailureCount = count() by bin(TimeGenerated, 5m), SourceIp
      | where FailureCount > 10
    QUERY

    time_aggregation_method = "Count"
    threshold               = 10
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

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Warning"
  })
}

# =====================================================================
# ALERT: SQL Injection Attempts
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "injection_attempts" {
  name                = "${var.project_name}-injection-attempts-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert on ANY SQL injection, XSS, or code injection attempt"
  severity            = 1 # Error - immediate alert
  enabled             = true

  evaluation_frequency = "PT1M"
  window_duration      = "PT5M"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType == "security.injection_attempt"
      | summarize InjectionAttempts = count() by bin(TimeGenerated, 5m), SourceIp, tostring(Metadata)
    QUERY

    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }

  auto_mitigation_enabled = false # Never auto-resolve injection attempts

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Error"
  })
}

# =====================================================================
# ALERT: Audit Tamper Detection
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "audit_tamper" {
  name                = "${var.project_name}-audit-tamper-detected-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "CRITICAL: Audit log tampering detected (HMAC validation failure or sequence gap)"
  severity            = 0 # Critical - page on-call immediately
  enabled             = true

  evaluation_frequency = "PT1M"
  window_duration      = "PT5M"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType contains "audit" and EventType contains "tamper"
      | summarize TamperAttempts = count() by bin(TimeGenerated, 5m)
    QUERY

    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }

  auto_mitigation_enabled = false # Never auto-resolve tampering

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Critical"
  })
}

# =====================================================================
# ALERT: Enumeration Attack Pattern
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "enumeration_attack" {
  name                = "${var.project_name}-enumeration-attack-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when >3 enumeration hard blocks occur in 1 hour (coordinated attack pattern)"
  severity            = 1 # Error
  enabled             = true

  evaluation_frequency = "PT15M"
  window_duration      = "PT1H"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType == "abuse.enumeration_detected"
      | where Outcome == "blocked"
      | summarize HardBlocks = count() by bin(TimeGenerated, 1h), SourceIp
      | where HardBlocks > 3
    QUERY

    time_aggregation_method = "Count"
    threshold               = 3
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

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Error"
  })
}

# =====================================================================
# ALERT: Adapter Kill Switch Activated
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "adapter_kill_switch" {
  name                = "${var.project_name}-adapter-kill-switch-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when an adapter is disabled via kill switch"
  severity            = 1 # Error
  enabled             = true

  evaluation_frequency = "PT5M"
  window_duration      = "PT5M"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType == "admin.adapter.disable"
      | where Severity == "critical"
      | summarize DisableEvents = count() by bin(TimeGenerated, 5m), CouncilId, ActorId
    QUERY

    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }

  auto_mitigation_enabled = false

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Error"
  })
}

# =====================================================================
# ALERT: Data Retention Failures
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "retention_failure" {
  name                = "${var.project_name}-retention-failure-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when data retention purge failures exceed threshold"
  severity            = 0 # Critical
  enabled             = true

  evaluation_frequency = "PT1H"
  window_duration      = "PT6H"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType == "retention.failure"
      | summarize FailureCount = count() by bin(TimeGenerated, 6h)
      | where FailureCount > 0
    QUERY

    time_aggregation_method = "Count"
    threshold               = 0
    operator                = "GreaterThan"

    failing_periods {
      minimum_failing_periods_to_trigger_alert = 1
      number_of_evaluation_periods             = 1
    }
  }

  action {
    action_groups = [azurerm_monitor_action_group.ops.id]
  }

  auto_mitigation_enabled = false

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Critical"
  })
}

# =====================================================================
# ALERT: High-Severity Security Events Spike
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "security_event_spike" {
  name                = "${var.project_name}-security-event-spike-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when critical/warning security events spike (>20 in 10 min)"
  severity            = 2 # Warning
  enabled             = true

  evaluation_frequency = "PT10M"
  window_duration      = "PT10M"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where Severity in ("critical", "warning")
      | summarize EventCount = count() by bin(TimeGenerated, 10m)
      | where EventCount > 20
    QUERY

    time_aggregation_method = "Count"
    threshold               = 20
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

  tags = merge(var.tags, {
    AlertType = "Security"
    Severity  = "Warning"
  })
}

# =====================================================================
# ALERT: Incident Auto-Creation Rate
# =====================================================================

resource "azurerm_monitor_scheduled_query_rules_alert_v2" "incident_creation_rate" {
  name                = "${var.project_name}-incident-creation-rate-${var.environment}"
  location            = var.location
  resource_group_name = var.resource_group_name
  scopes              = [azurerm_log_analytics_workspace.main.id]
  description         = "Alert when incident auto-creation rate is abnormally high (>5 in 1 hour)"
  severity            = 2 # Warning
  enabled             = true

  evaluation_frequency = "PT1H"
  window_duration      = "PT1H"

  criteria {
    query = <<-QUERY
      BinPlatformSecurityEvents
      | where EventType == "incident.created"
      | summarize IncidentCount = count() by bin(TimeGenerated, 1h)
      | where IncidentCount > 5
    QUERY

    time_aggregation_method = "Count"
    threshold               = 5
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

  tags = merge(var.tags, {
    AlertType = "Operational"
    Severity  = "Warning"
  })
}

# =====================================================================
# OUTPUTS
# =====================================================================

output "siem_alert_ids" {
  description = "IDs of all SIEM alert rules"
  value = {
    auth_failures       = azurerm_monitor_scheduled_query_rules_alert_v2.auth_failures.id
    injection_attempts  = azurerm_monitor_scheduled_query_rules_alert_v2.injection_attempts.id
    audit_tamper        = azurerm_monitor_scheduled_query_rules_alert_v2.audit_tamper.id
    enumeration_attack  = azurerm_monitor_scheduled_query_rules_alert_v2.enumeration_attack.id
    adapter_kill_switch = azurerm_monitor_scheduled_query_rules_alert_v2.adapter_kill_switch.id
    retention_failure   = azurerm_monitor_scheduled_query_rules_alert_v2.retention_failure.id
    security_spike      = azurerm_monitor_scheduled_query_rules_alert_v2.security_event_spike.id
    incident_rate       = azurerm_monitor_scheduled_query_rules_alert_v2.incident_creation_rate.id
  }
}
