# Reviewer Hints — 2026-04-25 (updated 12:16)
- Token usage was 42,363 against a 15,000-token budget (2.8× over); load ONLY `domain.md` and `capabilities.md` at run start — do not read any other pm_context files until the specific phase that requires them.
- Cap discovery (STEP 1-7) to a maximum of 15 tool calls total; when the 15th call completes, stop scanning and move directly to PHASE 4 Pre-Validation with whatever proposals have been drafted.
- PHASE 0 (Self-Critique) and PHASE 1 (Revalidation) require `rejected_proposals.md` and `revalidation_log.md` — if these files do not exist, skip those phases entirely and proceed to PHASE 2; do not substitute with broad codebase scanning.
- Prefer a single well-scoped `Grep` over multiple sequential `Read` or `Bash` calls during discovery; each Bash call to list issues or read files costs tokens that count against your 15,000 budget.
- Target 1–2 high-quality proposals per run; generating 8+ proposals in a single run exhausts the token budget and reduces per-proposal quality below the validation threshold.
