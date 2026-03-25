# Beta Success Criteria

## Duration
Minimum 7 days of stable operation before production promotion.

## Quantitative thresholds
| Metric | Target | Measurement |
|---|---|---|
| API uptime | > 99.5% | Azure Monitor availability |
| P0/P1 incidents | 0 | Security dashboard |
| Eastleigh confidence | > 0.90 | Admin dashboard |
| Fareham confidence | > 0.85 | Admin dashboard |
| Rushmoor confidence | > 0.70 | Admin dashboard |
| Synthetic checks green | 100% | Grafana |
| Breaking drift events | 0 | Drift alert count |
| p95 latency (cached) | < 200ms | Prometheus |
| p95 latency (live) | < 2000ms | Prometheus |
| Failed acquisitions/day | < 5% | Acquisition attempt log |

## Qualitative checks
- [ ] A real postcode lookup has been manually tested end-to-end for each beta council
- [ ] Admin dashboard reviewed by a human — data looks correct
- [ ] At least one drift alert resolved (verifies drift detection works)
- [ ] Retention worker ran at least once (check audit log)
- [ ] SIEM forwarding confirmed (check Log Analytics workspace)

## Go/No-Go decision
If all quantitative thresholds met and qualitative checks passed:
→ **GO**: proceed to production promotion runbook

If any threshold missed:
→ **HOLD**: investigate, fix, restart 7-day clock
