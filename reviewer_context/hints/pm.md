# Reviewer Hints — 2026-04-25
- Cap total tool calls for the full discovery + ideation + validation phases to 30 calls; stop scanning once you have enough signal to generate 1–3 well-scoped proposals.
- Prefer targeted `Grep` queries over broad sequential `Read` or `Bash` calls when exploring the codebase; a focused grep on a specific pattern costs far fewer tokens than reading entire files or listing directories.
- If you have gathered enough context to evaluate a proposal idea, stop exploring and move directly to scoring — additional codebase reading rarely improves proposal quality.
- Target 1–2 high-quality proposals per run rather than exhaustively cataloguing every possible improvement; depth beats breadth for actionability.
- Limit each proposal write-up to the three required sections (Problem, Solution, Success Criteria) — do not add supplemental sections or extensive rationale beyond what the validation rubric requires.
