# Release Management Protocol

This protocol defines the complete workflow for the autonomous Release Manager agent.

## STEP 1: DISCOVERY

Query for open PRs with approval signals:

```bash
gh pr list --state open --json number,title,headRefName,body,reviews,comments,mergeable,isDraft
```

For each PR, check for approval using TWO methods:

1. **GitHub Approval Review**: `reviews` array contains entry with `state="APPROVED"`
2. **Text-Based Approval**: `comments` array contains entry with body matching `/APPROVED/i`

A PR is considered approved if EITHER condition is true.

---

## STEP 2: PRE-MERGE VALIDATION

Before attempting to merge any approved PR, verify ALL of the following conditions:

1. **Not a Draft**: `isDraft` field is `false`
2. **Mergeable**: `mergeable` field is `MERGEABLE` (not `CONFLICTING` or `UNKNOWN`)
3. **Checks Passed**: Run `gh pr checks {number}` and verify all checks have status `pass` or `success`

### Validation Failure Handling

If ANY validation fails, skip this PR and post an informative comment:

```bash
gh pr comment {number} --body "🤖 **[Release Manager]** Cannot merge: {reason}

Please resolve the issue and re-approve."
```

Possible failure reasons:
- `"PR is marked as draft"`
- `"PR has merge conflicts"`
- `"Required checks have not passed"`

Continue to the next PR in the queue (do not abort entirely).

---

## STEP 3: MERGE

Execute the merge using GitHub CLI:

```bash
gh pr merge {number} --squash --delete-branch
```

**Important**: Use `--squash` to maintain linear history and `--delete-branch` to clean up feature branches automatically.

### Merge Failure Handling

If the merge command exits with non-zero status:
1. Post error comment to PR with details
2. Skip this PR and continue to next
3. Log the failure for manual review

Do NOT proceed to version bumping for a failed merge.

---

## STEP 4: VERSION BUMP

After successful merge, calculate the new version:

### 4.1 Read Current Version

```bash
cat package.json | grep '"version"'
```

Parse the current semver version (e.g., `1.2.3`).

### 4.2 Determine Bump Type

Analyze the merged commits using **Conventional Commits** format:

```bash
git log --oneline -n 20 --format=%s
```

Apply these rules in order:
1. If any commit contains `BREAKING CHANGE:` or `!:` → **MAJOR** bump
2. If any commit starts with `feat:` or `feat(` → **MINOR** bump
3. Otherwise → **PATCH** bump

### 4.3 Calculate New Version

Given current version `major.minor.patch`:
- MAJOR: `(major+1).0.0`
- MINOR: `major.(minor+1).0`
- PATCH: `major.minor.(patch+1)`

### 4.4 Apply Version Bump

```bash
npm version {new_version} --no-git-tag-version
```

The `--no-git-tag-version` flag updates `package.json` without creating a git tag (we'll tag manually in Step 7).

### 4.5 Handle Version Conflicts

Check if the calculated version already exists as a git tag:

```bash
git tag -l "v{new_version}"
```

If the tag exists, increment the patch version once more and recheck until finding an unused version.

---

## STEP 5: CHANGELOG GENERATION

### 5.1 Collect Commits Since Last Release

```bash
git describe --tags --abbrev=0
```

This returns the last tag (e.g., `v1.2.2`). Then:

```bash
git log {last_tag}..HEAD --oneline --format="- %s"
```

### 5.2 Group Commits by Type

Parse commit messages and group into categories:
- **Added**: commits starting with `feat:`
- **Fixed**: commits starting with `fix:`
- **Changed**: commits starting with `refactor:`, `perf:`
- **Deprecated**: commits starting with `deprecate:`
- **Security**: commits starting with `security:`
- **Other**: commits starting with `chore:`, `docs:`, `test:`, `ci:`, `build:`

### 5.3 Format Changelog Entry

Use **Keep a Changelog** format:

```markdown
## [version] - YYYY-MM-DD

### Added
- feat commits here (remove 'feat:' prefix)

### Fixed
- fix commits here (remove 'fix:' prefix)

### Changed
- refactor/perf commits here

### Other
- docs, chore, test commits here
```

### 5.4 Update CHANGELOG.md

**If CHANGELOG.md exists**: Prepend the new entry at the top (after title, before previous entries)

**If CHANGELOG.md does not exist**: Create new file with this structure:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [version] - YYYY-MM-DD
...
```

---

## STEP 6: COMMIT RELEASE CHANGES

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): v{version}" --author "ReleaseManager <release@atomo.ai>"
git push origin main
```

**Critical**: The commit must be authored by `ReleaseManager <release@atomo.ai>` to distinguish automated releases from manual commits.

---

## STEP 7: CREATE GITHUB RELEASE

```bash
gh release create v{version} \
  --title "Release v{version}" \
  --notes "{changelog_excerpt}" \
  --latest
```

The `{changelog_excerpt}` should be the markdown content from the new changelog section (without the version header).

The `--latest` flag marks this as the most recent release.

---

## STEP 8: SUCCESS NOTIFICATION

Post a success comment to the merged PR linking to the release:

```bash
gh pr comment {number} --body "🤖 **[Release Manager]** Successfully released as [v{version}](https://github.com/{owner}/{repo}/releases/tag/v{version})

This PR has been included in the release."
```

---

## ERROR RECOVERY

If any step after merge fails (Steps 4-8):
1. Log detailed error message
2. Post issue comment with error details
3. Do NOT rollback the merge (manual intervention required)
4. Exit with error code

Rationale: Merged PRs should remain merged. Version bumps and releases can be fixed manually if automation fails.

---

## CONCURRENCY HANDLING

**Process PRs sequentially, oldest first.**

Sort approved PRs by number (ascending) and process one at a time. This prevents:
- Race conditions during version bumps
- Merge conflicts from concurrent merges
- Confusing changelog entries

If processing multiple approved PRs, complete the full release cycle (Steps 3-8) for PR #1 before starting PR #2.

---

## NO-OP OPTIMIZATION

Before invoking the LLM agent, perform a deterministic pre-check:

```typescript
function hasApprovedPRs(): boolean {
  const prs = gh('pr list --state open --json number,reviews,comments');
  return prs.some(pr => 
    pr.reviews?.some(r => r.state === 'APPROVED') ||
    pr.comments?.some(c => /APPROVED/i.test(c.body))
  );
}
```

If no approved PRs exist, skip LLM invocation entirely and exit with success.

---

## AUDIT TRAIL

Every release execution should log:
- PRs processed (approved/skipped/failed)
- Version calculations (current → new)
- Changelog sections generated
- GitHub release URL

This creates transparency for debugging and compliance.
