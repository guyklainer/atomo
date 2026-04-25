# PM Agent Self-Improvement Protocol

**Version**: 1.0  
**Last Updated**: 2026-04-24  
**Issue**: #58

---

## Overview

This protocol transforms the PM Agent from a "proposal generator" into a "strategic portfolio manager" with continuous self-improvement capabilities. It introduces quality gates, revalidation loops, portfolio pruning, and meta-learning.

## Token Budget

**Maximum tokens per run: 15,000.** The PM agent must load context files lazily:
- On every run: read only `pm_context/domain.md` and `pm_context/capabilities.md`
- In PHASE 0 (Self-Critique runs only): additionally read `pm_context/rejected_proposals.md`
- In PHASE 1 (Revalidation): additionally read `pm_context/rejected_proposals.md` and `pm_context/revalidation_log.md`
- In PHASE 2 (Pruning): no additional context files needed beyond GitHub API calls
- In STEP 1-7 (Discovery): read `pm_context/discoveries.md`, `pm_context/external_research.md` and `pm_context/cross_session_ideas.md` only when generating proposals — not upfront

Never read all pm_context files at the start of a run. Load each file only at the phase that requires it.

## Architecture

The PM Agent now operates in an enhanced cycle with 4 new phases inserted into the existing workflow:

```
PHASE 0: Self-Critique (every 3rd run)
    ↓
PHASE 1: Portfolio Revalidation (every run)
    ↓
PHASE 2: Portfolio Pruning (every run)
    ↓
STEP 1-7: Discovery & Idea Generation (existing)
    ↓
PHASE 4: Pre-Validation (every run)
    ↓
STEP 9.5: Create GitHub Issues (only for validated proposals)
    ↓
STEP 10: Output Summary (enhanced with validation metrics)
```

---

## PHASE 0: Self-Critique

### Purpose
Analyze historical validation patterns to identify configuration issues and propose improvements.

### Trigger
Every 3rd run (check `pm_context/evolution.log` entry count modulo 3).

### Process

1. **Parse Historical Data**: Extract last 20 rejections from `pm_context/rejected_proposals.md`
2. **Calculate Metrics**:
   - Average score per criterion (Problem, Solution, Criteria)
   - Most common rejection reason (frequency count)
   - Score trend (recent 5 vs. earlier rejections)

3. **Identify Issues**:
   - **Rule 1**: >70% rejections cite same criterion → that weight may be too strict
   - **Rule 2**: Average score trending upward ≥5 points → quality improving
   - **Rule 3**: Average score stagnant/declining → threshold may be too low
   - **Rule 4**: <5 rejections total → insufficient data, skip

4. **Log Proposals**: Append to `pm_context/evolution.log` (human reviews and applies manually via `validation_config.json`)

### Safety
- **Never auto-apply** configuration changes
- Respect human overrides in `validation_config.json`
- Skip if insufficient data (<5 rejections)

---

## PHASE 1: Portfolio Revalidation

### Purpose
Detect if previously rejected/closed proposals have become relevant due to context changes (roadmap evolution, new discoveries, market shifts).

### Trigger
Every run, before generating new proposals.

### Process

1. **Gather Candidates**:
   - Source A: Last 20 entries from `pm_context/rejected_proposals.md`
   - Source B: Closed `pm-proposal` issues from last 30 days (via `gh issue list`)

2. **Re-Score**: Apply current validation rubric (weights may have changed via `validation_config.json`)
   - Add relevance boost (+10 points) if aligns with current roadmap priorities

3. **Resurrection Criteria**:
   ```
   IF (new_score >= threshold) AND (original_score < threshold):
       → Context changed, proposal now valid
       → Check for duplicates (avoid re-creating existing issues)
       → Add to resurrected_proposals array
   ```

4. **Logging**: Append to `pm_context/revalidation_log.md` (keep last 10 runs)

5. **Merge**: Resurrected proposals added to STEP 7 proposal pool (marked as pre-validated)

### Safety
- **Respect human decisions**: Skip proposals closed by human comments in last 7 days
- **Deduplication**: Check against open pm-proposals before resurrecting
- **Limit**: Ensure total proposals (new + resurrected) ≤ 3

---

## PHASE 2: Portfolio Pruning

### Purpose
Close stale/low-relevance pm-proposals to maintain focus on high-quality backlog.

### Trigger
Every run, after revalidation, before generating new proposals.

