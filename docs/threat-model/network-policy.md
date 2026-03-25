# Network Boundary and Egress Policy — Hampshire Bin Collection Data Platform

**Version:** 1.0  
**Author:** Amos (Security Engineer)  
**Date:** 2026-03-25  

---

## Overview

This document defines the network security posture for the Hampshire Bin Collection Data Platform. The core principle is **deny by default** — all traffic is blocked unless explicitly allowed.

---

## Network Architecture

```
                              ┌─────────────────────────────────┐
                              │         INTERNET                │
                              │                                 │
                              │  ┌───────────────────────────┐ │
                              │  │  Council Websites         │ │
                              │  │  (13 Hampshire councils)  │ │
                              │  └───────────────────────────┘ │
                              │                                 │
                              │  ┌───────────────────────────┐ │
                              │  │  API Clients              │ │
                              │  │  (public internet)        │ │
                              │  └───────────────────────────┘ │
                              └─────────────┬───────────────────┘
                                            │
                                            │ HTTPS (443)
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DMZ SUBNET                                      │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     CDN / WAF / Load Balancer                       │   │
│   │   - TLS termination                                                 │   │
│   │   - Rate limiting                                                   │   │
│   │   - WAF rules (OWASP Top 10)                                       │   │
│   │   - DDoS protection                                                 │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ HTTPS (internal)
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           APPLICATION SUBNET                                 │
│                                                                              │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│   │   API Service    │────▶│   Auth Layer     │     │  Admin Service   │   │
│   │   (public API)   │     │                  │     │  (internal only) │   │
│   └────────┬─────────┘     └──────────────────┘     └────────┬─────────┘   │
│            │                                                  │             │
│            │                                                  │             │
│   ┌────────┴─────────────────────────────────────────────────┴─────────┐   │
│   │                    Internal Service Mesh (mTLS)                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           ADAPTER SUBNET (ISOLATED)                          │
│                                                                              │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│   │  Adapter Pool    │     │  Adapter Pool    │     │  Browser Pool    │   │
│   │  (HTTP adapters) │     │  (XHR adapters)  │     │  (Playwright)    │   │
│   └────────┬─────────┘     └────────┬─────────┘     └────────┬─────────┘   │
│            │                        │                        │             │
│            └────────────────────────┴────────────────────────┘             │
│                                     │                                       │
│                        Egress via NAT Gateway                               │
│                        (Council URLs only)                                   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              DATA SUBNET                                     │
│                                                                              │
│   ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐   │
│   │    PostgreSQL    │     │      Redis       │     │  Blob Storage    │   │
│   │  (private only)  │     │  (private only)  │     │  (private only)  │   │
│   │                  │     │                  │     │                  │   │
│   │  NO INTERNET     │     │  NO INTERNET     │     │  NO INTERNET     │   │
│   └──────────────────┘     └──────────────────┘     └──────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Default Posture

**DENY ALL INBOUND**
- No inbound traffic allowed by default
- Exceptions explicitly defined per service

**DENY ALL OUTBOUND**
- No outbound traffic allowed by default
- Exceptions explicitly defined per service

---

## Inbound Traffic Rules

### DMZ Subnet (Internet-Facing)

| Source | Destination | Port | Protocol | Purpose | Allow |
|--------|-------------|------|----------|---------|-------|
| Any (Internet) | CDN/WAF | 443 | HTTPS | Public API access | ✅ |
| Any (Internet) | CDN/WAF | 80 | HTTP | Redirect to HTTPS | ✅ (redirect only) |
| Any (Internet) | * | * | * | Any other | ❌ |

### Application Subnet

| Source | Destination | Port | Protocol | Purpose | Allow |
|--------|-------------|------|----------|---------|-------|
| DMZ Subnet | API Service | 8080 | HTTPS | API traffic | ✅ |
| Internal VPN | Admin Service | 8443 | HTTPS | Admin access | ✅ |
| Application Subnet | Application Subnet | * | mTLS | Service mesh | ✅ |
| Internet | * | * | * | Any direct | ❌ |

### Adapter Subnet

| Source | Destination | Port | Protocol | Purpose | Allow |
|--------|-------------|------|----------|---------|-------|
| Application Subnet | Adapter Services | 8080 | HTTPS | Task dispatch | ✅ |
| Internet | * | * | * | Any direct | ❌ |

### Data Subnet

| Source | Destination | Port | Protocol | Purpose | Allow |
|--------|-------------|------|----------|---------|-------|
| Application Subnet | PostgreSQL | 5432 | TLS | Database | ✅ |
| Application Subnet | Redis | 6379 | TLS | Cache | ✅ |
| Application Subnet | Blob Storage | 443 | HTTPS | Evidence | ✅ |
| Adapter Subnet | Blob Storage | 443 | HTTPS | Evidence write | ✅ |
| Internet | * | * | * | Any | ❌ |

---

## Outbound Traffic Rules

### API Service

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| PostgreSQL (Data Subnet) | 5432 | TLS | Database queries | ✅ |
| Redis (Data Subnet) | 6379 | TLS | Cache operations | ✅ |
| Key Vault (Azure) | 443 | HTTPS | Secrets | ✅ |
| Monitoring (Azure Monitor) | 443 | HTTPS | Telemetry | ✅ |
| Internet | * | * | Any other | ❌ |

**The API Service has NO outbound internet access.**

### Admin Service

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| PostgreSQL (Data Subnet) | 5432 | TLS | Database | ✅ |
| Blob Storage (Data Subnet) | 443 | HTTPS | Evidence read | ✅ |
| Key Vault (Azure) | 443 | HTTPS | Secrets | ✅ |
| SSO Provider (Azure AD) | 443 | HTTPS | Authentication | ✅ |
| Monitoring (Azure Monitor) | 443 | HTTPS | Telemetry | ✅ |
| Internet | * | * | Any other | ❌ |

**The Admin Service has NO general internet access — only SSO provider.**

### Adapter Workers (HTTP/XHR)

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| Council URLs (see allowlist) | 443 | HTTPS | Scraping | ✅ |
| Council URLs (see allowlist) | 80 | HTTP | Scraping (some) | ✅ (with redirect) |
| Blob Storage (Data Subnet) | 443 | HTTPS | Evidence write | ✅ |
| Internal API (App Subnet) | 8080 | HTTPS | Result submission | ✅ |
| Key Vault (Azure) | 443 | HTTPS | Secrets | ✅ |
| Monitoring (Azure Monitor) | 443 | HTTPS | Telemetry | ✅ |
| Any other Internet | * | * | Any | ❌ |

### Browser Automation (Playwright)

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| Council URLs (see allowlist) | 443 | HTTPS | Browser navigation | ✅ |
| Council URLs (see allowlist) | 80 | HTTP | Browser navigation | ✅ |
| Internal API (App Subnet) | 8080 | HTTPS | Result submission | ✅ |
| Blob Storage (Data Subnet) | 443 | HTTPS | Evidence write | ✅ |
| Any other Internet | * | * | Any | ❌ |

**Browser automation has STRICT egress — council URLs only, nothing else.**

### Database (PostgreSQL)

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| * | * | * | Any outbound | ❌ |

**Database has NO outbound access.**

### Redis

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| * | * | * | Any outbound | ❌ |

**Redis has NO outbound access.**

### Blob Storage

| Destination | Port | Protocol | Purpose | Allow |
|-------------|------|----------|---------|-------|
| * | * | * | Any outbound | ❌ |

**Blob Storage has NO outbound access (Azure managed service).**

---

## Per-Adapter Egress Allowlist

Each adapter is permitted to reach ONLY its designated council URL. This is enforced at the network layer.

### Allowlist Template

```yaml
# Adapter Egress Allowlist Configuration
# Each adapter can ONLY reach its designated council domains

