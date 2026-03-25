# Networking Module — Network Security Groups and Egress Policy

This Terraform module implements the deny-by-default network security posture defined in `docs/threat-model/network-policy.md`.

## Overview

Implements Network Security Groups (NSGs) for:
- **API Service** — No internet egress, internal services only
- **Adapter Workers** — Council URL allowlist for egress
- **Database (PostgreSQL)** — No outbound access
- **Cache (Redis)** — No outbound access
- **Admin Service** — VPN/Bastion access only

## Security Principle

**Deny by Default:** All traffic is blocked unless explicitly allowed.

## Usage

```hcl
module "networking" {
  source = "./modules/networking"

  prefix              = "hampshire-bin-prod"
  location            = "uksouth"
  resource_group_name = azurerm_resource_group.main.name

  # Subnet IDs
  api_subnet_id      = azurerm_subnet.api.id
  worker_subnet_id   = azurerm_subnet.worker.id
  database_subnet_id = azurerm_subnet.database.id
  cache_subnet_id    = azurerm_subnet.cache.id
  admin_subnet_id    = azurerm_subnet.admin.id

  # Subnet CIDR prefixes
  api_subnet_prefix      = "10.0.1.0/24"
  worker_subnet_prefix   = "10.0.2.0/24"
  database_subnet_prefix = "10.0.3.0/24"
  cache_subnet_prefix    = "10.0.4.0/24"
  admin_subnet_prefix    = "10.0.5.0/24"
  vpn_subnet_prefix      = "10.0.255.0/24"

  # Optional: Azure Firewall for domain-based egress filtering
  use_azure_firewall = true
  firewall_name      = "hampshire-bin-prod-fw"

  tags = {
    Environment = "production"
    Owner       = "Drummer"
    ManagedBy   = "Terraform"
  }
}
```

## Network Security Group Rules

### API Service NSG

**Inbound:**
- ✅ HTTPS (443) from Azure Load Balancer
- ✅ Health probes (3000) from Azure Load Balancer
- ❌ All other inbound DENIED

**Outbound:**
- ✅ PostgreSQL (5432) to database subnet
- ✅ Redis (6379) to cache subnet
- ✅ HTTPS (443) to Azure Key Vault service tag
- ✅ HTTPS (443) to Azure Monitor service tag
- ❌ Internet access DENIED

### Adapter Worker NSG

**Inbound:**
- ✅ All traffic from API subnet
- ❌ All other inbound DENIED

**Outbound:**
- ✅ PostgreSQL (5432) to database subnet
- ✅ Redis (6379) to cache subnet
- ✅ HTTPS (443) to Azure Blob Storage service tag
- ✅ HTTPS (443) to council URLs (via Azure Firewall allowlist)
- ❌ Cloud metadata (169.254.169.254) EXPLICITLY DENIED
- ❌ All other outbound DENIED

### Database NSG

**Inbound:**
- ✅ PostgreSQL (5432) from API subnet
- ✅ PostgreSQL (5432) from worker subnet
- ❌ All other inbound DENIED

**Outbound:**
- ❌ ALL outbound traffic DENIED (no internet access)

### Redis Cache NSG

**Inbound:**
- ✅ Redis (6379) from API subnet
- ✅ Redis (6379) from worker subnet
- ❌ All other inbound DENIED

**Outbound:**
- ❌ ALL outbound traffic DENIED (no internet access)

### Admin Service NSG

**Inbound:**
- ✅ HTTPS (443) from VPN/Bastion subnet ONLY
- ❌ Public internet access DENIED

**Outbound:**
- ✅ PostgreSQL (5432) to database subnet
- ✅ Redis (6379) to cache subnet
- ✅ HTTPS (443) to Azure Active Directory service tag (SSO)
- ❌ All other outbound DENIED

## Council Egress Allowlist

Managed in `egress-allowlist.tf`:

```hcl
locals {
  council_egress_destinations = {
    eastleigh = {
      domain      = "my.eastleigh.gov.uk"
      description = "Eastleigh Borough Council - MyEastleigh portal"
    }
    rushmoor = {
      domain      = "rushmoor.gov.uk"
      description = "Rushmoor Borough Council"
    }
    # ... 11 more councils
  }
}
```

