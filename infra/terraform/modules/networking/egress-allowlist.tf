# Council Egress Allowlist
# Managed list of permitted outbound destinations for adapter workers
# One entry per council - makes updates auditable and traceable

locals {
  # Council egress destinations (domain names only)
  # Each adapter can only reach its designated council website
  council_egress_destinations = {
    basingstoke_deane = {
      domain      = "basingstoke.gov.uk"
      description = "Basingstoke and Deane Borough Council"
    }
    east_hampshire = {
      domain      = "easthants.gov.uk"
      description = "East Hampshire District Council"
    }
    eastleigh = {
      domain      = "my.eastleigh.gov.uk"
      description = "Eastleigh Borough Council - MyEastleigh portal"
    }
    fareham = {
      domain      = "fareham.gov.uk"
      description = "Fareham Borough Council"
    }
    gosport = {
      domain      = "gosport.gov.uk"
      description = "Gosport Borough Council"
    }
    hart = {
      domain      = "hart.gov.uk"
      description = "Hart District Council"
    }
    havant = {
      domain      = "havant.gov.uk"
      description = "Havant Borough Council"
    }
    new_forest = {
      domain      = "newforest.gov.uk"
      description = "New Forest District Council"
    }
    portsmouth = {
      domain      = "portsmouth.gov.uk"
      description = "Portsmouth City Council"
    }
    rushmoor = {
      domain      = "rushmoor.gov.uk"
      description = "Rushmoor Borough Council"
    }
    southampton = {
      domain      = "southampton.gov.uk"
      description = "Southampton City Council"
    }
    test_valley = {
      domain      = "testvalley.gov.uk"
      description = "Test Valley Borough Council"
    }
    winchester = {
      domain      = "winchester.gov.uk"
      description = "Winchester City Council"
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
