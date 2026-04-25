# Reviewer Hints — 2026-04-25
- Only apply `needs-info` when the issue literally cannot be classified without missing information — not as a default fallback for ambiguity; use `needs-triage` for ambiguous issues instead.
- Before requesting more information, attempt to answer the clarifying question yourself from the issue body, linked PRs, or the codebase; request human input only when genuinely blocked.
- Prefer making a confident triage decision with available information rather than escalating to `needs-info`; an imperfect triage label is more actionable than an indefinite hold.
- When triaging a batch, first check how many open issues already carry `needs-info`; if the count exceeds 10, prioritize resolving or closing stale ones before generating new `needs-info` requests.
- When an issue has carried `needs-info` with no reporter response for more than 30 days, close it with a comment noting it will be reconsidered if context is provided — do not leave it open indefinitely.