**Adding a new council:**

1. Add entry to `council_egress_destinations` map
2. Run `terraform plan` to see firewall rule addition
3. Apply changes
4. Verify adapter can reach new council URL
5. Commit changes to git (auditability)

## Azure Firewall vs. NSG-Only

### Option 1: Azure Firewall (Recommended for Production)

**Pros:**
- Domain-based filtering (blocks adapters from reaching arbitrary IPs)
- Centralized logging of all egress traffic
- Application-aware rules (HTTP/HTTPS inspection)
- No manual IP management when councils change hosting

**Cons:**
- Additional cost (~$900/month for Firewall + data processing)
- Slightly increased latency (~5-10ms per request)

**Implementation:**
Set `use_azure_firewall = true` in module call.

### Option 2: NSG IP-Based Filtering (Not Recommended)

**Pros:**
- No additional cost
- Lower latency

**Cons:**
- Does NOT enforce domain allowlist (NSGs filter by IP/port only)
- Manual IP resolution required for each council
- Brittle (breaks when councils change hosting/CDN)
- No audit logs for egress destinations

**Implementation:**
Set `use_azure_firewall = false` in module call. You will need to manually manage IP allowlists.

## Outputs

```hcl
output "api_nsg_id" {
  description = "Network Security Group ID for API service"
  value       = module.networking.api_nsg_id
}

output "network_policy_summary" {
  description = "Summary of network security policy enforcement"
  value       = module.networking.network_policy_summary
}

output "council_domains" {
  description = "List of permitted council domains for egress"
  value       = module.networking.council_domains
}
```

## Testing

### Verify API Service Cannot Reach Internet

```bash
# From API container
curl -I https://example.com
# Expected: Connection timeout or denied
```

### Verify Adapter Can Reach Council URL

```bash
# From worker container
curl -I https://my.eastleigh.gov.uk
# Expected: 200 OK or appropriate response
```

### Verify Database Has No Outbound Access

```bash
# From database container (if shell access available)
curl -I https://example.com
# Expected: Connection refused or command not found
```

### Verify Cloud Metadata Endpoint is Blocked

```bash
# From worker container
curl -I http://169.254.169.254/metadata/instance
# Expected: Connection refused or timeout
```

## Compliance

This module implements:
- **SD-04: Egress Deny-by-Default** (Security Decision)
- **SD-03: Adapter Isolation Architecture** (Security Decision)
- **Network Policy Document** (`docs/threat-model/network-policy.md`)

## Maintenance

**Review Frequency:** Quarterly  
**Owner:** Drummer (Infrastructure Engineer)  
**Next Review:** 2026-06-25  

### When to Update

1. New council added to platform (add to egress allowlist)
2. Council changes domain/hosting (update allowlist)
3. New internal service requires network access (add NSG rule)
4. Security posture changes (review all rules)

## Troubleshooting

### Adapter Cannot Reach Council Website

**Check:**
1. Council domain in `egress-allowlist.tf`?
2. Azure Firewall deployed and rules applied?
3. Firewall logs show blocked request?

**Fix:**
1. Add domain to allowlist
2. Run `terraform apply`
3. Wait 1-2 minutes for rule propagation
4. Retry adapter

### API Service Cannot Reach Database

**Check:**
1. Database NSG allows inbound from API subnet?
2. API subnet CIDR matches variable?
3. NSG association applied to correct subnet?

**Fix:**
1. Verify subnet CIDR in `terraform.tfvars`
2. Check NSG rule priority (lower = higher priority)
3. Review NSG flow logs (if enabled)

## References

- [Network Policy Document](./../../docs/threat-model/network-policy.md)
- [SD-04: Egress Deny-by-Default](./../../.squad/decisions.md#sd-04-egress-deny-by-default)
- [Azure NSG Documentation](https://learn.microsoft.com/en-us/azure/virtual-network/network-security-groups-overview)
- [Azure Firewall FQDN Filtering](https://learn.microsoft.com/en-us/azure/firewall/fqdn-filtering-network-rules)
