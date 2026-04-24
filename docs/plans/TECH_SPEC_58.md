# TECH_SPEC_58: PM Agent Self-Improvement System (Expanded Scope)

**Priority Score: 12.0** (I=5, C=4, E=1.67)  
**Issue**: #58  
**Type**: Enhancement (Meta-Improvement)  
**Labels**: triaged, enhancement, pm-proposal

---

## Executive Summary

**Original Scope**: Add pre-validation quality gate before issue creation  
**Expanded Scope** (based on feedback): Transform PM agent into self-improving system with three capabilities:

1. **Pre-Validation**: Score proposals before creation (≥80/100 clarity threshold)
2. **Periodic Revalidation**: Review rejected/closed proposals to detect if context changed
3. **Issue Pruning**: Close least relevant open pm-proposals to maintain focus (keep only handful)
4. **Self-Critique**: Analyze validation patterns and adjust rubric weights/thresholds

**Goal**: Evolve PM from "proposal generator" to "strategic portfolio manager" with continuous improvement loop.

---

## Scope Expansion Summary

| Capability | Original Spec | Feedback Addition | Priority |
|------------|---------------|-------------------|----------|
| **Pre-Validation** | ✅ Included | N/A | P0 (Core) |
| **Periodic Revalidation** | ❌ Not included | ✅ "periodically revalidate rejections/closed issues" | P1 (High) |
| **Issue Pruning** | ❌ Not included | ✅ "close least relevant items, keep handful open" | P1 (High) |
| **Self-Critique** | ❌ Not included | ✅ "critique configurations to improve" | P2 (Medium) |

---

## Architecture: The Self-Improvement Loop

