# Dev Agent: Deterministic PR Review Handler

## Problem

The dev agent creates PRs and labels issues `pr-ready`, but never checks if a reviewer left feedback on those PRs. The triage and planner agents both have deterministic pre-processing steps (`handleNeedsInfoIssues`, `handleReviewIssues`) that run before LLM invocation. The dev agent lacks this.

## Design

### Location

`src/dev.ts` — a new `handlePRReviews()` function that runs before `pickHighestPriorityIssue()`.

### Query

```
gh pr list --search "is:open" --json number,title,headBranch,reviews,comments
```

Filter results to PRs on `atomo/issue-*` branches (the dev agent's naming convention).

### Issue Number Extraction

Parse from branch name `atomo/issue-{N}` or from PR body `Resolves #N`.

### Decision Logic

All handled deterministically in code — no LLM needed.

| State | Detection | Action |
|-------|-----------|--------|
| **Approved** | Latest formal review state is `APPROVED` | Label issue `merged-ready`, remove `pr-ready`, post bot comment |
| **Changes requested** | Latest formal review is `CHANGES_REQUESTED`, OR human comment after last bot comment | Remove `pr-ready` from issue, add back `for-dev`, post bot comment explaining feedback received |
| **No feedback yet** | No reviews or comments after PR creation | Skip, fall through to pick new issues |

### Return Type

```typescript
type PRReviewResult =
  | { outcome: 'no-pr-reviews' }
  | { outcome: 'waiting-for-review'; prNumber: number }
  | { outcome: 'approved'; prNumber: number; issueNumber: number }
  | { outcome: 'changes-requested'; prNumber: number; issueNumber: number }
```

Mirrors planner's `ReviewResult` pattern.

### Execution Flow

```
dev.ts main()
  1. handlePRReviews()           # deterministic
  2. if approved/changes-requested → handle in code, exit
  3. if no-pr-reviews/waiting    → fall through
  4. pickHighestPriorityIssue()  # existing logic
  5. runAgent(...)               # LLM implementation
```

### Label Transitions

- **Approved:** `pr-ready` -> `merged-ready` (human merges manually)
- **Changes requested:** `pr-ready` -> `for-dev` (dev agent picks up on next run with updated context)

### Dependencies

- Reuses `gh()` and `hasHumanReplyAfterBot()` from `src/github.ts`
- No new protocols needed — this is pure orchestration logic

### What This Does NOT Do

- Does not auto-merge PRs (human responsibility)
- Does not invoke the LLM to address feedback (re-labels to `for-dev` for next run)
- Does not create new protocols or modify existing ones
