# Reviewer Hints — 2026-04-25 (updated 12:16)
- Never apply the generic `needs-info` label; use `needs-repro` for bugs missing reproduction steps and `needs-triage` for genuinely ambiguous issues — this keeps the backlog auditable and the rate metric meaningful.
- When closing a stale `needs-info` issue, include the original unanswered question in the closing comment so the reporter can file a precise follow-up rather than a duplicate.
- After each triage batch, log the current needs_info_rate in the completion output so the next run has a clean baseline for comparison.
