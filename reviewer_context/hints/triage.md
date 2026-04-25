# Reviewer Hints — 2026-04-25
- The `needs-info` backlog is at 87.7% of triaged issues (50/57) — well above the 35% ceiling and worsening from the prior cycle; compute the live rate BEFORE classifying any new issues, and purge stale needs-* issues first if the rate exceeds 0.35.
- Close needs-* issues older than 14 days (not 30) — the longer window allows the backlog to compound faster than triage runs can clear it.
- You are making only 1 Bash call per run, suggesting the stale-lifecycle cleanup step is being skipped entirely; ensure the first action in every run is to fetch and close aged needs-* issues before doing any classification work.
- When uncertain whether a clarifying question is needed, check the issue's linked PRs and recent commits before applying a needs-* label — a brief codebase scan often surfaces the answer without adding to the backlog.
- After closing a batch of stale needs-* issues, re-check the live rate before proceeding; only begin classifying new issues once the rate is below 0.35.
