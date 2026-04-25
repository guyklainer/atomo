# Reviewer Hints — 2026-04-25
- When a Phase 0 pre-flight check fails, emit a structured abort message (include: agent name, issue number, failure reason, and "STATUS: ABORTED") before exiting so the run is distinguishable from a crash.
- Distinguish hard failures (merge conflicts, missing TECH_SPEC, non-existent branch) — which must abort immediately — from transient failures (network timeouts, connection resets) — which warrant exactly one retry before aborting.
- After a transient retry succeeds, include a one-line warning in your completion report so the failure is visible without triggering an abort.
- Before declaring a run complete, verify that the PR was created and the feature branch was pushed; do not exit with an ok status if either step was skipped.
- When creating the PR, ensure the body includes "Closes #{N}" so GitHub automatically links and closes the issue.
