# TECH_SPEC_2: Architect Review Loop with Clarification Questions

**Priority: 6.25** (I=5, C=5, E=4)

**Issue**: #2 - feat: Review for planner agent  
**Type**: Enhancement  
**Objective**: Implement an approval-gated workflow for the Architect agent, preventing automatic handoff to Dev until user reviews and approves the tech spec. Add mandatory clarification questions to reduce ambiguity.

---

## Root Cause / Requirements Analysis

### Current Behavior (Problem)
The Architect agent (`src/planner.ts`) currently follows this flow:
1. Fetch triaged issue
2. Pass Confidence Gate (≥85%)
3. Write TECH_SPEC_{number}.md
4. **Automatically add `for-dev` label** ← PROBLEM: No human review
5. Exit

This results in:
- Premature handoff without user validation
- No opportunity for iterative refinement
- Potential misalignment with user intent
- No structured ambiguity reduction

### Desired Behavior (Solution)
The Architect should follow an approval-gated loop:
1. Fetch triaged issue
2. Pass Confidence Gate (≥85%)
3. **Ask 2-3 strategic clarification questions** (even at high confidence)
4. Write TECH_SPEC_{number}.md and post to issue
5. **Add `needs-review` label** (NOT `for-dev`)
6. **Wait for user feedback loop**:
   - User comments with feedback → Architect iterates on spec
   - User comments "APPROVED" → Architect adds `for-dev` label
7. Exit

### Clarification Context (from issue comments)
- Approval signal: User will comment "APPROVED" (case-sensitive check recommended)
- Clarification questions: Can be asked before spec OR within spec, depending on urgency
- Goal: Reduce ambiguity even when confidence is high

---

## Files Requiring Changes

### 1. **src/planner.ts** (PRIMARY)
**Current lines**: 18-80 (entire SYSTEM_PROMPT)  
**Changes**: Major refactor of STEP 2-4 workflow logic

### 2. **protocols/review.md** (NEW FILE - CREATE)
**Purpose**: Define the Architect review loop protocol (similar to `protocols/reevaluation.md`)

### 3. **protocols/planning.md** (ENHANCEMENT - OPTIONAL)
**Current reference**: Zero-Waste Protocol  
**Potential enhancement**: Add clarification question generation guidelines

---

## Existing Pattern Reference

### Similar Implementation: needs-info Loop
**File**: `protocols/reevaluation.md`  
**Pattern**: 
- Gatekeeper/Architect posts clarifying question
- Adds `needs-info` label
- On next run, scans for issues with `needs-info` label
- Detects human reply (comments after last bot comment)
- Re-routes issue back to appropriate agent

**Adaptation for Review Loop**:
- Architect posts spec + clarification questions
- Adds `needs-review` label (NOT `for-dev`)
- On next run, scans for issues with `needs-review` label
- Detects feedback type:
  - "APPROVED" → Add `for-dev`, remove `needs-review`, EXIT
  - Any other comment → Iterate on spec, re-post, keep `needs-review`

### Comment Detection Pattern
**File**: `docs/plans/TECH_SPEC_3.md` lines 112-137  
**Reusable logic**:
```typescript
function hasHumanReplyAfterBot(comments: GitHubIssue['comments']): boolean {
  // Scan reverse chronologically for last 🤖 comment
  // Return true if any non-bot comments exist after it
}
```

---

## Implementation Roadmap

### Phase 0: Create Review Protocol File

**Action**: Create `protocols/review.md`

