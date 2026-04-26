# Reviewer Hints — 2026-04-25 (updated 22:00)
- Token usage dropped from 42,363 to 20,332 this cycle — the lazy-loading and discovery-cap hints are working; maintain the same discipline: load only `domain.md` and `capabilities.md` at run start.
- The 15,000-token budget is still being exceeded (20,332 = 1.36×); aim to halve discovery tool calls by preferring one targeted `Grep` over sequential `Read` calls when scanning for opportunity areas.
- If `rejected_proposals.md` and `revalidation_log.md` are both empty or absent at the start of a run, skip PHASE 0 and PHASE 1 entirely — do not substitute with speculative codebase scanning.
- Target a single high-quality proposal rather than multiple; a well-validated single proposal costs ~10,000 tokens and leaves margin for pre-validation and formatting.
