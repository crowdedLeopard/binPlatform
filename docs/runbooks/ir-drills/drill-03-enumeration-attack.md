# Drill 03 — Enumeration Attack

## Scenario

The BinDay security dashboard is showing a sustained spike in blocked requests to council endpoints. An automated probe is systematically iterating through postcodes and/or council slugs on the public API, triggering the rate-limiter and enumeration-detection rules at high frequency. The attack has been running for at least 20 minutes. It is unclear whether the goal is data harvesting, API mapping, or probing for unprotected endpoints.

---

## Detection

**Automated:**
- Security dashboard alert: enumeration detection rule threshold exceeded
- Rate-limit block count spikes sharply on `/v1/councils/*` endpoints
- Anomaly detection fires on request volume from a single CIDR range

**Manual indicators:**
- Sequential or near-sequential postcode patterns visible in access logs
- Requests arriving at a metronomic interval (e.g. exactly 50 req/s) inconsistent with human browsing
- High proportion of `404` or `429` responses from a narrow IP range
- Requests arriving with no `User-Agent`, a bot-like UA, or rotating UAs following a pattern

---

## Steps

### 1 — Review security events (target: < 3 min)

```bash
# Pull the most recent enumeration-related security events
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/security/events?type=enumeration_block&limit=100" | jq .
```

Look for:
- `source_ip` — are blocks concentrated on one IP or a range?
- `endpoint` — which paths are being probed?
- `request_rate` — requests per second/minute
- `first_seen` and `last_seen` — how long has this been running?
- `block_count` — how many requests have been blocked vs allowed?

### 2 — Characterise the attack (target: < 5 min)

Use the event data to answer the following before taking action — an accurate characterisation leads to a more targeted response.

**IP range:**
```bash
# Summarise blocks by source IP
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/security/events?type=enumeration_block&limit=500" \
  | jq '[.events[] | .source_ip] | group_by(.) | map({ip: .[0], count: length}) | sort_by(-.count)'
```

Determine whether traffic comes from a single IP, a /24 or /16 CIDR, or a distributed set (botnet). This drives the WAF rule scope.

**Request pattern:**
```bash
# Sample endpoints being probed
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/security/events?type=enumeration_block&limit=500" \
  | jq '[.events[] | .endpoint] | group_by(.) | map({endpoint: .[0], count: length}) | sort_by(-.count) | .[0:20]'
```

**Time window:**
```bash
# First and last event timestamps
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/security/events?type=enumeration_block&limit=1&order=asc" \
  | jq '.events[0].timestamp'

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/security/events?type=enumeration_block&limit=1&order=desc" \
  | jq '.events[0].timestamp'
```

### 3 — Respond: block at the WAF (target: < 10 min)

Select the appropriate block scope based on your characterisation:

**Single IP:**
```bash
# Azure Front Door / WAF example
az network front-door waf-policy rule create \
  --policy-name binday-waf \
  --resource-group binday-rg \
  --name "BlockEnumerationIP$(date +%Y%m%d)" \
  --priority 100 \
  --rule-type MatchRule \
  --action Block \
  --match-conditions \
    matchVariable=RemoteAddr \
    operator=IPMatch \
    values="203.0.113.42/32"

# Cloudflare example (via API)
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/firewall/rules" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filter": {"expression": "ip.src eq 203.0.113.42"},
    "action": "block",
    "description": "Enumeration attack block — incident YYYY-MM-DD"
  }' | jq .
```

**CIDR range** (replace `/32` with the appropriate prefix, e.g. `/24`):
```bash
# Same commands as above — update the IP value to CIDR notation
# e.g. values="203.0.113.0/24"
```

**Rate-limit tighten** (if source IPs are too distributed to block by CIDR):
```bash
# Tighten the global rate limit on council endpoints
curl -s -X PATCH \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"requests_per_minute": 30, "burst": 10}' \
  https://api.binday.app/v1/admin/rate-limits/councils | jq .
```

### 4 — Monitor for the attack shifting IPs (target: ongoing after step 3)

After applying the WAF block, watch for the attacker moving to new source IPs — a common response to IP-level blocking.

```bash
# Watch new enumeration blocks in near-real-time (poll every 30s)
while true; do
  echo "--- $(date -u +%H:%M:%SZ) ---"
  curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
    "https://api.binday.app/v1/admin/security/events?type=enumeration_block&limit=10&order=desc" \
    | jq '.events[] | {ts: .timestamp, ip: .source_ip, endpoint: .endpoint}'
  sleep 30
done
```

