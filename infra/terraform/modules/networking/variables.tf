variable "prefix" {
  description = "Resource name prefix"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "api_subnet_id" {
  description = "Subnet ID for API service"
  type        = string
}

variable "worker_subnet_id" {
  description = "Subnet ID for adapter workers"
  type        = string
}

variable "database_subnet_id" {
  description = "Subnet ID for PostgreSQL database"
  type        = string
}

variable "cache_subnet_id" {
  description = "Subnet ID for Redis cache"
  type        = string
}

variable "admin_subnet_id" {
  description = "Subnet ID for admin service (optional)"
  type        = string
  default     = null
}

variable "api_subnet_prefix" {
  description = "CIDR prefix for API subnet (e.g., 10.0.1.0/24)"
  type        = string
}

variable "worker_subnet_prefix" {
  description = "CIDR prefix for worker subnet"
  type        = string
}

variable "database_subnet_prefix" {
  description = "CIDR prefix for database subnet"
  type        = string
}

variable "cache_subnet_prefix" {
  description = "CIDR prefix for cache subnet"
  type        = string
}

variable "admin_subnet_prefix" {
  description = "CIDR prefix for admin subnet"
  type        = string
  default     = ""
}

variable "vpn_subnet_prefix" {
  description = "CIDR prefix for VPN/bastion subnet"
  type        = string
  default     = ""
}

variable "use_azure_firewall" {
  description = "Whether to use Azure Firewall for domain-based egress filtering"
  type        = bool
  default     = false
}

variable "firewall_name" {
  description = "Azure Firewall name (required if use_azure_firewall is true)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
