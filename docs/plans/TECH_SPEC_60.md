# TECH_SPEC_60: .env.example Template (Quick Win)

**Priority: 20.0** (I=4, C=5, E=1)  
**Issue**: #60  
**Type**: Documentation / Enhancement  
**Estimated Effort**: 10 minutes

---

## Root Cause / Requirements

**Problem**: No `.env.example` template exists in the repository, causing onboarding friction for new users who must discover required environment variables through trial-and-error or code inspection.

**Impact**: 
- Every new user must manually inspect code to find required env vars
- Unprofessional first impression (`.env.example` is Node.js standard)
- Increased abandonment during setup
- Missing enterprise readiness signal

**Solution**: Create comprehensive `.env.example` with all required and optional environment variables, including inline comments explaining purpose and where to obtain values. Update README.md to reference .env.example for easier onboarding.

---

## Current State Analysis

**Environment Variables in Use** (from codebase grep):
1. **`ANTHROPIC_API_KEY`** (required)
   - Used in: `scripts/init.ts:61`, all agent files
   - Validation: Hard check with error message in init script
   - Purpose: Authentication for Claude API

2. **`TARGET_REPO_PATH`** (optional)
   - Used in: `scripts/init.ts:69`, `src/planner.ts:24,277`, `src/pm.ts:517`, `src/dev.ts:18`
   - Fallback: `process.cwd()`
   - Purpose: Path to the repository the agents will manage

**Existing Infrastructure**:
- `.env` file exists (currently contains only commented TARGET_REPO_PATH)
- `.gitignore` properly ignores `.env` (line 2)
- `dotenv/config` loaded in `scripts/init.ts:1`
- Init script provides helpful setup validation
- **README.md exists** (lines 38-57 contain Installation section with manual .env setup)

**Documentation Gap**:
- README.md shows manual .env creation via heredoc (lines 48-53)
- Should be simplified to reference .env.example instead
- No .env.example file exists yet

---

## Files to Change

### 1. **`.env.example`** (NEW FILE - Root directory)
**Action**: Create comprehensive template

**Content Structure**:
```bash
# =============================================================================
# Atomo Agent Configuration
# =============================================================================
# Copy this file to .env and fill in your values:
#   cp .env.example .env
#
# Never commit .env (it's in .gitignore)
# =============================================================================

# -----------------------------------------------------------------------------
# REQUIRED: Anthropic API Key
# -----------------------------------------------------------------------------
# Get your API key from: https://console.anthropic.com/settings/keys
# The agents use Claude 3.5 Sonnet for autonomous operations
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# -----------------------------------------------------------------------------
# OPTIONAL: Target Repository Path
# -----------------------------------------------------------------------------
# Path to the GitHub repository the agents will manage
# If not set, defaults to the current working directory
# Example: /home/user/projects/my-repo
# TARGET_REPO_PATH=/path/to/your/target/repository
```

**Rationale**:
- Clear section headers with visual separators
- Inline comments explain purpose AND where to get values
- Example values are obvious placeholders (not confusing)
- Optional vars shown commented out (standard pattern)
- Copy-paste command included at top
- Reminds users .env is gitignored

### 2. **`README.md`** (MODIFY - Lines 48-53)
**Action**: Replace manual heredoc with .env.example reference

**Current (Lines 48-53)**:
```bash
# Setup environment variables
# Requires ANTHROPIC_API_KEY and TARGET_REPO_PATH
cat << 'EOF' > .env
ANTHROPIC_API_KEY=your_key_here
TARGET_REPO_PATH=/absolute/path/to/target/project
EOF
```

**Updated**:
```bash
# Setup environment variables
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY and TARGET_REPO_PATH
```

**Rationale**:
- Simpler onboarding (one command instead of heredoc)
- Directs users to .env.example which has better documentation
- Maintains same line count (minimal diff)
- Follows standard Node.js convention

