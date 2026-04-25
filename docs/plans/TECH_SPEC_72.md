# TECH_SPEC_72: Release Manager Agent

**Priority Score: 5.3** (I=4, C=4, E=3)  
**Issue**: #72  
**Type**: Enhancement  
**Status**: Ready for Review

---

## Requirements

From issue #72 and clarification:

**Core Functionality:**
1. Detect when a PR is approved via:
   - GitHub approval reviews (state=APPROVED)
   - "APPROVED" comment text (case-insensitive)
2. Automatically merge approved PRs
3. Post-merge release tasks:
   - Version bump in package.json (using semver)
   - Changelog generation (from commit history)
   - GitHub release creation
   - **Exclude**: npm publish (not needed for this project)

**Expected Behavior:**
- Run periodically (via `npm run release`)
- Query open PRs
- Identify approved ones
- Merge and release automatically
- Handle errors gracefully (don't release on test failures, merge conflicts, etc.)

---

## Root Cause Analysis

**Current State:**
- No automated release workflow exists
- PRs require manual merge + manual version bumping + manual release creation
- Inconsistent release process leads to drift between merged PRs and published releases

**Gap:**
- Need autonomous agent that can detect approval signals and execute the full release workflow

---

## Pattern Discovery

**Existing Agent Patterns** (from codebase scan):

1. **Agent Structure** (from src/triage.ts, src/planner.ts):
   - Import `runAgent` from `./runner.js`
   - Import `gh` utility from `./github.js`
   - Load protocol files using `fs.readFileSync`
   - Define SYSTEM_PROMPT with injected protocols
   - Export async IIFE that calls `runAgent(name, prompt, options)`

2. **GitHub Interaction** (from src/github.ts):
   - Use `gh()` helper for all GitHub CLI commands
   - Parse JSON responses with `--json` flag
   - GitHubPR interface available: `{ number, title, headRefName, body, reviews[], comments[] }`
   - PR reviews have `state` field (e.g., "APPROVED")

3. **Branching Strategy** (from protocols/atomo_dev.md):
   - Agents work on feature branches (e.g., `atomo/issue-{N}`)
   - Never modify main directly
   - Commit with custom author: `--author "AgentName <agent@atomo.ai>"`
   - Push to origin and create PRs

4. **Error Handling** (from src/runner.ts):
   - Retries on overloaded_error (exponential backoff)
   - Logs to daily log files in logs/{agentName}/
   - Appends JSONL events to logs/events/{date}.jsonl

---

## Target Files

### Files to CREATE:
1. **src/release.ts** — Main release manager agent
2. **protocols/release.md** — Release workflow protocol (optional but recommended for consistency)

### Files to MODIFY:
1. **package.json** — Add `"release": "tsx src/release.ts"` script

### Files to READ (for context):
- src/github.ts — Reuse gh() helper and GitHubPR interface
- src/runner.ts — Reuse runAgent() orchestrator
- package.json — Read current version, update after merge

---

## Implementation Roadmap

### Phase 1: Skeleton Setup

**1.1 Create src/release.ts**

```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { gh, type GitHubPR } from './github.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const targetCwd = process.env.TARGET_REPO_PATH || process.cwd();

// Load protocol (to be created in Phase 2)
const loadProtocol = (name: string) => {
  const protocolPath = path.join(__dirname, `../protocols/${name}.md`);
  return fs.existsSync(protocolPath) ? fs.readFileSync(protocolPath, 'utf-8') : '';
};

const RELEASE_PROTO = loadProtocol('release');

const SYSTEM_PROMPT = `
You are the autonomous Release Manager.
Your objective is to detect approved PRs, merge them, and execute the full release workflow.

Follow the 'Release Management Protocol' defined in the injected rules below.

---

## INJECTED PROTOCOL RULES
${RELEASE_PROTO || '(Protocol file not found — proceeding with inline workflow)'}
`;

// Deterministic pre-check: are there any approved PRs?
function hasApprovedPRs(): boolean {
  const prs: GitHubPR[] = gh(
    'pr list --state open --json number,reviews,comments',
    targetCwd
  );
  
  if (!prs || prs.length === 0) return false;
  
  return prs.some(pr => {
    // Check for GitHub approval review
    const hasApprovalReview = pr.reviews?.some(r => r.state === 'APPROVED');
    
    // Check for "APPROVED" comment
    const hasApprovedComment = pr.comments?.some(c => 
      c.body.toUpperCase().includes('APPROVED')
    );
    
    return hasApprovalReview || hasApprovedComment;
  });
}

(async () => {
  if (!hasApprovedPRs()) {
    console.log('[Release Manager] No approved PRs found. Skipping LLM invocation.');
    return;
  }
  
  await runAgent('ReleaseManager', SYSTEM_PROMPT, {
    model: 'claude-sonnet-4-5',
    tools: ['Bash', 'Read', 'Write', 'Grep'],
    allowedTools: ['Bash', 'Read', 'Write', 'Grep']
  });
})().catch(console.error);
```

**1.2 Update package.json**

Add to scripts block:
```json
"release": "tsx src/release.ts"
```

---

### Phase 2: Protocol Definition

**2.1 Create protocols/release.md**

```markdown
## Release Management Protocol

### STEP 1: DISCOVERY
Query for open PRs with approval signals:
```bash
gh pr list --state open --json number,title,headRefName,body,reviews,comments
```

For each PR, check:
1. **Approval Review**: reviews array contains entry with state="APPROVED"
2. **Approval Comment**: comments array contains entry with body matching /APPROVED/i

### STEP 2: PRE-MERGE VALIDATION
Before merging, verify:
1. PR has no merge conflicts: `gh pr view {number} --json mergeable`
2. All checks passed: `gh pr checks {number}`
3. Not a draft PR: `gh pr view {number} --json isDraft`

If validation fails, skip this PR and post a comment:
```bash
gh pr comment {number} --body "🤖 **[Release Manager]** Cannot merge: {reason}"
```

### STEP 3: MERGE
Execute merge:
```bash
gh pr merge {number} --auto --squash --delete-branch
```

If merge fails, abort and post error comment.

### STEP 4: VERSION BUMP
1. Read current version from package.json
2. Parse merged commits to determine bump type:
   - Conventional Commits format: `feat:` = minor, `fix:` = patch, `BREAKING:` = major
   - Fallback: patch bump
3. Calculate new version using semver
4. Update package.json: `npm version {new_version} --no-git-tag-version`

### STEP 5: CHANGELOG GENERATION
1. Get commits since last release: `git log {last_tag}..HEAD --oneline`
2. Group by type (feat, fix, docs, chore, etc.)
3. Create/update CHANGELOG.md in Keep-a-Changelog format:
   ```
   ## [version] - YYYY-MM-DD
   ### Added
   - feat commits
   ### Fixed
   - fix commits
   ```

### STEP 6: COMMIT RELEASE CHANGES
```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): v{version}" --author "ReleaseManager <release@atomo.ai>"
git push origin main
```

### STEP 7: CREATE GITHUB RELEASE
```bash
gh release create v{version} --title "Release v{version}" --notes "{changelog_excerpt}" --latest
```

### STEP 8: CLEANUP
Post success comment to merged PR:
```bash
gh pr comment {number} --body "🤖 **[Release Manager]** Released as v{version}"
```
```

