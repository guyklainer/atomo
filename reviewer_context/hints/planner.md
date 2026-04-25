# Reviewer Hints — 2026-04-25 (updated 12:16)
- first_pass_approval_rate is 0.0 (0/5 specs) — post the Reviewer Checklist as a separate follow-up comment immediately after the spec, never embedded inside the spec body; a distinct comment is easier for reviewers to action without re-reading the full document.
- Each checklist row must map to a single binary decision (yes/no); avoid rows that require the reviewer to run code or read diffs — the goal is a 5-minute review, not a 60-minute one.
- After posting the checklist, ping the human reviewer explicitly in the comment (e.g., "@guyklainer — checklist ready, 3 decisions needed") to reduce notification-blindness stalls.
- If a spec has been in `needs-review` for more than 5 days with no response, post a condensed 3-sentence summary as a new comment: problem, proposed solution, and the single most important decision — this re-surfaces the spec in the notification feed.
- Before posting, verify the spec includes Priority Score, target file list, and estimated effort — these three items are the minimum for a reviewer to approve or redirect without reading the full document.
