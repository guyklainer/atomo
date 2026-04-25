# Reviewer Hints — 2026-04-25
- The `needs-info` backlog stands at 54.5% of triaged issues (30/55) — still above the 35% ceiling (improved from 89.1% last cycle); apply a `needs-*` label only when the clarifying question cannot be answered from the issue body, linked PRs, or codebase context.
- Use `needs-repro` exclusively for bugs missing reproduction steps and `needs-triage` for genuinely ambiguous classification — never apply the generic `needs-info` label.
- On each triage batch, fetch open `needs-info` issues older than 30 days and close them with a note inviting a new issue with the missing context; sustained non-pruning is what drove the current backlog.
- When uncertain between `needs-triage` and a concrete classification, commit to the most likely classification — a correctable wrong label produces less open-issue debt than an indefinite hold.
- After applying any `needs-*` label, leave a comment that specifies exactly what information is needed and what the next action should be; vague labels stall reporter responses.