```
┌─────────────────────────────────────────────────────────────┐
│                     PM AGENT RUN CYCLE                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PHASE 0: SELF-CRITIQUE (every 3rd run)                    │
│  ├── Analyze validation patterns from last 10 runs         │
│  ├── Identify lowest-performing rubric criterion           │
│  ├── Propose weight adjustments (logged to evolution.log)  │
│  └── Update pm_context/validation_config.json              │
│                                                             │
│  PHASE 1: PORTFOLIO REVALIDATION (every run)               │
│  ├── Scan rejected_proposals.md (last 20)                  │
│  ├── Scan closed pm-proposals (last 30 days)               │
│  ├── Re-score each against current context/roadmap         │
│  ├── If score improved ≥80: Resurrect as new proposal      │
│  └── Log revalidation results to pm_context/revalidation_log.md │
│                                                             │
│  PHASE 2: PORTFOLIO PRUNING (before new proposals)         │
│  ├── Fetch all open pm-proposals (exclude triaged/for-dev) │
│  ├── Score relevance: alignment with roadmap + age + stale │
│  ├── Sort by relevance score (ascending)                   │
│  ├── Close lowest-scoring issues if total > TARGET_MAX     │
│  └── Comment: "🤖 Closing: no longer aligns with roadmap"  │
│                                                             │
│  PHASE 3: DISCOVERY & IDEATION (existing STEPS 1-7)        │
│  └── Generate new proposals...                             │
│                                                             │
│  PHASE 4: PRE-VALIDATION (NEW - from original spec)        │
│  ├── Score each proposal: Problem + Solution + Criteria    │
│  ├── Threshold: ≥80 pass, <80 reject                       │
│  └── Log rejections to rejected_proposals.md               │
│                                                             │
│  PHASE 5: ISSUE CREATION (existing STEP 9.5)               │
│  └── Create GitHub issues only for validated proposals     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Blueprint

### PHASE 0: SELF-CRITIQUE (New Capability)

**Trigger**: Every 3rd PM run (or manual flag `--self-critique`)

**Steps**:

1. **Read Historical Validation Data**:
   - Parse `pm_context/rejected_proposals.md` for last 20 rejections
   - Extract: rejection reasons, score breakdowns
   - Calculate: 
     - Average scores per criterion (Problem, Solution, Criteria)
     - Most common rejection reason
     - Trend: are scores improving or declining?

2. **Identify Configuration Issues**:
   ```
   IF >70% of rejections cite "Unclear success criteria":
     → Success Criteria weight (30%) may be too strict
     → Propose: Reduce to 25%, increase Problem Clarity to 40%
   
   IF average score trending upward (e.g., last 5 runs avg 75, earlier avg 60):
     → PM is learning, no adjustment needed
   
   IF average score stagnant or declining:
     → Threshold (80) may be too low, proposals still getting needs-info
     → Propose: Increase threshold to 85
   ```

3. **Log Proposed Adjustments**:
   - Append to `pm_context/evolution.log`:
     ```
     [2026-04-24] SELF-CRITIQUE RUN #3
     Analysis: 14/20 rejections due to "Unclear success criteria"
     Current Weight: Problem=35%, Solution=35%, Criteria=30%
     Proposed: Problem=40%, Solution=35%, Criteria=25%
     Rationale: Success criteria may be too strict, blocking valuable proposals
     Status: PENDING (requires human approval via validation_config.json)
     ```

4. **Update Configuration** (if `pm_context/validation_config.json` exists):
   - Read existing config
   - If config specifies weight overrides, use them
   - If not, use defaults (35/35/30)
   - Log: "Using weights from validation_config.json: {...}"

**New File**: `pm_context/validation_config.json` (optional, human-editable)
```json
{
  "validationWeights": {
    "problemClarity": 35,
    "solutionSpecificity": 35,
    "successCriteria": 30
  },
  "threshold": 80,
  "lastUpdated": "2026-04-24",
  "reason": "Adjusted based on Run #3 self-critique (too many criteria rejections)"
}
```

---

### PHASE 1: PORTFOLIO REVALIDATION (New Capability)

**Trigger**: Every PM run, before generating new proposals

**Purpose**: Detect if previously rejected/closed proposals have become relevant due to:
- New discoveries in `pm_context/discoveries.md`
- Roadmap evolution
- External market changes
- Codebase changes (new patterns emerged)

**Steps**:

1. **Gather Revalidation Candidates**:
   - **Source A**: Last 20 entries from `pm_context/rejected_proposals.md`
   - **Source B**: Closed `pm-proposal` issues from last 30 days:
     ```bash
     gh issue list --search "is:closed label:pm-proposal closed:>2026-03-24" --limit 30 --json number,title,body,closedAt
     ```

2. **Re-Score Each Candidate**:
   - Extract original proposal content (rationale, implementation sketch, success signal)
   - Apply current validation rubric (may have updated weights from PHASE 0)
   - Compare to current roadmap priorities (from STEP 6)
   - Calculate: `relevanceBoost = alignmentWithCurrentRoadmap ? +10 : 0`
   - Final score: `validationScore + relevanceBoost`

3. **Resurrection Criteria**:
   ```
   IF re-score ≥ 80 AND original score was < 80:
     → Proposal became valid (context changed)
     → Action: Resurrect as new proposal in current run
     → Log: "Resurrected: [title] (original: 72 → new: 85)"
   ```

4. **Deduplication**:
   - Before resurrecting, check if similar proposal already exists in:
     - Current run's generated proposals (STEP 7)
     - Open pm-proposal issues (STEP 4)
   - Use existing deduplication logic from STEP 7.4

5. **Logging**:
   - Append to `pm_context/revalidation_log.md`:
     ```markdown
     ## [2026-04-24] Revalidation Run #3
     
     **Candidates Reviewed**: 25 (20 rejected + 5 closed issues)
     **Resurrected**: 1
       - [#42: Interactive Setup Wizard] - Original score: 72 → New: 85
       - Reason: New discovery (#16) showed user pain point intensified
     
     **Still Irrelevant**: 24
     
     ---
     ```

**Retention**: Keep last 10 revalidation runs in log file

---

### PHASE 2: PORTFOLIO PRUNING (New Capability)

**Trigger**: Every PM run, after revalidation, before new proposal generation

**Purpose**: Maintain focus by closing stale/low-relevance pm-proposals

**Configuration**:
- `TARGET_MAX_OPEN_PM_PROPOSALS = 8` (configurable in validation_config.json)

**Steps**:

1. **Fetch Open PM Proposals**:
   ```bash
   gh issue list --search "is:open label:pm-proposal -label:triaged -label:for-dev -label:needs-info" --limit 50 --json number,title,body,createdAt,updatedAt,comments
   ```

2. **Calculate Relevance Score** (0-100) for each:
   ```
   Alignment with Current Roadmap (0-40 points):
     - Extract proposal's priority/category from body
     - Compare to current ROADMAP.md themes
     - 40: Directly aligns with top priority
     - 20: Tangentially related
     - 0: No alignment
   
   Age Penalty (0-30 points):
     - Fresh (<7 days): 30 points
     - Recent (7-30 days): 20 points
     - Old (30-90 days): 10 points
     - Stale (>90 days): 0 points
   
   Engagement Signal (0-30 points):
     - Has human comments: +30
     - Has reactions: +10
     - No engagement: 0
   
   Total Relevance Score = Alignment + Age + Engagement
   ```

3. **Pruning Decision**:
   ```
   totalOpen = count(open pm-proposals)
   
   IF totalOpen > TARGET_MAX_OPEN_PM_PROPOSALS:
     toClose = totalOpen - TARGET_MAX_OPEN_PM_PROPOSALS
     candidates = sortByRelevanceScore(ascending)  // lowest first
     
     FOR EACH of bottom `toClose` candidates:
       IF relevanceScore < 40:  // safety: don't close engaged proposals
         gh issue close <number>
         gh issue comment <number> -b "🤖 Closing: No longer aligns with current roadmap priorities. Revalidation showed relevance score: <score>/100. Can be reopened if context changes."
       ELSE:
         Log: "Skipped closing #<number> despite pruning target (score: <score>)"
   ```

4. **Logging**:
   - Append to `pm_context/pruning_log.md`:
     ```markdown
     ## [2026-04-24] Pruning Run #3
     
     **Open PM Proposals**: 12
     **Target Max**: 8
     **Closed**: 4
       - #38 (score: 15) - Stale, no alignment
       - #40 (score: 20) - Low engagement, tangential
       - #44 (score: 25) - Old, roadmap shifted
       - #47 (score: 30) - Low relevance
     
     **Kept Open**: 8 (scores: 45-90)
     
     ---
     ```

**Safety Rails**:
- Never close issues with:
  - Human comments in last 7 days
  - Labels: `triaged`, `for-dev`, `needs-review`, `blocked`
  - Mentioned in current ROADMAP.md

---

### PHASE 3: PRE-VALIDATION (Original Spec - Unchanged)

[Keep all content from original TECH_SPEC_58.md Phase 1-3]

---

## Files Affected

### Modified Files
1. **`src/pm.ts`** - Add PHASE 0, 1, 2, and original PHASE 4 (validation)

### New Files
2. **`pm_context/validation_config.json`** (optional, human-editable)
3. **`pm_context/revalidation_log.md`** (auto-generated)
4. **`pm_context/pruning_log.md`** (auto-generated)
5. **`pm_context/rejected_proposals.md`** (from original spec)
6. **`protocols/pm_self_improvement.md`** (recommended - documents all 4 phases)

---

## Acceptance Criteria (Expanded)

### Original Criteria
| Criterion | Implementation | Status |
|-----------|---------------|--------|
| PM validates proposals before creation | PHASE 4: Pre-Validation | ✅ |
| Clarity scoring (problem + solution + criteria = 100) | Rubric: 35% + 35% + 30% | ✅ |
| Threshold: 80/100 | PHASE 4 decision rule | ✅ |
| Rejected proposals logged | rejected_proposals.md | ✅ |

### New Criteria (From Feedback)
| Criterion | Implementation | Status |
|-----------|---------------|--------|
| Periodically revalidate rejections/closed issues | PHASE 1: Portfolio Revalidation | ✅ |
| Close least relevant open pm-proposals | PHASE 2: Portfolio Pruning | ✅ |
| Keep only handful of proposals open | TARGET_MAX = 8 configurable | ✅ |
| Self-critique on configurations | PHASE 0: Analyze patterns, propose adjustments | ✅ |

---

## Edge Cases

### PHASE 0: Self-Critique
- **No rejections yet**: Skip self-critique (need data first)
- **Conflicting patterns**: E.g., 50% cite "unclear criteria", 50% cite "vague solution" → Log both, no auto-adjustment
- **Human overrides**: If validation_config.json exists, respect it (don't auto-adjust)

### PHASE 1: Revalidation
- **Resurrected proposal duplicates new proposal**: Use deduplication logic, keep higher-scoring one
- **Closed issue was closed by human (not bot)**: Respect human decision, don't resurrect
- **Score unchanged**: If re-score still <80, don't resurrect (log: "Still irrelevant")

### PHASE 2: Pruning
- **All open proposals have high scores**: Don't force close if scores >40
- **Tie in relevance scores**: Sort by age (older first)
- **Proposal has `needs-info` label**: Exclude from pruning (waiting for clarification)

---

## Testing Strategy

### Unit Tests
1. **PHASE 0**: Simulate 20 rejections, all citing "unclear criteria" → Verify weight adjustment proposed
2. **PHASE 1**: Mock rejected proposal, change roadmap → Verify re-score increases, proposal resurrected
3. **PHASE 2**: Mock 12 open proposals, TARGET_MAX=8 → Verify 4 lowest-scored closed

### Integration Test
1. Run `npm run pm` three times:
   - Run #1: Normal operation, reject 1 proposal (score: 75)
   - Run #2: Normal operation, change roadmap to align with rejected proposal
   - Run #3: Verify revalidation detects alignment, resurrects proposal, creates issue

---

## Rollout Plan

### Phase 1 (P0): Core Pre-Validation
- Implement original spec (PHASE 4: Pre-Validation)
- Test with manual proposals
- Deploy, monitor for 2-3 runs

### Phase 2 (P1): Portfolio Management
- Implement PHASE 1 (Revalidation) + PHASE 2 (Pruning)
- Test with mock historical data
- Deploy, monitor revalidation_log.md and pruning_log.md

### Phase 3 (P2): Self-Improvement
- Implement PHASE 0 (Self-Critique)
- Document validation_config.json schema
- Deploy, wait for 3 runs, verify self-critique triggers

**Estimated Effort**: 
- Original spec (Pre-Validation): 2-3 hours
- Revalidation + Pruning: 3-4 hours
- Self-Critique: 2 hours
- **Total**: 7-9 hours

---

## Success Metrics

### Immediate (Next Run)
- ✅ Pre-validation executes, rejected_proposals.md created
- ✅ Revalidation scans historical data, revalidation_log.md created
- ✅ Pruning closes stale issues if >TARGET_MAX open

### Short-Term (3-5 Runs)
- 🎯 Needs-info rate <20% (vs 100% baseline)
- 🎯 Resurrected proposals: 1-2 per run (context changes detected)
- 🎯 Open pm-proposals stabilize at ~8 (focused portfolio)

### Long-Term (10+ Runs)
- 🎯 Self-critique proposes weight adjustments (learning signal)
- 🎯 Validation scores trend upward (PM improving)
- 🎯 Closed proposals don't reopen (effective pruning)

---

**Revision History**:
- **2026-04-23 (Initial)**: Original scope (pre-validation only)
- **2026-04-24 (Expanded)**: Incorporated feedback - added revalidation, pruning, self-critique

---

Reply **APPROVED** when ready to proceed to implementation, or provide additional feedback for iteration.