**Content Structure** (following `reevaluation.md` pattern):
```markdown
## Architect Review & Approval Protocol

This protocol runs ONLY in the Architect. On every run, after processing new triaged issues, the Architect MUST scan for issues awaiting review.

### FLOW A: Initial Planning (First-Time Issues)
1. Query: `gh issue list --search "is:open label:triaged -label:for-dev -label:needs-review -label:needs-info" --limit 1`
2. Pass Confidence Gate (≥85%)
3. **Generate 2-3 Clarifying Questions**:
   - Identify the 2-3 areas with highest ambiguity potential
   - Frame as specific, answerable questions (not vague)
   - Examples:
     * "Should X behavior apply to Y edge case?"
     * "Which component should own Z responsibility?"
     * "What is the expected behavior when A and B conflict?"
4. Write TECH_SPEC_{number}.md following Zero-Waste Protocol
5. Post spec + clarification questions to issue as single comment:
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
6. Execute: `gh issue edit <number> --add-label needs-review`
7. EXIT (do NOT add `for-dev`)

### FLOW B: Review Loop (Re-Entry for Feedback)
1. Query: `gh issue list --search "is:open label:needs-review" --limit 10`
2. For each issue, fetch: `gh issue view <number> --json number,title,body,labels,comments`
3. **Detect human reply** (reuse pattern from reevaluation.md):
   - Find last comment starting with 🤖
   - Check if any non-bot comments exist after it
   - If NO human reply: skip (still waiting)
   - If YES: proceed to step 4
4. **Determine feedback type**:
   - **Approval Detected** (comment body contains "APPROVED" case-insensitive):
     a. Remove `needs-review`: `gh issue edit <number> --remove-label needs-review`
     b. Add `for-dev`: `gh issue edit <number> --add-label for-dev`
     c. Post acknowledgment: `🤖 Spec approved. Routing to Dev Agent.`
     d. Continue to next issue
   - **Feedback Detected** (any other non-bot comment):
     a. Re-read full issue + all comments (including feedback)
     b. Identify requested changes/clarifications
     c. Update TECH_SPEC_{number}.md incorporating feedback
     d. Post updated spec using same format as FLOW A step 5
     e. Keep `needs-review` label (do NOT remove)
     f. Continue to next issue
5. If no `needs-review` issues exist, output: `{ "flow": "B", "action": "no-review-issues" }`
```

**Rationale**:
- Mirrors proven `reevaluation.md` pattern
- Clear separation of initial planning (FLOW A) vs iteration (FLOW B)
- Explicit approval gate before `for-dev` handoff

---

### Phase 1: Refactor src/planner.ts System Prompt

**Target**: Lines 18-80 (SYSTEM_PROMPT constant)

**Changes**:

#### 1.1: Modify STEP 1 to include dual-flow query
**OLD**:
```
STEP 1: DATA INGESTION
Use the Bash tool to execute:
  gh issue list --search "is:open label:triaged -label:for-dev -label:needs-repro -label:needs-triage -label:needs-info" --limit 1 --json number,title,body
```

**NEW**:
```
STEP 1: DETERMINE WORKFLOW MODE
You operate in TWO flows on each run:

FLOW A — Process New Triaged Issues (First-Time Planning)
FLOW B — Process Review Feedback (Iteration Loop)

Execute BOTH flows sequentially. Start with FLOW A, then FLOW B.

--- FLOW A: NEW TRIAGED ISSUES ---
Query: gh issue list --search "is:open label:triaged -label:for-dev -label:needs-review -label:needs-info" --limit 1 --json number,title,body

If an issue exists:
  1. Fetch full detail: gh issue view <number> --json number,title,body,labels,comments
  2. Proceed to STEP 1.5 (Confidence Gate)

If no issues found:
  Output: { "flow": "A", "action": "skipped-no-new-issues" }
  Proceed to FLOW B.
```

#### 1.2: Keep STEP 1.5 (Confidence Gate) unchanged
No modifications needed - existing logic applies to FLOW A.

#### 1.3: Replace STEP 2 (Technical Planning) with clarification logic
**OLD**:
```
STEP 2: TECHNICAL PLANNING
You must build an implementation blueprint for the human developer.
- INSTRUCTION: You must strictly adhere to the 'Technical Planning: The Zero-Waste Protocol' logic defined in the injected rules. Perform zero-waste codebase traversal and file generation according to those rules.
```

