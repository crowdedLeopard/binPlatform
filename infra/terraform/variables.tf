variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "uksouth"
}

variable "location_short" {
  description = "Short name for location"
  type        = string
  default     = "uks"
}

variable "cost_center" {
  description = "Cost center for billing"
  type        = string
  default     = "engineering"
}

variable "database_sku" {
  description = "PostgreSQL SKU"
  type        = string
  default     = "B_Standard_B1ms" # Burstable for dev, upgrade for prod
}

variable "redis_sku" {
  description = "Redis SKU"
  type        = string
  default     = "Basic" # Basic for dev, Premium for prod
}

variable "redis_capacity" {
  description = "Redis capacity (0-6 for Basic/Standard, 1-5 for Premium)"
  type        = number
  default     = 0
}

variable "storage_replication" {
  description = "Storage replication type"
  type        = string
  default     = "LRS" # LRS for dev, GRS for prod
}

variable "admin_ip_whitelist" {
  description = "IP addresses allowed for admin access"
  type        = list(string)
  default     = []
}
