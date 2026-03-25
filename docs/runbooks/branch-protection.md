# Branch Protection Configuration

**Owner:** Drummer (Infrastructure Engineer)  
**Last Updated:** 2026-03-25  

---

## Overview

This document defines the required GitHub branch protection rules for the `main` branch. These rules enforce code quality, security, and review standards before changes reach production.

---

## Required Status Checks

All of the following CI checks must pass before a pull request can be merged to `main`:

### Code Quality
- `lint-typecheck` — ESLint and TypeScript type checking
- `unit-tests` — Unit test suite
- `integration-tests` — Integration tests with PostgreSQL and Redis
- `security-tests` — Security-specific test suite

### Security Scanning
- `dependency-check` — OWASP Dependency Check (blocks on CVSS ≥ 7)
- `secrets-baseline` — detect-secrets scan (blocks on new secrets)
- `adapter-kill-switch-audit` — Kill switch configuration validation
- `build-and-scan-image` — Trivy container scan (blocks on CRITICAL)
- `iac-scan` — Terraform/IaC security scan with tfsec (blocks on HIGH)
- `secret-scan` — TruffleHog verified secrets detection

### Build
- `build` — Application build process

---

## Branch Protection Rules

### 1. Require Pull Request Reviews
- **Minimum approvals:** 1
- **Dismiss stale reviews:** Yes (on new commits)
- **Require review from Code Owners:** Yes (if CODEOWNERS file exists)

### 2. Require Status Checks to Pass
- **Require branches to be up to date before merging:** Yes
- **Status checks that must pass before merging:**
  - `lint-typecheck`
  - `unit-tests`
  - `integration-tests`
  - `security-tests`
  - `dependency-check`
  - `secrets-baseline`
  - `adapter-kill-switch-audit`
  - `build-and-scan-image`
  - `iac-scan`
  - `secret-scan`

### 3. Require Conversation Resolution
- **Require all conversations to be resolved before merging:** Yes

### 4. Require Signed Commits (Optional)
- **Require signed commits:** Recommended but not mandatory for Phase 1
- **Enable for Phase 2:** Yes

### 5. Restrict Who Can Push
- **Restrict who can push to matching branches:** Yes
- **Allowed actors:**
  - GitHub Actions (for automated deployments)
  - Deployment service accounts only
- **No direct pushes:** Developers must use pull requests

### 6. Do Not Allow Bypassing
- **Allow force pushes:** No
- **Allow deletions:** No
- **Allow bypassing required status checks:** No (not even for administrators)

### 7. Require Linear History (Optional)
- **Require linear history:** Recommended (enforces squash or rebase merge)
- **Benefit:** Cleaner git history, easier rollbacks

---

## Manual Configuration Steps

If you cannot use the automated script, configure branch protection manually:

### Via GitHub Web UI

1. Navigate to repository **Settings**
2. Click **Branches** in left sidebar
3. Under "Branch protection rules", click **Add rule**
4. Set **Branch name pattern:** `main`
5. Enable the following:
   - ✅ Require pull request reviews before merging
     - Required approvals: `1`
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - Add all status checks listed above (search for each one)
   - ✅ Require conversation resolution before merging
   - ✅ Require signed commits (Phase 2)
   - ✅ Restrict who can push to matching branches
     - Add: `github-actions` bot
     - Add: Deployment service account (if applicable)
   - ✅ Do not allow bypassing the above settings
6. Click **Create** or **Save changes**

---

## Automated Configuration

Use the provided script to apply branch protection rules programmatically:

```bash
# From repository root
./scripts/setup-branch-protection.sh
```

**Prerequisites:**
- GitHub CLI (`gh`) installed and authenticated
- Repository admin permissions
- Run from repository root directory

**What the script does:**
1. Verifies GitHub CLI authentication
2. Checks current branch protection status
3. Applies all required branch protection rules
4. Validates configuration was applied correctly

---

## Verification

After applying branch protection, verify the configuration:

```bash
# Check branch protection rules
gh api repos/:owner/:repo/branches/main/protection

# Or via web UI
# Navigate to: Settings → Branches → main (edit rule)
```

**Expected output:**
- All status checks listed as required
- Pull request reviews required (1 approval)
- Force push and deletion restrictions enabled
- No bypass permissions for anyone

---

## Exceptions and Overrides

### Emergency Hotfixes

In the event of a critical production incident:

1. **Do NOT bypass branch protection**
2. Instead, use the emergency deployment process:
   - Create a hotfix branch from `main`
   - Make minimal changes
   - Request expedited review (minimum 1 approval)
   - Ensure all CI checks pass (or explicitly document why a check fails)
   - Merge via normal PR process

3. If CI is unavailable during outage:
   - Document incident ticket number
   - Obtain approval from two team members (e.g., Security + Engineering Lead)
   - Temporarily disable specific failing check (not all branch protection)
   - Re-enable immediately after merge

### Adding New Status Checks

When adding a new required CI check:

1. Add the check to CI workflow (`.github/workflows/ci.yml`)
2. Verify it runs successfully on at least one PR
3. Update this document
4. Run `./scripts/setup-branch-protection.sh` to add to required checks
5. Announce change to team (prevents surprises)

---

## Troubleshooting

### "Required status check has not run"

**Cause:** A required status check is configured but not triggered by CI.

**Solution:**
1. Check `.github/workflows/ci.yml` for the job name
2. Ensure job name matches exactly (case-sensitive)
3. Verify job runs on PR trigger events
4. If check was recently added, remove from required checks temporarily, then re-add after first successful run

### "Branch is out of date"

**Cause:** Base branch has new commits since PR was opened.

**Solution:**
1. Update branch: `git pull origin main` (or use GitHub UI "Update branch" button)
2. CI will re-run automatically
3. Do NOT force-push unless rebasing (check team policy)

### "Required review not provided"

**Cause:** PR has no approving review, or review was dismissed.

**Solution:**
1. Request review from team member
2. Address review comments
3. Wait for approval
4. Ensure reviewer has write access to repository

---

## CODEOWNERS File (Optional)

Create a `.github/CODEOWNERS` file to automatically request reviews from specific team members:

```
# Default owners for everything
* @drummer @holden @amos @naomi

# Infrastructure changes require Drummer + Amos review
/infra/ @drummer @amos
/deploy/ @drummer @amos
/.github/ @drummer

# Security changes require Amos review
/docs/threat-model/ @amos
/src/auth/ @amos

# Adapter changes require Naomi review
/src/adapters/ @naomi
/data/council-registry.json @naomi
```

---

## Maintenance

- **Review frequency:** Quarterly
- **Owner:** Drummer (Infrastructure Engineer)
- **Next review:** 2026-06-25

### When to Update

1. New CI check added to pipeline
2. Team structure changes (different approval requirements)
3. Security posture changes (e.g., require signed commits)
4. GitHub changes branch protection features

---

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [CI Workflow](./.../../.github/workflows/ci.yml)
- [Security Decisions](./../../.squad/decisions.md#security-decisions-amos--mandatory-blocking)