adapters:
  - id: basingstoke-deane
    name: "Basingstoke and Deane Borough Council"
    allowed_domains:
      - "www.basingstoke.gov.uk"
      - "basingstoke.gov.uk"
    allowed_ports: [80, 443]
    
  - id: east-hampshire
    name: "East Hampshire District Council"
    allowed_domains:
      - "www.easthants.gov.uk"
      - "easthants.gov.uk"
    allowed_ports: [80, 443]
    
  - id: eastleigh
    name: "Eastleigh Borough Council"
    allowed_domains:
      - "www.eastleigh.gov.uk"
      - "eastleigh.gov.uk"
    allowed_ports: [80, 443]
    
  - id: fareham
    name: "Fareham Borough Council"
    allowed_domains:
      - "www.fareham.gov.uk"
      - "fareham.gov.uk"
    allowed_ports: [80, 443]
    
  - id: gosport
    name: "Gosport Borough Council"
    allowed_domains:
      - "www.gosport.gov.uk"
      - "gosport.gov.uk"
    allowed_ports: [80, 443]
    
  - id: hart
    name: "Hart District Council"
    allowed_domains:
      - "www.hart.gov.uk"
      - "hart.gov.uk"
    allowed_ports: [80, 443]
    
  - id: havant
    name: "Havant Borough Council"
    allowed_domains:
      - "www.havant.gov.uk"
      - "havant.gov.uk"
    allowed_ports: [80, 443]
    
  - id: new-forest
    name: "New Forest District Council"
    allowed_domains:
      - "www.newforest.gov.uk"
      - "newforest.gov.uk"
    allowed_ports: [80, 443]
    
  - id: portsmouth
    name: "Portsmouth City Council"
    allowed_domains:
      - "www.portsmouth.gov.uk"
      - "portsmouth.gov.uk"
    allowed_ports: [80, 443]
    
  - id: rushmoor
    name: "Rushmoor Borough Council"
    allowed_domains:
      - "www.rushmoor.gov.uk"
      - "rushmoor.gov.uk"
    allowed_ports: [80, 443]
    
  - id: southampton
    name: "Southampton City Council"
    allowed_domains:
      - "www.southampton.gov.uk"
      - "southampton.gov.uk"
    allowed_ports: [80, 443]
    
  - id: test-valley
    name: "Test Valley Borough Council"
    allowed_domains:
      - "www.testvalley.gov.uk"
      - "testvalley.gov.uk"
    allowed_ports: [80, 443]
    
  - id: winchester
    name: "Winchester City Council"
    allowed_domains:
      - "www.winchester.gov.uk"
      - "winchester.gov.uk"
    allowed_ports: [80, 443]

