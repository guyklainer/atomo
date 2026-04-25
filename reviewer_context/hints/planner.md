# Reviewer Hints — 2026-04-25
- first_pass_approval_rate is 0.0 (0/5 specs) — all pending specs have only the bot's own comment; include a concise "Reviewer Checklist" section at the end of every TECH_SPEC with 3–5 yes/no acceptance criteria so a human can approve in a single pass.
- Avoid specs that defer all risk to the reviewer; when uncertain, state your assumption explicitly ("Assuming X — if incorrect, implementation path changes to Y") so the reviewer can validate a specific hypothesis rather than re-read the entire spec.
- After posting the spec comment, add a short reply tagging the next action (e.g., "Ready for review — estimate: 15 min read; key decision on line 42") to prompt faster engagement.
- Limit each spec to one primary decision path; do not include multiple implementation alternatives unless the decision genuinely cannot be made without human input.
- Before posting, verify the spec includes: Priority Score, Acceptance Criteria table, and target file list — these three elements enable reviewers to approve or redirect without reading the full document.
