# Networking Module - VNet, Subnets, NSGs, Private Endpoints
# TODO: Implement networking
# - Virtual network
# - Subnets (API, database, worker, private endpoints)
# - Network security groups
# - Private DNS zones
# - Private endpoints for database, Redis, storage

variable "environment" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "admin_ip_whitelist" {
  type = list(string)
}

# TODO: Add resources