# Global blocked destinations (applied to all adapters)
blocked:
  # Cloud metadata endpoints
  - "169.254.169.254"
  - "metadata.google.internal"
  - "metadata.azure.com"
  
  # Private IP ranges
  - "10.0.0.0/8"
  - "172.16.0.0/12"
  - "192.168.0.0/16"
  - "127.0.0.0/8"
  
  # Link-local
  - "169.254.0.0/16"
```

### Implementation Options

**Option 1: Network Security Groups (Azure) / Security Groups (AWS)**
- Per-adapter subnet with specific NSG rules
- Most infrastructure-native

**Option 2: Service Mesh Egress Gateway (Istio/Linkerd)**
- Centralized egress control
- Application-layer visibility
- Requires service mesh infrastructure

**Option 3: Transparent Proxy (Squid/Envoy)**
- Domain-based filtering
- Detailed logging
- Can inspect TLS (with care)

**Recommended:** Option 1 (NSG) combined with Option 3 (proxy) for defense in depth

---

## Service-to-Service Communication

All internal service communication uses mTLS via service mesh.

### Service Mesh Rules

| Source Service | Destination Service | Allowed |
|----------------|---------------------|---------|
| API Service | Auth Layer | ✅ |
| API Service | Internal Services | ✅ |
| Admin Service | Internal Services | ✅ |
| Admin Service | Adapter Control | ✅ |
| Adapter Worker | Internal API | ✅ (results only) |
| Adapter Worker | Other Adapters | ❌ |
| Any | Database | Via Application only |
| Any | Redis | Via Application only |

### mTLS Configuration

- All services issued certificates from internal CA
- Certificate rotation: 24 hours
- Mutual authentication required
- No plaintext internal traffic

---

## Network Security Controls

### DNS Security

- All DNS resolution via internal resolver
- DNS logging enabled
- Block known malicious domains
- DNSSEC validation where available

### Egress Monitoring

- All outbound connections logged
- Anomaly detection for unusual destinations
- Alert on blocked connection attempts
- Regular review of egress patterns

### Private Endpoints

For Azure services, use Private Endpoints to keep traffic off public internet:

| Service | Private Endpoint Required |
|---------|---------------------------|
| Azure Key Vault | ✅ |
| Azure SQL (if used) | ✅ |
| Azure Blob Storage | ✅ |
| Azure Cache for Redis | ✅ |
| Azure Monitor | ✅ (or via agent) |

---

## Network Segmentation Summary

| Subnet | Internet Inbound | Internet Outbound | Internal Access |
|--------|------------------|-------------------|-----------------|
| DMZ | ✅ (443 only) | ❌ | App Subnet only |
| Application | ❌ | Limited (Azure services) | All internal |
| Adapter | ❌ | Council URLs only | App Subnet, Blob |
| Data | ❌ | ❌ | App Subnet only |

---

## What Should NEVER Have Internet Access

| Component | Internet Access | Reason |
|-----------|-----------------|--------|
| PostgreSQL | ❌ NEVER | Contains all platform data; compromise = total breach |
| Redis | ❌ NEVER | Contains session state and cache; no need for external |
| Admin Service | ❌ NEVER (internal only) | High privilege; attack surface minimization |
| Blob Storage | ❌ NEVER (private endpoint) | Contains evidence; no direct access |
| Key Vault | ❌ NEVER (private endpoint) | Contains all secrets |
| Internal Services | ❌ NEVER | No legitimate need |

---

## Firewall Rules (Example: Azure NSG)

```bicep
// Example: Adapter Subnet NSG
resource adapterNsg 'Microsoft.Network/networkSecurityGroups@2023-05-01' = {
  name: 'nsg-adapter-subnet'
  location: location
  properties: {
    securityRules: [
      // Inbound: Only from Application Subnet
      {
        name: 'AllowAppSubnetInbound'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: appSubnetCidr
          destinationAddressPrefix: '*'
          destinationPortRange: '8080'
        }
      }
      {
        name: 'DenyAllInbound'
        properties: {
          priority: 4096
          direction: 'Inbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
      // Outbound: Council URLs via NAT Gateway, Blob Storage, Internal API
      {
        name: 'AllowBlobStorageOutbound'
        properties: {
          priority: 100
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'Storage'
          destinationPortRange: '443'
        }
      }
      {
        name: 'AllowAppSubnetOutbound'
        properties: {
          priority: 110
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: appSubnetCidr
          destinationPortRange: '8080'
        }
      }
      {
        name: 'AllowCouncilHttpsOutbound'
        properties: {
          priority: 200
          direction: 'Outbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: 'Internet' // Further filtered by proxy
          destinationPortRange: '443'
        }
      }
      {
        name: 'DenyMetadataOutbound'
        properties: {
          priority: 300
          direction: 'Outbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '169.254.169.254/32'
          destinationPortRange: '*'
        }
      }
      {
        name: 'DenyPrivateRangesOutbound'
        properties: {
          priority: 310
          direction: 'Outbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefixes: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16']
          destinationPortRange: '*'
        }
      }
      {
        name: 'DenyAllOutbound'
        properties: {
          priority: 4096
          direction: 'Outbound'
          access: 'Deny'
          protocol: '*'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          destinationPortRange: '*'
        }
      }
    ]
  }
}
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-03-25 | Amos | Initial network policy |