**NEW**:
```
STEP 2: GENERATE CLARIFICATION QUESTIONS
Before writing the spec, identify the 2-3 areas with the highest potential for ambiguity or misalignment.

Examples of high-ambiguity areas:
- Unclear edge case handling (e.g., "What happens if X is null?")
- Multiple valid design approaches (e.g., "Should this be a hook or a component?")
- Unspecified behavior interactions (e.g., "How does this affect existing feature Y?")
- Scope boundary uncertainties (e.g., "Should this include Z or defer to a later issue?")

Frame each as a specific, answerable question. Store these for STEP 4.

STEP 3: TECHNICAL PLANNING
Build the implementation blueprint following the Zero-Waste Protocol exactly as before.
Write to: docs/plans/TECH_SPEC_<number>.md
```

#### 1.4: Replace STEP 3 (Repository Action) with review posting logic
**OLD**:
```
STEP 3: REPOSITORY ACTION
Use the Bash tool to mark your completion back to GitHub:
- Execute: 'gh issue edit <number> --add-label for-dev'
```

**NEW**:
```
STEP 4: POST SPEC FOR REVIEW
Combine the tech spec and clarification questions into a single GitHub comment:

Template:
---
🤖 **Tech Spec Ready for Review**

[Paste full TECH_SPEC_<number>.md content here]

---

**Clarification Questions** (to reduce ambiguity):
1. [Question 1 from STEP 2]
2. [Question 2 from STEP 2]
3. [Question 3 from STEP 2]

Reply "APPROVED" when ready to proceed to implementation, or provide feedback for iteration.
---

Execute:
1. gh issue comment <number> -F docs/plans/TECH_SPEC_<number>.md (if comment body fits in file) OR construct comment string
2. gh issue edit <number> --add-label needs-review

DO NOT add for-dev label at this stage.
```

#### 1.5: Modify STEP 4 (Summary) to reflect new workflow
**OLD**:
```
STEP 4: SUMMARY
Output a structured summary block:
{
  "issueNumber": <number>,
  "action": "spec-written",
  "confidenceScore": <score>,
  "specFile": "docs/plans/TECH_SPEC_<number>.md",
  "filesChanged": ["list of files identified in the spec"]
}
```

**NEW**:
```
STEP 5: FLOW A SUMMARY
Output:
{
  "flow": "A",
  "issueNumber": <number>,
  "action": "spec-posted-for-review",
  "confidenceScore": <score>,
  "specFile": "docs/plans/TECH_SPEC_<number>.md",
  "clarificationQuestions": ["Q1", "Q2", "Q3"],
  "filesChanged": ["list of files identified in the spec"]
}
```

#### 1.6: Add FLOW B logic after STEP 5
**NEW SECTION**:
```
--- FLOW B: REVIEW FEEDBACK LOOP ---
After completing FLOW A (or if no new issues in FLOW A), scan for issues awaiting review:

Query: gh issue list --search "is:open label:needs-review" --limit 10 --json number,title,body

For EACH issue found:
1. Fetch full detail: gh issue view <number> --json number,title,body,labels,comments
2. Detect human reply using the logic from the Review Protocol:
   - Find the last comment whose body starts with "🤖"
   - Check if any subsequent comments exist that do NOT start with "🤖"
   - If NO human reply: skip this issue (still waiting for feedback)
   - If YES: proceed to step 3
3. Determine feedback type:
   
   **CASE 1: APPROVAL**
   If the most recent human comment contains "APPROVED" (case-insensitive):
   a. Remove needs-review label: gh issue edit <number> --remove-label needs-review
   b. Add for-dev label: gh issue edit <number> --add-label for-dev
   c. Post acknowledgment: gh issue comment <number> -b "🤖 Spec approved. Routing to Dev Agent."
   d. Output summary:
      {
        "flow": "B",
        "issueNumber": <number>,
        "action": "approved-routed-to-dev"
      }
   e. Continue to next issue
   
   **CASE 2: FEEDBACK FOR ITERATION**
   If the human comment contains feedback/questions/change requests:
   a. Re-read the existing TECH_SPEC_<number>.md
   b. Re-read the full issue body + ALL comments for context
   c. Identify the requested changes or clarifications
   d. Update TECH_SPEC_<number>.md incorporating the feedback (use Write tool to overwrite)
   e. Post updated spec using the same format as FLOW A STEP 4
   f. Keep the needs-review label (do NOT remove it)
   g. Output summary:
      {
        "flow": "B",
        "issueNumber": <number>,
        "action": "spec-updated-awaiting-re-review",
        "feedbackAddressed": ["summary of changes made"]
      }
   h. Continue to next issue

If no needs-review issues exist:
Output: { "flow": "B", "action": "skipped-no-review-issues" }
```

