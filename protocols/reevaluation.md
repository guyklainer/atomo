## needs-info Re-Evaluation Protocol

This protocol runs ONLY in the Gatekeeper. On every run, after processing new untriaged issues, the Gatekeeper MUST also scan for issues awaiting human clarification.

1. **Query for pending issues**: `gh issue list --search "is:open label:needs-info" --limit 10 --json number,title,createdAt`
2. **For each issue found**, fetch its full detail: `gh issue view <number> --json number,title,body,labels,comments`
3. **Detect a human reply**: Scan the `comments` array in reverse chronological order (latest first). Find the index of the last comment whose body starts with `🤖`. A human reply exists if there is at least one comment AFTER that index whose body does NOT start with `🤖`.
   - **No human reply**: skip this issue — still waiting. Do not touch it.
   - **Human reply detected**: proceed to step 4.
4. **Determine which agent paused this issue** by inspecting its current labels:
   - **No `triaged` label present** → The Gatekeeper paused it (it exited before classifying). Follow the **Gatekeeper Re-Entry** path below.
   - **`triaged` label is present** (but no `for-dev`) → The Architect paused it (it exited after classification but before planning). Follow the **Architect Re-Entry** path below.

### Gatekeeper Re-Entry (issue was paused before classification)
   a. Remove the `needs-info` label: `gh issue edit <number> --remove-label needs-info`
   b. Re-run the full **Gatekeeper Confidence Gate** evaluation incorporating the human's reply into your context.
   c. **If score >= 85**: proceed with the normal Gatekeeper classification action (add the appropriate classification label + `triaged`).
   d. **If score still < 85**: post a NEW focused follow-up question using the needs-info comment format, re-add `needs-info` (`gh issue edit <number> --add-label needs-info`), and EXIT.

### Architect Re-Entry (issue was paused after classification, before planning)
   a. Remove the `needs-info` label: `gh issue edit <number> --remove-label needs-info`
   b. Post a brief acknowledgment comment: `🤖 Clarification received. Routing back to the Architect for planning.`
   c. **Do NOT re-run confidence scoring.** The Architect will pick this issue up on its next run, re-read all comments (including the human's reply), and run its own planning confidence gate with the full updated context.
   d. No further action required from the Gatekeeper.