### Configuration
- `targetMaxOpenProposals`: Default 8 (configurable in `validation_config.json`)

### Process

1. **Fetch Open Proposals**: `gh issue list` (exclude `triaged`, `for-dev`, `needs-info` labels)

2. **Calculate Relevance Score** (0-100):
   - **Alignment with Roadmap** (0-40 pts): High priority = 40, Medium = 30, Low = 20, Tangential = 10, None = 0
   - **Age Penalty** (0-30 pts): <7 days = 30, 7-30 days = 20, 30-90 days = 10, >90 days = 0
   - **Engagement Signal** (0-30 pts): Human comments = +30, Reactions = +10, None = 0

3. **Pruning Decision**:
   ```
   IF totalOpenProposals > targetMaxOpenProposals:
       toClose = totalOpenProposals - targetMaxOpenProposals
       Sort by relevanceScore (ascending)
       Close bottom <toClose> proposals (if score < 40)
       Comment: "🤖 Closing: No longer aligns with roadmap (score: X/100)"
   ```

4. **Logging**: Append to `pm_context/pruning_log.md` (keep last 10 runs)

### Safety Rails
- **Never close** if:
  - Human comments in last 7 days
  - Labels: `triaged`, `for-dev`, `needs-review`, `blocked`
  - Mentioned in current `ROADMAP.md`
  - Relevance score ≥ 40 (too engaged/relevant)

---

## PHASE 3.5: Exploration Budget Enforcement

### Purpose
Cap total token consumption during the discovery + ideation phases. A single PM run must not exceed 15,000 combined tokens (input + output).

### Rules

1. **Tool call budget**: Stop discovery after **25 total tool calls** across all phases (Bash, Read, Grep, Glob combined). At call #25, cease exploration and proceed to STEP 7 (Idea Generation) with data gathered so far.
2. **Proposal target**: Generate **1–3 proposals** per run. Do NOT enumerate every possible improvement — depth over breadth.
3. **Write-up length**: Each proposal must include ONLY the three rubric sections (Problem Clarity, Solution Specificity, Success Criteria). No supplemental market research sections, no rationale appendices.
4. **Self-check before PHASE 4**: Confirm total tool calls are ≤ 25. If over budget, drop the lowest-priority proposals before proceeding to validation.

---

## PHASE 4: Pre-Validation

### Purpose
Quality gate before GitHub issue creation. Only proposals scoring ≥threshold pass.

### Trigger
Every run, after STEP 7 (Idea Generation), before STEP 9.5 (Issue Creation).

### Validation Rubric

**Default Weights** (configurable via `validation_config.json`):
- Problem Clarity: 35%
- Solution Specificity: 35%
- Success Criteria: 30%
- **Threshold**: 80/100

### Scoring Process

For each proposal:

1. **Problem Clarity** (0-35 points):
   - 35 pts: Specific user pain + quantifiable impact + concrete scenario
   - 21 pts: General problem with some specifics
   - 10.5 pts: Vague problem
   - 0 pts: No clear problem

2. **Solution Specificity** (0-35 points):
   - 35 pts: Names files/modules + integration points + scope estimate
   - 21 pts: High-level approach with some technical detail
   - 10.5 pts: Hand-wavy solution
   - 0 pts: No solution approach

3. **Success Criteria** (0-30 points):
   - 30 pts: Specific metric OR observable behavior change
   - 18 pts: Directional metric
   - 9 pts: Vague success
   - 0 pts: No success criteria

**Total**: Sum of 3 scores (0-100)

### Categorization

- **Score ≥ threshold**: PASSED → Create GitHub issue
- **Score < threshold**: REJECTED → Log to `pm_context/rejected_proposals.md`

### Rejection Reasons

Identify lowest-scoring criterion:
- Lowest = Problem Clarity → "Unclear problem definition"
- Lowest = Solution Specificity → "Vague solution approach"
- Lowest = Success Criteria → "Missing measurable success criteria"

### Logging

**Rejected Proposals**: Append to `pm_context/rejected_proposals.md`
```markdown
## [YYYY-MM-DD] Rejected: [Proposal Title]

**Score**: X/100 (Problem: Y, Solution: Z, Criteria: W)
**Reason**: [rejection reason]

**Rationale**: [...]
**Implementation Sketch**: [...]
**Success Signal**: [...]

---
```

**Retention**: Keep last 20 rejections (prune oldest when >20).