---

### Phase 2: Update Protocol Injection in planner.ts

**Target**: Lines 11-16, 66-79

**Current**:
```typescript
const PLANNING_PROTO = loadProtocol('planning');
const CONFIDENCE_PROTO = loadProtocol('confidence_gate');
const EPIC_PROTO = loadProtocol('epic_breakdown');

// ... in SYSTEM_PROMPT:
${PLANNING_PROTO}
---
${CONFIDENCE_PROTO}
---
${EPIC_PROTO}
```

**Add**:
```typescript
const REVIEW_PROTO = loadProtocol('review');  // ADD THIS LINE

// ... in SYSTEM_PROMPT, add to injected protocols:
${REVIEW_PROTO}
---
```

**Full new injection block** (lines 66-85):
```
--- INJECTED PROTOCOL RULES ---
${CLAUDE_MD}

---

${REVIEW_PROTO}

---

${PLANNING_PROTO}

---

${CONFIDENCE_PROTO}

---

${EPIC_PROTO}
-------------------------------
```

---

### Phase 3: Testing & Verification

#### 3.1: Create Test Issue
```bash
gh issue create \
  --title "TEST: Review loop validation" \
  --body "This is a test issue to validate the Architect review loop.\n\nExpected behavior:\n1. Architect posts spec + 2-3 questions\n2. Adds needs-review label\n3. Waits for feedback\n4. Iterates on feedback comments\n5. Routes to dev only after APPROVED comment" \
  --label enhancement,triaged
```

#### 3.2: Run Architect (FLOW A - Initial Planning)
```bash
npm run plan
```

**Expected Output**:
```json
{
  "flow": "A",
  "issueNumber": <TEST_NUMBER>,
  "action": "spec-posted-for-review",
  "confidenceScore": <SCORE>,
  "specFile": "docs/plans/TECH_SPEC_<TEST_NUMBER>.md",
  "clarificationQuestions": ["Q1", "Q2", "Q3"],
  "filesChanged": [...]
}
```

**Verify**:
- [ ] Issue has `needs-review` label
- [ ] Issue does NOT have `for-dev` label
- [ ] Comment contains spec + 2-3 clarification questions
- [ ] TECH_SPEC file created in docs/plans/

#### 3.3: Simulate Feedback Iteration
```bash
gh issue comment <TEST_NUMBER> -b "Please add more detail about the X module changes"
```

Run Architect again:
```bash
npm run plan
```

**Expected Output**:
```json
{
  "flow": "B",
  "issueNumber": <TEST_NUMBER>,
  "action": "spec-updated-awaiting-re-review",
  "feedbackAddressed": ["Added detail about X module changes"]
}
```

**Verify**:
- [ ] TECH_SPEC file updated with requested changes
- [ ] New comment posted with updated spec
- [ ] `needs-review` label still present
- [ ] `for-dev` label still absent

#### 3.4: Simulate Approval
```bash
gh issue comment <TEST_NUMBER> -b "APPROVED"
```

Run Architect again:
```bash
npm run plan
```

**Expected Output**:
```json
{
  "flow": "B",
  "issueNumber": <TEST_NUMBER>,
  "action": "approved-routed-to-dev"
}
```

**Verify**:
- [ ] `needs-review` label removed
- [ ] `for-dev` label added
- [ ] Acknowledgment comment posted
- [ ] Dev agent can now pick up the issue

---

## Edge Cases & Considerations

### 1. Multiple Human Comments Before Approval
**Scenario**: User posts 3 feedback comments, then APPROVED
**Behavior**: Architect iterates 3 times (one run per feedback), then routes to dev on 4th run
**Implementation**: FLOW B processes one issue per run - natural batching

