# Incident Response Drills

## Purpose

These drills train the team to respond quickly and correctly to real security incidents affecting the BinDay API. Each drill simulates a plausible scenario and walks responders through detection, containment, and recovery using actual tooling and commands.

Regular practice ensures:
- Responders know where to look and what to run under pressure
- Runbooks stay accurate and up to date
- Response times meet SLA targets
- Post-incident processes are well understood before they are needed

---

## Schedule

| Frequency | Drill type | Owner |
|-----------|-----------|-------|
| Monthly | One drill rotated from this directory | On-call lead |
| Quarterly | Full tabletop covering all three scenarios | Engineering lead + security |
| After any real incident | Replay the closest drill within 2 weeks | Incident commander |

Drills should be run in a **staging environment** unless the scenario specifically requires production tooling (e.g. audit log review). Never activate kill switches or revoke keys in production during a drill without explicit sign-off.

---

## Participants

| Role | Responsibility during drill |
|------|-----------------------------|
| Incident commander | Runs the clock, calls each step, records deviations |
| Responder(s) | Execute the steps and report back |
| Observer | Silent — notes gaps, confusion, or missing tooling |
| Scribe | Fills in the drill log in real time |

Minimum viable drill: one incident commander + one responder.

---

## How to Run a Drill

1. **Pick a drill file** from this directory.
2. **Brief participants** on the scenario — read the *Scenario* section aloud. Do not reveal the *Steps* in advance; let responders work through them.
3. **Start the timer.**
4. Responders work through detection and response. The incident commander may inject complications (e.g. "the first IP block didn't work") to test adaptability.
5. **Stop the timer** when success criteria are met or the drill is called.
6. Run a 10-minute **hot wash**: what went well, what didn't, what was missing.
7. **Fill in the drill log** below and commit it to the repo.

---

## Drill Index

| File | Scenario | Expected duration |
|------|----------|-------------------|
| [drill-01-adapter-compromise.md](drill-01-adapter-compromise.md) | Eastleigh adapter returning suspicious data | 15 min |
| [drill-02-api-key-leak.md](drill-02-api-key-leak.md) | API key committed to public repo | 20 min |
| [drill-03-enumeration-attack.md](drill-03-enumeration-attack.md) | Sustained council endpoint enumeration attack | 20 min |

---

## Drill Log Template

Copy this block and append it to the relevant drill file's **Drill History** section after each run.

```markdown
### Run — YYYY-MM-DD

| Field | Value |
|-------|-------|
| Date | YYYY-MM-DD |
| Environment | staging / production |
| Incident commander | |
| Responders | |
| Observer | |
| Time to success criteria | mm:ss |
| Success criteria met? | yes / no / partial |

**What went well:**
-

**What didn't go well:**
-

**Action items:**
- [ ] Owner — description
```
