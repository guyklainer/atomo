# Reviewer Hints — 2026-04-25 (updated 12:16)
- The `needs-info` backlog is at 86% of triaged issues (49/57) — far above the 35% ceiling; on every run, complete the full stale-lifecycle sweep (close issues older than 30 days) before classifying any new issue.
- If needs_info_rate remains above 0.35 after the stale-lifecycle sweep, emit `RATE_GATE: needs_info_rate={value} — skipping new classifications this run` and exit rather than adding more `needs-*` labels to an already-bloated backlog.
- Never apply the generic `needs-info` label; use `needs-repro` for bugs missing reproduction steps and `needs-triage` for genuinely ambiguous issues — this keeps the backlog auditable and the rate metric meaningful.
- When closing a stale `needs-info` issue, include the original unanswered question in the closing comment so the reporter can file a precise follow-up rather than a duplicate.
- After each triage batch, log the current needs_info_rate in the completion output so the next run has a clean baseline for comparison.
