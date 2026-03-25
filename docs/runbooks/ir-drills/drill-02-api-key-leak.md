# Drill 02 — API Key Leak

## Scenario

A developer has accidentally committed a live BinDay API key (prefixed `hbp_live_`) to a public GitHub repository. The key was present in the repository for an unknown amount of time before being noticed — it may have been indexed by secret-scanning bots, credential-stuffing services, or a human actor. The key must be revoked immediately and the blast radius assessed.

---

## Detection

**Automated:**
- GitHub Advanced Security / secret scanning alert fires on the public repository
- BinDay's own audit log shows unexpected API calls from an unknown client IP using a known key ID

**Manual indicators:**
- Developer self-reports after noticing the key in a commit
- Unusual volume or pattern of API calls on a key that should be low-traffic
- Client reports their key is being used from locations they don't recognise

---

## Steps

### 1 — Identify the leaked key (target: < 2 min)

From the GitHub secret scanning alert or the commit itself, extract:

- **Key ID** — the identifier used in API calls, e.g. `key_abc123`. This is distinct from the secret value.
- **Key value** — the `hbp_live_...` string. Treat this as toxic; do not paste it into Slack, email, or any log.
- **Commit SHA** and **repository URL** — needed for the git history review in step 6.
- **First seen timestamp** — the commit timestamp gives the earliest possible leak date.

```bash
# If you have the key value, look up its ID in the admin API
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/keys?prefix=hbp_live_FIRST8CHARS" | jq .
```

Record the `id` field — you need it for the revocation call.

### 2 — Revoke the key immediately (target: < 5 min from detection)

```bash
# Replace {id} with the key ID from step 1
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  https://api.binday.app/v1/admin/keys/{id}/revoke | jq .
```

Expected response:

```json
{
  "id": "key_abc123",
  "status": "revoked",
  "revoked_at": "2024-01-15T10:30:00Z"
}
```

Confirm `status` is `revoked` before proceeding. If the call fails, check `$ADMIN_TOKEN` validity and retry.

### 3 — Check the audit log for usage of the revoked key (target: < 10 min)

```bash
# Pull all audit events for this key — go back to the leak date
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/audit?key_id={id}&limit=200" | jq .
```

For each event, record:
- Timestamp
- Source IP
- Endpoint called
- Response code
- Any `user_agent` field

Sort by source IP to spot IPs that are not the legitimate client:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/audit?key_id={id}&limit=200" \
  | jq '[.events[] | {ip: .source_ip, endpoint: .endpoint, ts: .timestamp}] | group_by(.ip)'
```

### 4 — Assess data accessed

Based on the audit log from step 3, answer:

- Which endpoints were called? (council data only, or admin endpoints?)
- Were any write or mutation endpoints called (`POST`, `PUT`, `DELETE`)?
- Was any PII-adjacent data returned (e.g. detailed collection schedules that could reveal household occupancy patterns)?
- Was the access limited to the legitimate client's IP, or were there third-party IPs?

Document findings. If admin endpoints were called from an unknown IP, escalate immediately — this is no longer just a key leak.

### 5 — Issue a new key to the client

```bash
# Create a replacement key with the same scopes as the revoked one
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "CLIENT_ID_HERE",
    "scopes": ["councils:read"],
    "description": "Replacement key after leak incident YYYY-MM-DD"
  }' \
  https://api.binday.app/v1/admin/keys | jq .
```

Share the new key value with the client via a secure channel (password manager share, encrypted email, or secrets vault invite) — **not** Slack or plain email.

Confirm with the client that the new key works before closing this step.

### 6 — Review git history for other leaked secrets

```bash
# In the affected repository — scan all commits, not just the one flagged
git log --all --oneline | head -50

# Search for any hbp_ prefixed strings across all commits
git log --all -p | grep -E "hbp_(live|test)_[A-Za-z0-9]+"

# Also check for common secret patterns that might have been committed alongside the key
git log --all -p | grep -iE "(secret|password|token|api_key)\s*[:=]\s*\S+"
```

If additional secrets are found, treat each one as a separate incident and return to step 1 for each.

### 7 — Rotate related secrets

Even if no other secrets were found in the git history, consider rotating anything that was stored near the leaked key or deployed alongside it:

- Webhook signing secrets for the same service
- Database credentials if they appear in the same config file
- Any other `hbp_` keys belonging to the same client or environment

```bash
# List all keys for the affected client to check their status
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/keys?client_id=CLIENT_ID_HERE" | jq '.keys[] | {id, status, created_at, description}'
```

---

## Expected Duration

**20 minutes** from detection to key revoked, blast radius assessed, and new key issued.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Leaked key revoked (`status: revoked`) | Within **5 minutes** of detection |
| Audit log reviewed and all usage accounted for | Within **10 minutes** of detection |
| Blast radius assessment documented | Within **15 minutes** of detection |
| New key issued to client via secure channel | Within **20 minutes** of detection |
| Git history checked for additional leaks | Before drill closes |

---

## Post-Incident Actions

- [ ] Remove the secret from the git history using `git filter-repo` or BFG Repo Cleaner — a revoked key still shows in `git log` forever otherwise
- [ ] Force-push the cleaned history (requires temporarily disabling branch protection)
- [ ] Notify the repository owner to re-clone after the history rewrite
- [ ] If the repository is public, request GitHub revoke cached views of the commit (GitHub support ticket)
- [ ] File an incident ticket with timeline, key ID (not value), source IPs, and endpoints accessed
- [ ] If unknown IPs accessed admin endpoints, escalate to full security review
- [ ] Add a pre-commit hook or CI check to prevent future key commits (e.g. `gitleaks`, `truffleHog`, or GitHub secret scanning on the repo)
- [ ] Review and update the developer onboarding checklist to emphasise secrets hygiene

---

## Common Pitfalls

**Revoking the wrong key** — Confirm the key ID from the audit API before calling `/revoke`. Revoking a different client's key causes an outage and a support incident on top of the security incident.

**Sharing the new key insecurely** — The whole incident started with insecure secret handling. Do not share the replacement key over Slack, email, or any channel that isn't end-to-end encrypted or access-controlled. Use a secrets manager or a one-time share link.

**Stopping at the flagged commit** — Secret scanners flag the first match. The key may have been present in earlier commits, other branches, or stashed/untracked files. Always check `git log --all`.

**Assuming revocation is instant everywhere** — API gateways may cache key validity for a short TTL. Revocation propagates within seconds in most cases, but confirm with a test call using the revoked key value to ensure it returns `401`.

**Not assessing the blast radius before issuing a new key** — If an attacker used the key to exfiltrate data or call write endpoints, you need to know that before you close the incident. Don't let urgency to restore service skip the assessment.

---

## Drill History

<!-- Append a filled-in log block here after each run. See README.md for the template. -->