If new IPs appear continuing the same pattern:
- Expand the WAF block to a wider CIDR
- Consider a temporary `CHALLENGE` (CAPTCHA) rule on all `/v1/councils/*` requests rather than an outright block, to minimise legitimate user impact
- Escalate to the security lead if the attack persists beyond 30 minutes after the initial block

### 5 — Export security events for the incident record

```bash
START=$(date -u -d '2 hours ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || \
        date -u -v-2H +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u +%Y-%m-%dT%H:%M:%SZ)

curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://api.binday.app/v1/admin/security/events/export?type=enumeration_block&from=${START}&to=${END}" \
  -o enumeration-events-$(date +%Y%m%d-%H%M).json

echo "Exported security events"
```

### 6 — Draft the incident summary

While the WAF block is active and monitoring continues, draft the incident summary. Include at minimum:

- **Timeline:** first detected, characterised, WAF block applied, attack ceased/shifted
- **Attack profile:** source IP(s)/CIDR, request rate, endpoints targeted, duration
- **Data exposure assessment:** were any enumeration requests *not* blocked before detection? If so, what data could have been returned?
- **Mitigation applied:** exact WAF rule(s) created
- **Ongoing monitoring:** when monitoring will be stood down

```markdown
## Incident Summary — Enumeration Attack — YYYY-MM-DD

**Detected:** HH:MM UTC  
**Contained:** HH:MM UTC  
**Duration before containment:** MM minutes  

**Attack profile:**
- Source: [IP / CIDR / distributed]
- Rate: [N] requests/minute at peak
- Endpoints: [list]
- Total blocked requests: [N]
- Requests served before detection: [N] (estimated)

**Mitigation:**
- WAF rule [rule name] created at HH:MM UTC blocking [scope]
- Rate limit adjusted from X to Y rpm on /v1/councils/* (if applicable)

**Data exposure:** [assessment]

**Action items:**
- [ ] Review WAF rule for permanent vs temporary retention
- [ ] Assess whether enumeration yielded useful data to attacker
```

---

## Expected Duration

**20 minutes** from detection to WAF block active, events exported, and incident summary drafted.

---

## Success Criteria

| Criterion | Target |
|-----------|--------|
| Attack characterised (IP range, pattern, time window) | Within **5 minutes** of drill start |
| WAF block rule created and active | Within **10 minutes** of drill start |
| Monitoring in place for IP shifting | Within **10 minutes** of WAF block |
| Security events exported | Within **15 minutes** of drill start |
| Incident summary drafted | Within **20 minutes** of drill start |

---

## Post-Incident Actions

- [ ] Decide whether the WAF block is temporary (remove after 24–72h) or permanent — document the decision in the incident ticket
- [ ] Assess whether any exported data was meaningfully harvested before blocks kicked in; if council schedule data was bulk-downloaded, notify the affected councils
- [ ] Review enumeration-detection thresholds — if the attack ran for 20 minutes before alerting, lower the threshold
- [ ] Consider adding a `Retry-After` header to 429 responses to make legitimate clients back off gracefully
- [ ] Review whether the probed endpoints should require authentication (currently public) — file a risk acceptance or remediation ticket
- [ ] Update threat model documentation if the attack pattern was novel

---

## Common Pitfalls

**Blocking too wide a CIDR prematurely** — Blocking a /16 to catch a /28 attack range will block legitimate users. Start narrow and widen only if the attack demonstrably shifts within the CIDR.

**Forgetting to monitor after blocking** — A WAF block is not the end of the incident; it is a containment action. Attackers routinely switch IPs. Stand up the polling loop in step 4 before declaring success.

**Conflating blocked requests with successful requests** — The security events endpoint shows `enumeration_block` events. These are requests that *were* blocked. Separately assess how many requests were *served* before the blocks kicked in — these are the ones with potential data exposure.

**Not recording the WAF rule for later cleanup** — Temporary WAF rules accumulate and become permanent by neglect. Record the rule name and intended expiry in the incident ticket and set a calendar reminder.

**Tightening rate limits without considering legitimate traffic** — If you drop the rate limit to 30 rpm to suppress an attack, a legitimate mobile app doing background refresh may also be throttled. Check baseline traffic stats before adjusting rate limits.

---

## Drill History

<!-- Append a filled-in log block here after each run. See README.md for the template. -->
