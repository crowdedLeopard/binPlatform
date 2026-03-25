# Hampshire Bin Collection Data Platform
# Azure Blob Storage Lifecycle Management
#
# Implements retention policies for evidence blobs stored in Azure Blob Storage.
# Tiers to cool storage after 30 days, deletes after 90 days (evidence).
# Separate lifecycle for audit logs (archive after 365, delete after 730).
#
# Author: Amos (Security Engineer)
# Date: 2026-03-25

# =============================================================================
# STORAGE ACCOUNT
# =============================================================================

# Reference to existing storage account (created elsewhere)
# This module only manages lifecycle policies
variable "storage_account_name" {
  description = "Name of the Azure Storage Account"
  type        = string
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

data "azurerm_storage_account" "main" {
  name                = var.storage_account_name
  resource_group_name = var.resource_group_name
}

# =============================================================================
# LIFECYCLE POLICIES
# =============================================================================

resource "azurerm_storage_management_policy" "lifecycle" {
  storage_account_id = data.azurerm_storage_account.main.id

  # Evidence containers: tier to cool after 30 days, delete after 90 days
  rule {
    name    = "evidence-lifecycle"
    enabled = true

    filters {
      prefix_match = ["evidence/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        # Tier to cool storage after 30 days (cost optimization)
        tier_to_cool_after_days_since_modification_greater_than = 30

        # Delete after 90 days (retention policy)
        delete_after_days_since_modification_greater_than = 90
      }

      # Also handle blob versions (if versioning enabled)
      version {
        delete_after_days_since_creation = 90
      }
    }
  }

  # Screenshot evidence: delete after 7 days (minimal retention)
  rule {
    name    = "screenshot-lifecycle"
    enabled = true

    filters {
      prefix_match = ["evidence/screenshots/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        # No tier to cool (short-lived, delete quickly)
        delete_after_days_since_modification_greater_than = 7
      }

      version {
        delete_after_days_since_creation = 7
      }
    }
  }

  # PDF evidence: delete after 30 days
  rule {
    name    = "pdf-lifecycle"
    enabled = true

    filters {
      prefix_match = ["evidence/pdf/"]
      blob_types   = ["blockBlob"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than = 15
        delete_after_days_since_modification_greater_than       = 30
      }

      version {
        delete_after_days_since_creation = 30
      }
    }
  }

  # Audit logs: archive after 365 days, delete after 730 days
  rule {
    name    = "audit-log-lifecycle"
    enabled = true

    filters {
      prefix_match = ["audit-logs/"]
      blob_types   = ["blockBlob", "appendBlob"]
    }

    actions {
      base_blob {
        # Tier to cool after 90 days
        tier_to_cool_after_days_since_modification_greater_than = 90

        # Tier to archive after 365 days
        tier_to_archive_after_days_since_modification_greater_than = 365

        # Delete after 730 days (2 years compliance)
        delete_after_days_since_modification_greater_than = 730
      }

      version {
        tier_to_archive_after_days_since_creation = 365
        delete_after_days_since_creation          = 730
      }
    }
  }

  # Security event archive: archive after 365 days, delete after 730 days
  rule {
    name    = "security-event-lifecycle"
    enabled = true

    filters {
      prefix_match = ["security-events-archive/"]
      blob_types   = ["blockBlob", "appendBlob"]
    }

    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = 90
        tier_to_archive_after_days_since_modification_greater_than = 365
        delete_after_days_since_modification_greater_than          = 730
      }

      version {
        tier_to_archive_after_days_since_creation = 365
        delete_after_days_since_creation          = 730
      }
    }
  }
}

# =============================================================================
# OUTPUTS
# =============================================================================

output "lifecycle_policy_id" {
  description = "ID of the storage lifecycle management policy"
  value       = azurerm_storage_management_policy.lifecycle.id
}

output "storage_account_name" {
  description = "Name of the storage account"
  value       = data.azurerm_storage_account.main.name
}

# =============================================================================
# NOTES
# =============================================================================

# This module implements Azure Blob Storage lifecycle management for:
# 1. Raw evidence (HTML, JSON): 90 days retention
# 2. PDF evidence: 30 days retention
# 3. Screenshots: 7 days retention
# 4. Audit logs: 730 days retention (2 years compliance)
# 5. Security events archive: 730 days retention
#
# Lifecycle policies run daily and apply to all blobs matching prefix filters.
# Tiering to cool/archive storage reduces costs for infrequently accessed data.
#
# For non-Azure deployments (AWS S3, local filesystem):
# - Implement equivalent lifecycle rules in S3 lifecycle policies
# - For local filesystem, use retention worker with evidence expiry module
