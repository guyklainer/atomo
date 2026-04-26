# Reviewer Hints — 2026-04-25 (updated 22:00)
- run_completion_rate is 0.143 (1/7) — the low rate is caused by STEP 0 early exits on empty-delta runs, not behavioral failure; do not alter analysis logic.
- Confirm all four STEP 0 checks pass before emitting any report: atomoCwd reachable, at least one agent with runs > 0, both delta timestamps parseable, and thresholds map non-empty.
- When STEP 0 fails, emit exactly one line: `[Reviewer] ABORT | reason: <check> | STATUS: ABORTED` — no partial files, no last_review.json update.
- The "runs: 0 for all agents" exit condition must be checked before STEP 1; print `[Reviewer] No delta since last run. Exiting.` and halt without writing any output files.
