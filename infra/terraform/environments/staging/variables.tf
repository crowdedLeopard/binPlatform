variable "location" {
  description = "Azure region"
  type        = string
  default     = "uksouth"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "resource_group" {
  description = "Resource group name"
  type        = string
}

variable "acr_name" {
  description = "Azure Container Registry name"
  type        = string
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

variable "key_vault_name" {
  description = "Key Vault name"
  type        = string
}

variable "enabled_adapters" {
  description = "List of adapter IDs to enable (all others kill-switched)"
  type        = list(string)
  default     = ["eastleigh", "fareham", "rushmoor"]
}

variable "adapter_kill_switches" {
  description = "Map of adapter_id → kill_switch_active"
  type        = map(bool)
  default     = {}
}

variable "postgres_sku" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "B_Standard_B1ms"  # Burstable, 1 vCore, 2GB RAM — staging
}

variable "redis_sku" {
  description = "Redis Cache SKU"
  type        = string
  default     = "Basic"  # Basic C0 — 250MB cache
}

variable "redis_capacity" {
  description = "Redis Cache capacity"
  type        = number
  default     = 0  # C0
}

variable "min_replicas" {
  description = "Minimum number of API replicas"
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of API replicas"
  type        = number
  default     = 3
}