---

## Context Files

### New Files Created

1. **pm_context/rejected_proposals.md** (auto-generated)
   - Tracks proposals that failed validation
   - Retention: Last 20 entries

2. **pm_context/revalidation_log.md** (auto-generated)
   - Tracks revalidation runs and resurrected proposals
   - Retention: Last 10 runs

3. **pm_context/pruning_log.md** (auto-generated)
   - Tracks portfolio pruning actions
   - Retention: Last 10 runs

4. **pm_context/validation_config.json** (optional, human-editable)
   - Overrides default validation weights/thresholds
   - Schema:
     ```json
     {
       "validationWeights": {
         "problemClarity": 35,
         "solutionSpecificity": 35,
         "successCriteria": 30
       },
       "threshold": 80,
       "targetMaxOpenProposals": 8,
       "lastUpdated": "YYYY-MM-DD",
       "reason": "Why these values were chosen"
     }
     ```

---

## Success Metrics

### Immediate (Next Run)
- ✅ Pre-validation executes without errors
- ✅ Rejected proposals logged to `rejected_proposals.md`
- ✅ Revalidation scans historical data
- ✅ Pruning closes stale issues if >targetMax

### Short-Term (3-5 Runs)
- 🎯 Needs-info rate <20% (vs 100% baseline before this protocol)
- 🎯 Resurrected proposals: 1-2 per run (context changes detected)
- 🎯 Open pm-proposals stabilize at ~8 (focused portfolio)

### Long-Term (10+ Runs)
- 🎯 Self-critique proposes weight adjustments (learning signal)
- 🎯 Validation scores trend upward (PM improving)
- 🎯 Closed proposals don't need reopening (effective pruning)

---

## Edge Cases

### PHASE 0: Self-Critique
- **No rejections yet**: Skip (need ≥5 rejections for data)
- **Conflicting patterns**: Log both, no auto-adjustment
- **Human config exists**: Respect `validation_config.json`, don't override

### PHASE 1: Revalidation
- **Resurrected duplicates new proposal**: Keep higher-scoring one
- **Human closed issue**: Respect decision, don't resurrect if human commented
- **Score unchanged**: If re-score still <threshold, don't resurrect

### PHASE 2: Pruning
- **All proposals high-scoring**: Don't force close if scores ≥40
- **Tie in scores**: Sort by age (older first)
- **Needs-info label**: Exclude from pruning (waiting for clarification)

### PHASE 4: Pre-Validation
- **All proposals fail**: Create 0 GitHub issues (quality over quantity)
- **Partial pass**: Create issues only for passing proposals
- **Resurrected proposals**: Skip validation (already passed in previous context)

---

## Rollout Phases

**Phase 1 (P0)**: Core Pre-Validation
- ✅ Implemented PHASE 4
- ✅ New context files created
- ✅ STEP 9.5 filters by validation
- ✅ STEP 10 includes validation metrics

**Phase 2 (P1)**: Portfolio Management
- ✅ Implemented PHASE 1 (Revalidation)
- ✅ Implemented PHASE 2 (Pruning)
- ✅ Revalidation/pruning logs created

**Phase 3 (P2)**: Self-Improvement
- ✅ Implemented PHASE 0 (Self-Critique)
- ✅ Evolution log includes self-critique entries
- ⚠️ Human must manually apply config changes

---

## Integration with Existing Protocols

This protocol extends but does not replace existing PM Agent behavior. It adds:
- **Quality Gates** (inspired by Confidence Gate Protocol)
- **Portfolio Management** (new capability)
- **Meta-Learning** (new capability)

Existing discovery/ideation/roadmap logic (STEP 1-7, 8-9) remains unchanged.

---

## Maintenance

**Configuration Tuning**:
- Review `evolution.log` every 3 runs for self-critique insights
- Adjust `validation_config.json` if rejection patterns indicate miscalibration
- Monitor `revalidation_log.md` for resurrect frequency (should be 1-2 per run, not 10+)

**Context File Cleanup**:
- Retention policies are automatic (last 10/20 entries)
- No manual cleanup required
- Files are append-only with auto-pruning

---

## References

- **Issue #58**: Original feature request and tech spec
- **Confidence Gate Protocol** (`protocols/confidence_gate.md`): Weighted scoring pattern
- **Zero-Waste Protocol** (`protocols/planning.md`): Progressive disclosure principle
