## Architect Review & Approval Protocol

This protocol runs ONLY in the Architect. On every run, after processing new triaged issues, the Architect MUST scan for issues awaiting review.

### FLOW A: Initial Planning (First-Time Issues)

1. **Query**: `gh issue list --search "is:open label:triaged -label:for-dev -label:needs-review -label:needs-info" --limit 1`
2. **Pass Confidence Gate** (≥85%)
3. **Generate 2-3 Clarifying Questions**:
   - Identify the 2-3 areas with highest ambiguity potential
   - Frame as specific, answerable questions (not vague)
   - Examples:
     * "Should X behavior apply to Y edge case?"
     * "Which component should own Z responsibility?"
     * "What is the expected behavior when A and B conflict?"
4. **Write TECH_SPEC_{number}.md** following Zero-Waste Protocol
5. **Post spec + clarification questions** to issue as single comment:
   ```
   🤖 **Tech Spec Ready for Review**
   
   [Full spec markdown content here]
   
   ---
   
   **Clarification Questions** (to reduce ambiguity):
   1. [Question 1]
   2. [Question 2]
   3. [Question 3]
   
   Reply "APPROVED" when ready to proceed to implementation, or provide feedback for iteration.
   ```
6. **Execute**: `gh issue edit <number> --add-label needs-review`
7. **EXIT** (do NOT add `for-dev`)

### FLOW B: Review Loop (Re-Entry for Feedback)

1. **Query**: `gh issue list --search "is:open label:needs-review" --limit 10`
2. **For each issue**, fetch: `gh issue view <number> --json number,title,body,labels,comments`
3. **Detect human reply** (reuse pattern from reevaluation.md):
   - Find last comment starting with 🤖
   - Check if any non-bot comments exist after it
   - If NO human reply: skip (still waiting)
   - If YES: proceed to step 4
4. **Determine feedback type**:
   
   **Approval Detected** (comment body contains "APPROVED" case-insensitive):
   - a. Remove `needs-review`: `gh issue edit <number> --remove-label needs-review`
   - b. Add `for-dev`: `gh issue edit <number> --add-label for-dev`
   - c. Post acknowledgment: `gh issue comment <number> -b "🤖 Spec approved. Routing to Dev Agent."`
   - d. Continue to next issue
   
   **Feedback Detected** (any other non-bot comment):
   - a. Re-read full issue + all comments (including feedback)
   - b. Identify requested changes/clarifications
   - c. Update TECH_SPEC_{number}.md incorporating feedback
   - d. Post updated spec using same format as FLOW A step 5
   - e. Keep `needs-review` label (do NOT remove)
   - f. Continue to next issue

5. **If no `needs-review` issues exist**, output: `{ "flow": "B", "action": "no-review-issues" }`

### Rationale

- Mirrors proven `reevaluation.md` pattern
- Clear separation of initial planning (FLOW A) vs iteration (FLOW B)
- Explicit approval gate before `for-dev` handoff