---

### Phase 3: Error Handling & Edge Cases

**3.1 Handle Multiple Approved PRs**
- Process PRs sequentially (oldest first)
- If first merge fails, skip remaining PRs and report error
- Rationale: Avoid cascading failures from merge conflicts

**3.2 Handle Missing Conventional Commits**
- Default to patch bump if no conventional commit format detected
- Log warning: "No conventional commit format found, defaulting to patch bump"

**3.3 Handle Existing CHANGELOG.md**
- If CHANGELOG.md exists: prepend new section at top
- If missing: create new file with initial entry

**3.4 Handle Version Conflicts**
- If calculated version already exists as git tag, increment patch again
- Example: if v1.2.0 exists, and we calculate v1.2.0, use v1.2.1 instead

---

### Phase 4: Testing Strategy

**4.1 Unit Tests** (if test framework exists)
- Test version calculation logic (semver bump)
- Test conventional commit parsing
- Test changelog formatting

**4.2 Integration Tests**
- Mock gh CLI responses
- Test full workflow: discover → merge → version → changelog → release

**4.3 Manual Testing**
- Create test PR in repo
- Add "APPROVED" comment
- Run `npm run release`
- Verify merge, version bump, changelog, GitHub release

---

## Acceptance Criteria

- [ ] `npm run release` command exists in package.json
- [ ] Agent detects PRs with GitHub approval reviews
- [ ] Agent detects PRs with "APPROVED" comment text
- [ ] Agent merges approved PRs using gh CLI
- [ ] Agent updates package.json version using semver
- [ ] Agent generates/updates CHANGELOG.md
- [ ] Agent creates GitHub release with version tag
- [ ] Agent posts success comment to merged PR
- [ ] Agent skips if no approved PRs exist (no-op)
- [ ] Agent handles merge conflicts gracefully (posts error, skips)

---

## Dependencies

**External:**
- GitHub CLI (gh) — already installed (used by other agents)
- Git — already available
- Node.js — already available

**Internal:**
- src/runner.ts — runAgent() orchestrator (exists)
- src/github.ts — gh() helper, GitHubPR interface (exists)

**Optional:**
- semver library — for version calculation (can use manual parsing or install package)

---

## Estimated Effort

**Time**: 4-6 hours  
**Complexity**: Medium  
**Risk**: Low-Medium

**Breakdown:**
- Phase 1 (Skeleton): 1 hour
- Phase 2 (Protocol): 1 hour
- Phase 3 (Error Handling): 1-2 hours
- Phase 4 (Testing): 1-2 hours

**Risk Factors:**
- Merge conflicts (mitigated by pre-merge validation)
- Version calculation edge cases (mitigated by fallback to patch bump)
- Concurrent merges (mitigated by sequential processing)

---

## Migration Notes

**Backwards Compatibility:**
- Agent is additive (no breaking changes)
- Existing manual release process still works
- Can run in parallel with manual releases (agent checks git tags)

**Rollout Strategy:**
1. Merge this spec and implementation
2. Test on a single PR manually
3. Add to cron job (if automated runs desired)
4. Monitor first few automated releases
5. Iterate on changelog format based on feedback

---

## References

- Issue: #72
- Related Protocols: protocols/atomo_dev.md (branching strategy)
- GitHub CLI Docs: https://cli.github.com/manual/gh_pr_merge
- Semver Spec: https://semver.org/
- Keep-a-Changelog: https://keepachangelog.com/