### 2. Partial "APPROVED" String
**Scenario**: User comments "Looks APPROVED to me!"
**Behavior**: Should trigger approval (case-insensitive substring match)
**Implementation**: Use `comment.body.toLowerCase().includes('approved')`

### 3. Ambiguous Comment
**Scenario**: User comments "Thanks" (neither feedback nor approval)
**Behavior**: Treat as feedback request - prompt for clarification
**Implementation**: Architect iterates, asks "Does 'Thanks' mean approved or do you need changes?"

### 4. Clarification Questions When Confidence = 100%
**Scenario**: Issue is crystal clear, confidence = 100%, but protocol mandates 2-3 questions
**Behavior**: Generate strategic questions anyway (e.g., "Should we add tests for X edge case?")
**Rationale**: Issue requirement - "even if the score is high"

### 5. Backward Compatibility
**Scenario**: Existing issues with `triaged` label but NO `needs-review`
**Behavior**: FLOW A query excludes them (due to `-label:needs-review`), so they won't be double-processed
**Migration**: None needed - old issues remain untouched

---

## Acceptance Criteria

### Must-Have (Blocking)
- [ ] Architect NEVER adds `for-dev` label automatically after writing spec
- [ ] Architect adds `needs-review` label after posting initial spec
- [ ] Architect posts 2-3 clarification questions with every spec
- [ ] Architect scans `needs-review` issues on every run (FLOW B)
- [ ] Architect detects "APPROVED" comment and routes to dev
- [ ] Architect iterates on non-approval feedback comments
- [ ] `protocols/review.md` created with complete loop logic

### Should-Have (Important)
- [ ] Clarification questions are specific and actionable (not generic)
- [ ] Approval detection is case-insensitive
- [ ] Updated specs include change summary in iteration comment
- [ ] FLOW A and FLOW B both output structured JSON summaries

### Nice-to-Have (Future Enhancement)
- [ ] Track iteration count (e.g., "Iteration 3/∞")
- [ ] Timeout mechanism (e.g., auto-approve after 7 days of inactivity)
- [ ] Diff view between spec iterations

---

## Rollout Strategy

### Phase 1: Protocol File (Low Risk)
1. Create `protocols/review.md`
2. Commit and merge
3. No runtime impact yet

### Phase 2: Planner Refactor (High Risk - Test Thoroughly)
1. Modify `src/planner.ts` system prompt (all changes above)
2. Test with synthetic issue (see Phase 3 of roadmap)
3. Run 3-5 iterations of feedback loop
4. Verify no regressions in FLOW A (initial planning)

### Phase 3: Dogfooding
1. Apply to real triaged issues
2. Monitor for:
   - Stuck issues (needs-review never transitions)
   - Missed approvals (human says "APPROVED" but agent doesn't detect)
   - Runaway iterations (agent keeps iterating unnecessarily)

### Phase 4: Documentation
1. Update CLAUDE.md command descriptions
2. Add review loop diagram to docs/
3. Update README with new workflow

---

## Success Metrics

**Before** (Current State):
- 0% of specs reviewed before dev handoff
- Unknown misalignment rate
- No structured ambiguity reduction

**After** (Target State):
- 100% of specs reviewed before dev handoff
- Measurable feedback iteration rate (target: 1-2 iterations avg)
- 2-3 clarification questions per spec
- <5% approval timeout rate (specs stuck in needs-review)

---

## Implementation Priority: **IMMEDIATE**

**Justification**:
- **Impact = 5**: Affects quality of every issue processed
- **Confidence = 5**: Clear requirements, proven patterns exist
- **Ease = 4**: Moderately complex but well-bounded

**Risk**: Medium (modifies core agent loop)  
**Mitigation**: Thorough testing with synthetic issues before production use

---

## Related Issues / Dependencies
- None (standalone enhancement)

## References
- `protocols/reevaluation.md` - Similar feedback loop pattern
- `docs/plans/TECH_SPEC_3.md` - Comment detection logic
- Issue #2 comments - Clarification context