### 3. **`.gitignore`** (VERIFY ONLY - No changes needed)
**Action**: Validation check (already contains `.env` on line 2)

---

## Implementation Pseudo-Code

```typescript
// STEP 1: Create .env.example file
// Location: /home/guyklainer/Developer/atomo/.env.example
// Content: [Full template from section above]
// Tool: Write tool

// STEP 2: Update README.md
// Location: /home/guyklainer/Developer/atomo/README.md
// Action: Replace lines 48-53 with simplified .env.example reference
// Tool: Edit tool (or Read + Write)

// STEP 3: Verify .gitignore contains .env
// Tool: Read .gitignore
// Expected: Line 2 contains ".env"
// Action: If missing, add; if present, skip (already present - no action needed)
```

---

## Pattern Discovery

**Searched for**: Similar .env.example patterns in Node.js ecosystem

**Standard Conventions Applied**:
1. ✅ Section headers with clear visual separators (`# ===...`)
2. ✅ Required vs Optional variable grouping
3. ✅ Inline comments for each variable explaining:
   - What it's for
   - Where to get it
   - Example values or format
4. ✅ Optional vars shown commented out
5. ✅ Copy-paste instructions at top
6. ✅ Security reminder about .gitignore

**Consistency with Codebase**:
- Matches existing `.env` structure (single commented line for TARGET_REPO_PATH)
- Aligns with `scripts/init.ts` validation logic (checks ANTHROPIC_API_KEY first)
- Uses same variable names as codebase (verified via grep)
- Integrates with existing README.md Installation section

---

## Acceptance Criteria Mapping

| Criterion | Status | Implementation |
|-----------|--------|----------------|
| `.env.example` exists in root | ✅ | Create file with Write tool |
| All required vars: `ANTHROPIC_API_KEY`, `TARGET_REPO_PATH` | ✅ | Both included with sections |
| Comments explain each var's purpose | ✅ | Inline comments + where to get values |
| README links to `.env.example` in Quick Start | ✅ | Update README.md lines 48-53 |
| Example values provided (dummy/placeholder data) | ✅ | `your_anthropic_api_key_here`, commented path |

---

## Risk Assessment

**Low Risk** - No existing functionality affected
- Creating new file + updating documentation only
- No code changes required
- Standard industry practice
- Fully reversible

**Edge Cases**:
1. ✅ **README Integration**: README.md now exists, will be updated
2. ✅ **Gitignore**: Already properly configured
3. ✅ **Variable completeness**: Grepped codebase for all process.env references

---

## Post-Implementation Validation

```bash
# Test 1: File exists
test -f .env.example && echo "✅ .env.example exists"

# Test 2: Contains required variables
grep -q "ANTHROPIC_API_KEY" .env.example && echo "✅ ANTHROPIC_API_KEY documented"
grep -q "TARGET_REPO_PATH" .env.example && echo "✅ TARGET_REPO_PATH documented"

# Test 3: README references .env.example
grep -q "cp .env.example .env" README.md && echo "✅ README links to .env.example"

# Test 4: New user simulation
cp .env.example .env
# Edit .env with real values
npm run triage  # Should work if ANTHROPIC_API_KEY is set
```

---

## Dependencies

**Blocks**: None  
**Blocked By**: None  
**Related Issues**: 
- #46 (Interactive Setup Wizard) - This is a standalone quick win extracted from broader wizard scope

---

## Notes for Implementation

1. **README Update**: Update lines 48-53 to reference .env.example (simplified onboarding)
2. **Future Additions**: If new env vars are added to codebase, `.env.example` should be updated in same PR
3. **Validation Enhancement**: Consider adding `.env.example` check to `scripts/init.ts` in future (not in scope for this issue)

---

## Revision History

- **2026-04-23 (Initial)**: Created tech spec, noted missing README
- **2026-04-24 (Updated)**: Incorporated feedback - README.md now exists (added in commit db6303b), updated spec to include README modification
