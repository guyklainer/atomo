# Reviewer Hints — 2026-04-26
- The Architect (Review) sub-role had one run that completed without an ok_run status and no API error — if a spec review must be abandoned early, emit a structured `[Architect] ABORT | reason: <…>` message so the run can be differentiated from a silent failure.
- Feedback loop depth is not measurable from delta stats alone; ensure each review round emits a structured marker (e.g., `[Architect] ROUND N`) so depth can be tracked across sessions.
