# Database Module - Azure Database for PostgreSQL Flexible Server
# TODO: Implement PostgreSQL Flexible Server
# - Server with appropriate SKU
# - Firewall rules
# - Private endpoint (for prod)
# - Database creation
# - Backup configuration
# - High availability (for prod)

variable "environment" {
  type = string
}

variable "location" {
  type = string
}

variable "resource_group_name" {
  type = string
}

variable "database_sku" {
  type = string
}

# TODO: Add resources
