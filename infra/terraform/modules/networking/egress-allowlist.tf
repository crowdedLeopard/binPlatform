# Council Egress Allowlist
# Managed list of permitted outbound destinations for adapter workers
# One entry per council - makes updates auditable and traceable

locals {
  # Council egress destinations (domain names only)
  # Each adapter can only reach its designated council website
  council_egress_destinations = {
    basingstoke_deane = {
      domain      = "basingstoke.gov.uk"
      description = "Basingstoke and Deane Borough Council — adapter worker egress"
    }
    east_hampshire = {
      domain      = "easthants.gov.uk"
      description = "East Hampshire District Council — adapter worker egress"
    }
    eastleigh = {
      domain      = "my.eastleigh.gov.uk"
      description = "Eastleigh Borough Council — adapter worker egress"
    }
    fareham = {
      domain      = "fareham.gov.uk"
      description = "Fareham Borough Council — adapter worker egress"
    }
    gosport = {
      domain      = "gosport.gov.uk"
      description = "Gosport Borough Council — adapter worker egress"
    }
    hart = {
      domain      = "hart.gov.uk"
      description = "Hart District Council — adapter worker egress"
    }
    havant = {
      domain      = "havant.gov.uk"
      description = "Havant Borough Council — adapter worker egress"
    }
    new_forest = {
      domain      = "newforest.gov.uk"
      description = "New Forest District Council — adapter worker egress"
    }
    portsmouth = {
      domain      = "portsmouth.gov.uk"
      description = "Portsmouth City Council — adapter worker egress"
    }
    rushmoor = {
      domain      = "rushmoor.gov.uk"
      description = "Rushmoor Borough Council — adapter worker egress"
    }
    southampton = {
      domain      = "southampton.gov.uk"
      description = "Southampton City Council — adapter worker egress"
    }
    test_valley = {
      domain      = "testvalley.gov.uk"
      description = "Test Valley Borough Council — adapter worker egress"
    }
    winchester = {
      domain      = "winchester.gov.uk"
      description = "Winchester City Council — adapter worker egress"
    }
    # Third-party service providers (conditional)
    winchester_fcc = {
      domain      = "fccenvironment.co.uk"
      description = "Winchester City Council — FCC Environment third-party delegate — adapter worker egress (conditional, Winchester may route through this provider)"
    }
  }

  # Flatten for NSG rule generation
  council_domains = [for k, v in local.council_egress_destinations : v.domain]
}

# Generate NSG rules for council egress (HTTPS only)
# Note: Azure NSG doesn't support domain-based filtering natively
# For domain-based filtering, use Azure Firewall or Application Gateway with WAF

# Alternative approach: Use Azure Firewall with FQDN filtering
# This is a placeholder - actual implementation depends on Azure Firewall deployment
resource "azurerm_firewall_application_rule_collection" "council_egress" {
  count = var.use_azure_firewall ? 1 : 0

  name                = "council-egress-allowlist"
  azure_firewall_name = var.firewall_name
  resource_group_name = var.resource_group_name
  priority            = 100
  action              = "Allow"

  dynamic "rule" {
    for_each = local.council_egress_destinations
    content {
      name = "allow-${rule.key}"
      
      source_addresses = [
        var.worker_subnet_prefix
      ]

      target_fqdns = [
        rule.value.domain,
        "*.${rule.value.domain}"  # Allow subdomains
      ]

      protocol {
        port = "443"
        type = "Https"
      }
    }
  }
}

# If NOT using Azure Firewall, document that domain-based filtering is not enforced at NSG level
# NSG can only filter by IP/port, not domain
# Options:
# 1. Use Azure Firewall (recommended for production)
# 2. Use proxy server with domain allowlist
# 3. Accept IP-based filtering (requires manual IP resolution per council)

output "council_domains" {
  description = "List of permitted council domains for egress"
  value       = local.council_domains
}

output "egress_policy" {
  description = "Egress policy summary"
  value = {
    approach       = var.use_azure_firewall ? "Azure Firewall with FQDN filtering" : "NSG IP-based filtering (manual IP management required)"
    council_count  = length(local.council_egress_destinations)
    permitted_domains = local.council_domains
  }
}
