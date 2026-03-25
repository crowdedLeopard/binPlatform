variable "environment" {
  description = "Environment name (staging, production)"
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

variable "acr_login_server" {
  description = "Azure Container Registry login server"
  type        = string
}

variable "acr_id" {
  description = "Azure Container Registry resource ID"
  type        = string
}

variable "key_vault_id" {
  description = "Key Vault resource ID"
  type        = string
}

variable "key_vault_uri" {
  description = "Key Vault URI"
  type        = string
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
}

variable "log_analytics_workspace_id" {
  description = "Log Analytics Workspace ID"
  type        = string
}

variable "min_replicas" {
  description = "Minimum number of API replicas"
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum number of API replicas"
  type        = number
  default     = 10
}

variable "env_vars" {
  description = "Environment variables for containers"
  type        = map(string)
  default     = {}
}

variable "kill_switches" {
  description = "Adapter kill switches (adapter_id -> bool)"
  type        = map(bool)
  default     = {}
}
