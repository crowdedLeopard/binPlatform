#!/bin/bash
set -euo pipefail

# Branch Protection Setup Script
# Applies required branch protection rules to the main branch using GitHub CLI

BRANCH="main"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "🔒 Branch Protection Setup"
echo "=========================="
echo ""

# Check if gh is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed"
    echo "Install from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI"
    echo "Run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI authenticated"
echo ""

# Get repository info
OWNER=$(gh repo view --json owner --jq .owner.login)
REPO=$(gh repo view --json name --jq .name)

echo "Repository: $OWNER/$REPO"
echo "Branch: $BRANCH"
echo ""

# Define required status checks
REQUIRED_CHECKS=(
    "lint-typecheck"
    "unit-tests"
    "integration-tests"
    "security-tests"
    "dependency-check"
    "secrets-baseline"
    "adapter-kill-switch-audit"
    "build-and-scan-image"
    "iac-scan"
    "secret-scan"
    "build"
)

echo "Required status checks:"
for check in "${REQUIRED_CHECKS[@]}"; do
    echo "  - $check"
done
echo ""

# Create branch protection rule
echo "Applying branch protection rules..."
echo ""

# Note: GitHub CLI doesn't have native branch protection commands yet
# Use the API directly

# Build the JSON payload
CONTEXTS_JSON=$(printf '%s\n' "${REQUIRED_CHECKS[@]}" | jq -R . | jq -s .)

cat > /tmp/branch-protection.json <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": $CONTEXTS_JSON
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF

echo "Configuration:"
cat /tmp/branch-protection.json | jq .
echo ""

# Apply branch protection
gh api \
    --method PUT \
    -H "Accept: application/vnd.github+json" \
    "/repos/$OWNER/$REPO/branches/$BRANCH/protection" \
    --input /tmp/branch-protection.json

echo ""
echo "✅ Branch protection rules applied successfully"
echo ""

# Verify configuration
echo "Verifying configuration..."
gh api "/repos/$OWNER/$REPO/branches/$BRANCH/protection" | jq '{
    required_status_checks: .required_status_checks.contexts,
    enforce_admins: .enforce_admins.enabled,
    required_reviews: .required_pull_request_reviews.required_approving_review_count,
    dismiss_stale_reviews: .required_pull_request_reviews.dismiss_stale_reviews,
    require_conversation_resolution: .required_conversation_resolution.enabled
}'

echo ""
echo "✅ Branch protection configuration complete"
echo ""
echo "View in GitHub:"
echo "  https://github.com/$OWNER/$REPO/settings/branch_protection_rules"
echo ""

# Cleanup
rm -f /tmp/branch-protection.json
