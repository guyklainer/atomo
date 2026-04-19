# TECH SPEC #1: Implement Atomo Visionary PM Agent

**Priority: 9.0** (I=5, C=5, E=2.8)

---

## Issue Reference
- **Number**: #1
- **Title**: feat: Implement Atomo PM Agent
- **Type**: Enhancement
- **Confidence Score**: 95%

---

## Requirements Summary

### Core Vision (Updated per User Feedback - Iteration 2)
Create a **visionary Product Manager agent** that:
1. **Thinks of completely new features** (not just gap-finding in code)
2. **Demonstrates market expertise** via **external knowledge integration** (industry trends, competitor analysis)
3. **Masters current capabilities and limitations** through deep codebase analysis
4. **Tracks previous ideas** to avoid repetition (checks closed AND open issues/PRs)
5. **Maintains evolving context** via **modular, intelligent context files** (not growing indefinitely)

### Key Design Updates (Iteration 2)
| Aspect | Previous Design | Updated Design (Per User Feedback) |
|--------|----------------|-----------------------------------|
| **Market Knowledge** | Codebase domain analysis only | **External knowledge**: industry trends, competitor analysis |
| **Context Storage** | Single PM_CONTEXT.md | **Modular files**: domain.md, capabilities.md, discoveries.md, etc. |
| **Context Retention** | Append-only history | **Smart retention**: some sections summarize, some keep history, some edit-in-place |
| **Deduplication** | Check closed issues only | **Check open + closed issues AND PRs** |
| **Relevance Filtering** | All topics every run | **Load only relevant context files per iteration** |

---

## Target Files

### Files to Create
1. **`src/pm.ts`** - Visionary Product Manager agent implementation
2. **Context Files** (in target repo, modular structure):
   - **`pm_context/domain.md`** - Domain profile (edit-in-place, version markers)
   - **`pm_context/capabilities.md`** - Current feature snapshot (overwrite each run)
   - **`pm_context/discoveries.md`** - Domain insights (append-only with dates)
   - **`pm_context/cross_session_ideas.md`** - Manual user notes (preserve always)
   - **`pm_context/proposal_archive.md`** - Past proposals (keep last 3 runs + summary)
   - **`pm_context/evolution.log`** - Compact change log (last 10 entries)
   - **`pm_context/external_research.md`** - Industry/competitor insights (timestamped, keep last 5 runs)
3. **`ROADMAP.md`** (in target repo) - Categorized, priority-scored feature proposals

### Files to Modify
1. **`package.json`** - Add npm script: `"pm": "tsx src/pm.ts"`

---

## Architecture Analysis

### Existing Agent Pattern
All agents follow this structure (verified via `src/planner.ts`, `src/dev.ts`):
```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadProtocol = (name: string) => 
  fs.readFileSync(path.join(__dirname, `../protocols/${name}.md`), 'utf-8');

const CLAUDE_MD = fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8');

const SYSTEM_PROMPT = `...`;

runAgent('AgentName', SYSTEM_PROMPT, {
  cwd: process.env.TARGET_REPO_PATH || process.cwd(),
  model: 'claude-sonnet-4-5',
  tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
  allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
}).catch(console.error);
```

### Key Infrastructure Discovery
- **`TARGET_REPO_PATH`**: Environment variable pointing to destination repository
- Agents operate ON the target repo, not the atomo repo itself
- Context files will live in `TARGET_REPO_PATH/pm_context/` directory
- ROADMAP.md stays in repo root for visibility

---

## Implementation Roadmap

### Step 1: Create `src/pm.ts`

#### 1.1 Boilerplate and Dependencies
```typescript
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { runAgent } from './runner.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLAUDE_MD = fs.readFileSync(path.join(__dirname, '../CLAUDE.md'), 'utf-8');
```

#### 1.2 System Prompt Design

The prompt orchestrates a multi-phase visionary analysis with external knowledge integration and smart context management.

---

**PREAMBLE**
```
You are the Visionary Product Manager for this project.

Your mission: Synthesize new feature ideas by deeply understanding:
1. The product's DOMAIN and purpose
2. Current CAPABILITIES (what exists)
3. Current LIMITATIONS (what's missing or underserved)
4. MARKET opportunities (informed by external knowledge: industry trends, competitor analysis)

You are NOT just finding gaps in code. You are thinking like a PM who:
- Understands the market through external research
- Imagines what users need next based on industry trends
- Proposes features that move toward product-market-fit

CRITICAL: 
- Track previous ideas to avoid repetition (check open + closed issues AND PRs)
- Use modular context files (load only what's relevant)
- Incorporate external knowledge to inform market expertise
```

---

**STEP 0: INITIALIZE CONTEXT DIRECTORY**
```
0.1 Ensure pm_context/ directory exists:
    - Bash: mkdir -p pm_context

0.2 Initialize missing context files with templates if first run:
    - Check: test -f pm_context/domain.md
    - If missing: Write domain.md template
    - Repeat for: capabilities.md, discoveries.md, cross_session_ideas.md, 
                  proposal_archive.md, evolution.log, external_research.md
```

---

**STEP 1: LOAD EXISTING CONTEXT (Smart Loading)**
```
1.1 Always load (core context):
    - Read: pm_context/domain.md (domain profile)
    - Read: pm_context/cross_session_ideas.md (user's manual notes - NEVER modify)
    - Read: pm_context/evolution.log (recent history)

1.2 Conditionally load (based on iteration focus):
    - If first run OR monthly cadence: Read external_research.md
    - If codebase changed: Read capabilities.md
    - Always: Read proposal_archive.md (last 3 runs for deduplication)

1.3 GitHub Deduplication Data:
    - Bash: gh issue list --search 'is:closed' --limit 100 --json title,number
    - Bash: gh issue list --search 'is:open' --limit 50 --json title,number,labels
    - Bash: gh pr list --state all --limit 50 --json title,number,state
    - Build exclusion list: titles/keywords already covered

1.4 Check if ROADMAP.md exists:
    - Bash: test -f ROADMAP.md && cat ROADMAP.md
    - Extract: Previous proposals for deduplication
```

---

**STEP 2: DOMAIN DISCOVERY (What is this product?)**
```
2.1 Structural Analysis:
    - Glob: src/*, lib/*, *.config.js, package.json
    - Read: package.json (name, description, dependencies, keywords)
    - Identify: Tech stack, architectural patterns, primary languages

2.2 Purpose Extraction:
    - Grep: README.md for mission statements (pattern: "## About|## Overview|## Purpose")
    - Grep: Domain keywords (pattern: "authentication|e-commerce|analytics|automation|agent")
    - Synthesize: What problem does this solve? Who is the user?

2.3 Skills/Protocols Discovery (per Zero-Waste Protocol):
    - Glob: .claude/*.md, .agents/*.md, protocols/*.md
    - Read: Discovered skill files (first 50 lines for overview)
    - Extract: Domain-specific standards, conventions, design patterns

2.4 Update domain.md (edit-in-place with version marker):
    - If understanding deepened: Refine "Domain Profile" section
    - Add version marker: "<!-- v2 - 2026-04-19: Clarified user persona -->"
    - Write: pm_context/domain.md
```

---

**STEP 3: EXTERNAL MARKET RESEARCH (NEW - Per User Feedback)**
```
3.1 Research Strategy:
    - IMPORTANT: This is a placeholder for external knowledge integration
    - In MVP: Agent will use reasoning about common patterns in the domain
    - Post-MVP: Integrate with web search API or industry reports
    
3.2 Domain-Specific Market Analysis (using internal reasoning):
    - Based on domain from STEP 2, apply industry knowledge:
      * If domain is "task management": Consider Asana, Notion, Linear patterns
      * If domain is "autonomous agents": Consider AutoGPT, LangChain, CrewAI features
      * If domain is "developer tools": Consider GitHub Copilot, Cursor, industry trends
    
3.3 Competitor Feature Analysis (reasoning-based):
    - Question: "What do leading products in [domain] offer that this doesn't?"
    - Question: "What emerging patterns in [domain] are becoming table-stakes?"
    - Question: "What adjacent domains could inform innovation here?"

3.4 Industry Trend Synthesis:
    - Identify: 2-3 macro trends relevant to this domain
    - Example: "Autonomous agents moving toward multi-agent collaboration"
    - Example: "Developer tools emphasizing context awareness and memory"

3.5 Update external_research.md (timestamped entries, keep last 5):
    - Append new research with: ## Research - [Date]
    - If more than 5 entries exist: Summarize oldest 3, keep recent 5 detailed
    - Write: pm_context/external_research.md
```

---

**STEP 4: CAPABILITY MAPPING (What does it do now?)**
```
4.1 Feature Inventory:
    - Glob: src/**/*.ts, lib/**/*.js (or relevant extensions)
    - Grep: Function/class exports (pattern: "export (function|class|const)")
    - Categorize: API routes, UI components, data models, utilities, integrations

4.2 Integration Points:
    - Grep: External API calls (pattern: "fetch\\(|axios\\.|http\\.")
    - Grep: Database operations (pattern: "prisma\\.|sequelize\\.|mongoose\\.")
    - Identify: What external systems does this connect to?

4.3 User-Facing Flows:
    - Grep: UI entry points (pattern: "route|page|view|component")
    - Identify: What can users currently DO with this product?

4.4 Update capabilities.md (OVERWRITE - snapshot approach):
    - This file is regenerated each run (not append-only)
    - Structure: Categorized list of features with file references
    - Write: pm_context/capabilities.md
```

---

**STEP 5: LIMITATION DETECTION (What's missing or weak?)**
```
5.1 Code-Level Signals (Low priority, but noted):
    - Grep: TODO/FIXME comments (pattern: "TODO|FIXME|HACK")
    - Grep: Incomplete implementations (pattern: "throw new Error.*not implemented")
    - Weight: Low - these are developer notes, not user needs

5.2 Structural Gaps (Key for PMF):
    - Compare: External research findings (STEP 3) vs. current capabilities (STEP 4)
    - Identify: Missing modules that competitors/industry have
    - Ask: What would a user in this domain expect that's absent?

5.3 Experience Gaps:
    - Grep: Error handling patterns (are they user-friendly?)
    - Grep: Documentation coverage (pattern: "README|docs/")
    - Assess: Production-readiness, DX quality

5.4 Update discoveries.md (APPEND-ONLY with dates):
    - Append: ## Discoveries - [Date]
    - List: New insights about structural/experience gaps
    - Preserve: All previous discovery entries (full history)
    - Write: pm_context/discoveries.md
```

---

**STEP 6: MARKET SYNTHESIS (What would move the needle?)**
```
6.1 Apply External Knowledge (from STEP 3):
    - Cross-reference: Industry trends vs. current limitations (STEP 5)
    - Question: "Which competitor features would drive user acquisition?"
    - Question: "Which emerging patterns should we adopt early?"

6.2 Product-Market-Fit Heuristics (AARRR Framework):
    - **Acquisition**: What features would attract new users? (Informed by competitor analysis)
    - **Activation**: What would help users succeed faster? (Informed by onboarding trends)
    - **Retention**: What would make users come back? (Informed by engagement patterns)
    - **Referral**: What would make users tell others? (Informed by viral features in domain)
    - **Revenue**: What would users pay for? (Informed by market monetization patterns)

6.3 Cross-Reference with Existing Context:
    - Read: pm_context/discoveries.md (historical insights)
    - Read: pm_context/cross_session_ideas.md (user's manual inspirations)
    - Synthesize: How do past discoveries + external trends inform new proposals?
```

---

**STEP 7: IDEA GENERATION (Propose new features)**
```
7.1 Generate proposals across categories:
    - **Core Logic**: New capabilities, workflows, algorithms
    - **API**: New endpoints, integrations, data models
    - **Docs**: Tutorials, API docs, contribution guides
    - **DX (Developer Experience)**: Tooling, debugging, testing infrastructure

7.2 For each idea, include:
    - **Title**: Clear, specific feature name
    - **Rationale**: WHY this matters (cite external research, user pain, PMF alignment)
    - **Impact**: WHO benefits (new users, existing power users, developers)
    - **Market Context**: Reference competitor feature or industry trend
    - **Priority**: High/Medium/Low (use ICE framework: Impact×Confidence/Effort)

7.3 Deduplication Check (ENHANCED - Per User Feedback):
    - Compare against: Previous ROADMAP.md items
    - Compare against: proposal_archive.md (last 3 runs)
    - Compare against: Closed issues (from STEP 1.3)
    - Compare against: Open issues (from STEP 1.3) - NEW
    - Compare against: Open/closed PRs (from STEP 1.3) - NEW
    - Action: Skip if already proposed/implemented; refine if similar but evolved
```

---

**STEP 8: UPDATE CONTEXT FILES (Smart Retention Strategy)**
```
8.1 domain.md - Edit-in-place with version markers:
    - Strategy: Refine existing content, add version comment when significant changes
    - Rationale: Domain doesn't change drastically; keep concise
    - Write: pm_context/domain.md (if updated)

8.2 capabilities.md - Overwrite (snapshot):
    - Strategy: Full regeneration each run
    - Rationale: Always reflects current state; no history needed
    - Write: pm_context/capabilities.md

8.3 discoveries.md - Append-only (full history):
    - Strategy: Append new section with date
    - Rationale: Insights accumulate and inform future thinking
    - Write: pm_context/discoveries.md (append mode)

8.4 cross_session_ideas.md - NEVER modify:
    - Strategy: Read-only for agent; user manually edits
    - Rationale: User's personal notes/inspirations
    - Action: None (preserve as-is)

8.5 proposal_archive.md - Keep last 3 runs + summary:
    - Strategy: 
      * Append current run's proposals
      * If more than 3 runs: Summarize oldest into "Historical Summary" section
      * Keep detailed last 3 runs
    - Rationale: Recent proposals inform deduplication; older ones summarized for context
    - Write: pm_context/proposal_archive.md

8.6 evolution.log - Keep last 10 entries:
    - Strategy: Append new entry: "[Date] Run #N: [key changes]"
    - If more than 10 entries: Keep last 10, drop oldest
    - Rationale: Compact change tracking; full history not needed
    - Write: pm_context/evolution.log

8.7 external_research.md - Keep last 5 runs (timestamped):
    - Strategy: Append new research; if >5 runs, summarize oldest
    - Rationale: External knowledge evolves; recent research most relevant
    - Write: pm_context/external_research.md
```

---

**STEP 9: GENERATE ROADMAP.MD**
```
9.1 Structure:
    # Product Roadmap
    
    Generated: [timestamp]
    
    *This roadmap is synthesized by the Atomo PM Agent based on codebase analysis, external market research, domain expertise, and product-market-fit assessment.*
    
    ---
    
    ## Core Logic
    
    ### High Priority
    - [ ] **[Feature Title]**  
      *Rationale*: [Why this matters for PMF]  
      *Impact*: [Who benefits and how]  
      *Market Context*: [Competitor/industry reference]
    
    ### Medium Priority
    [same format]
    
    ### Low Priority
    [same format]
    
    ## API
    [same structure]
    
    ## Docs
    [same structure]
    
    ## DX (Developer Experience)
    [same structure]
    
    ---
    
    *🤖 Generated by Atomo PM Agent | Last updated: [timestamp] | Research-informed*

9.2 Execute:
    - Use: Write("ROADMAP.md", content)
```

---

**STEP 10: OUTPUT SUMMARY**
```
Output JSON:
{
  "action": "visionary-roadmap-generated",
  "projectName": "[extracted from package.json]",
  "domain": "[brief domain description]",
  "contextFilesLoaded": ["domain.md", "cross_session_ideas.md", ...],
  "contextFilesUpdated": ["capabilities.md", "discoveries.md", ...],
  "externalResearchConducted": true/false,
  "categoriesAnalyzed": ["Core Logic", "API", "Docs", "DX"],
  "totalProposals": <count>,
  "breakdown": {
    "high": <count>,
    "medium": <count>,
    "low": <count>
  },
  "deduplicationChecks": {
    "closedIssues": <count checked>,
    "openIssues": <count checked>,
    "pullRequests": <count checked>,
    "filtered": <number of ideas filtered out>
  },
  "outputs": {
    "roadmap": "ROADMAP.md",
    "contextDir": "pm_context/"
  }
}
```

---

#### 1.3 Agent Execution
```typescript
runAgent('VisionaryPM', SYSTEM_PROMPT, {
  cwd: process.env.TARGET_REPO_PATH || process.cwd(),
  model: 'claude-sonnet-4-5',
  tools: ['Bash', 'Read', 'Write', 'Glob', 'Grep'],
  allowedTools: ['Bash', 'Read', 'Write', 'Glob', 'Grep']
}).catch(console.error);
```

---

### Step 2: Update `package.json`

Add new script:
```json
{
  "scripts": {
    "triage": "tsx src/triage.ts",
    "plan": "tsx src/planner.ts",
    "dev": "tsx src/dev.ts",
    "pm": "tsx src/pm.ts"   // <-- ADD THIS
  }
}
```

---

## Context File Structure Reference

```
pm_context/
├── domain.md                 # Edit-in-place with version markers
├── capabilities.md           # Overwrite each run (snapshot)
├── discoveries.md            # Append-only (full history)
├── cross_session_ideas.md    # User-maintained (agent read-only)
├── proposal_archive.md       # Keep last 3 runs + summary
├── evolution.log             # Keep last 10 entries
└── external_research.md      # Keep last 5 runs (timestamped)
```

### Retention Strategy Summary

| File | Strategy | Rationale | Max Size |
|------|----------|-----------|----------|
| `domain.md` | Edit-in-place + versions | Domain stable, needs refinement | ~2-3 KB |
| `capabilities.md` | Overwrite (snapshot) | Always current, no history needed | ~5-10 KB |
| `discoveries.md` | Append-only | Insights accumulate, inform future | Unbounded* |
| `cross_session_ideas.md` | User-only (read-only for agent) | User's inspirations | User-controlled |
| `proposal_archive.md` | Last 3 runs + summary | Recent for dedup, older summarized | ~15-20 KB |
| `evolution.log` | Last 10 entries | Compact change tracking | ~2-3 KB |
| `external_research.md` | Last 5 runs | Recent trends most relevant | ~10-15 KB |

*Note: `discoveries.md` can grow unbounded initially; future enhancement may add auto-summarization after N runs.

---

## Validation Checklist

### Pre-Implementation
- [x] Identified all target files (src/pm.ts, package.json, pm_context/*.md, ROADMAP.md)
- [x] Analyzed existing agent patterns (planner.ts, dev.ts structure)
- [x] Defined 10-step visionary workflow with external knowledge integration
- [x] Addressed ALL user feedback (external knowledge, modular context, smart retention, enhanced deduplication)
- [x] Designed smart retention strategy (different per file type)

### Post-Implementation
- [ ] `src/pm.ts` follows established agent pattern
- [ ] `package.json` includes "pm" script
- [ ] PM agent can be run via `npm run pm`
- [ ] First run creates `pm_context/` directory with all 7 files
- [ ] First run generates ROADMAP.md with categorized, priority-scored proposals
- [ ] Second run loads only relevant context files (not all 7 every time)
- [ ] Context files follow their retention strategies (edit-in-place vs append vs overwrite)
- [ ] Proposals cite external market context (competitors, industry trends)
- [ ] Deduplication checks open + closed issues AND PRs
- [ ] `cross_session_ideas.md` is never modified by agent
- [ ] Agent adheres to Zero-Waste Protocol (Glob → Grep → targeted Read)
- [ ] Context files don't grow indefinitely (smart limits enforced)

---

## Risk Assessment

### Low Risk
- **Pattern Reuse**: Follows proven agent architecture
- **No Breaking Changes**: Additive feature only
- **Modular Design**: Context files isolated, easy to debug/modify individually

### Medium Risk
- **External Knowledge Integration**: 
  - *Risk*: Requires web search API or reasoning-based approach in MVP
  - *Mitigation*: Start with reasoning-based domain expertise; add API in post-MVP
- **Context File Proliferation**:
  - *Risk*: 7 files to manage vs. 1 before
  - *Mitigation*: Clear retention strategies prevent bloat; smart loading reduces overhead
- **Deduplication Complexity**:
  - *Risk*: Checking open issues + PRs increases API calls
  - *Mitigation*: Batch API calls; cache results in proposal_archive.md

### Considerations
- **Smart Loading Logic**: Agent must decide which context files to load (adds complexity)
  - *Trade-off*: Worth it for efficiency gains; fewer tokens wasted on irrelevant context
- **Retention Strategy Enforcement**: Agent must implement different strategies per file
  - *Mitigation*: Clear logic in STEP 8; each file's strategy is explicit

---

## Testing Strategy

### Manual Testing

#### Test 1: First Run (Cold Start)
1. Set `TARGET_REPO_PATH` to a test project
2. Ensure no `pm_context/` directory exists
3. Run: `npm run pm`
4. Verify:
   - [ ] No errors
   - [ ] `pm_context/` directory created
   - [ ] All 7 context files created with templates
   - [ ] `ROADMAP.md` created with categorized proposals
   - [ ] Proposals cite market context (industry trends, competitor features)
   - [ ] JSON summary shows `externalResearchConducted: true`

#### Test 2: Second Run (Context Evolution)
1. Manually add a note to `pm_context/cross_session_ideas.md`
2. Run: `npm run pm` again
3. Verify:
   - [ ] `cross_session_ideas.md` unchanged (user note preserved)
   - [ ] `capabilities.md` overwritten with fresh snapshot
   - [ ] `discoveries.md` has new appended section (old preserved)
   - [ ] `evolution.log` has new entry (max 10 entries)
   - [ ] `proposal_archive.md` has previous run's proposals
   - [ ] `ROADMAP.md` has NEW proposals (not duplicates)

#### Test 3: Smart Retention (File Size Management)
1. Run PM agent 10 times
2. Verify:
   - [ ] `evolution.log` has exactly 10 entries (oldest dropped)
   - [ ] `proposal_archive.md` has last 3 runs detailed + summary of older
   - [ ] `external_research.md` has last 5 runs (older summarized)
   - [ ] `capabilities.md` size stable (overwrite, not append)

#### Test 4: Enhanced Deduplication
1. Create test issues/PRs:
   - Closed issue: "Add Export Feature"
   - Open issue: "Implement Dark Mode"
   - Merged PR: "feat: Add OAuth Integration"
2. Run: `npm run pm`
3. Verify:
   - [ ] ROADMAP.md does NOT propose any of the above
   - [ ] JSON summary shows `deduplicationChecks` with counts for closed, open, PRs
   - [ ] `filtered` count > 0

#### Test 5: Zero-Waste Compliance
1. Monitor agent logs during run
2. Verify:
   - [ ] Glob used before Grep
   - [ ] Grep used before Read
   - [ ] No full-file reads of large files (>500 lines)
   - [ ] Only relevant context files loaded (not all 7 if unnecessary)

#### Test 6: External Knowledge Integration
1. Run PM agent on a project with a clear domain (e.g., "task management")
2. Verify:
   - [ ] ROADMAP.md proposals reference industry patterns (e.g., "Kanban boards", "time tracking")
   - [ ] `external_research.md` has "Industry Trends" section
   - [ ] Proposals show awareness of competitor features

---

## Success Criteria

1. ✅ `src/pm.ts` created following agent pattern
2. ✅ `npm run pm` executes without errors
3. ✅ Modular context structure (`pm_context/*.md`) with 7 files
4. ✅ Smart retention strategies enforced (edit-in-place, append, overwrite, keep-last-N)
5. ✅ ROADMAP.md contains visionary, market-informed proposals (not just code TODOs)
6. ✅ External knowledge integrated (industry trends, competitor analysis cited)
7. ✅ Enhanced deduplication (checks open + closed issues AND PRs)
8. ✅ Context files don't grow indefinitely (limits enforced)
9. ✅ Smart loading (only relevant context files loaded per iteration)
10. ✅ Zero-Waste Protocol compliance (Glob → Grep → Read)
11. ✅ `cross_session_ideas.md` never modified by agent

---

## Future Enhancements (Post-MVP)

1. **Real External API Integration**: Replace reasoning-based market research with:
   - Web search API (e.g., Tavily, Perplexity)
   - Industry reports API (e.g., Gartner, Forrester feeds)
   - Competitor tracking (Product Hunt, Hacker News APIs)

2. **Context Auto-Summarization**: When `discoveries.md` exceeds 50 KB, auto-summarize oldest 50%

3. **GitHub Integration**: Auto-create issues for High-priority proposals with `gh issue create`

4. **Metrics Dashboard**: Track proposal acceptance rate, time-to-implementation

5. **Collaborative Context**: Allow multi-user annotation via GitHub comments on proposals

6. **Roadmap Versioning**: Git-tracked ROADMAP.md with diff views across runs

7. **Custom Frameworks**: Allow users to define prioritization logic (not just ICE/AARRR)

8. **Intelligent Context Loading**: ML-based prediction of which context files to load per iteration

---

## Addressing User Feedback (Iteration 2 Traceability)

| User Request (Iteration 2) | How Addressed in Updated Spec |
|----------------------------|-------------------------------|
| **"Preferred external knowledge" (industry trends, competitor analysis)** | **STEP 3** added: External Market Research with industry trend synthesis and competitor feature analysis; proposals now include "Market Context" field citing external knowledge |
| **"Make sure context not growing too much over time"** | **STEP 8** implements smart retention: `capabilities.md` overwritten, `proposal_archive.md` keeps last 3 runs, `evolution.log` keeps last 10 entries, `external_research.md` keeps last 5 runs |
| **"Should be smart - maybe some sections need history?"** | Different strategies per file: `discoveries.md` append-only (history needed), `capabilities.md` overwrite (snapshot), `domain.md` edit-in-place (refinement), `proposal_archive.md` hybrid (recent + summary) |
| **"Maybe maintain in separate files?"** | Context split into **7 modular files** in `pm_context/` directory (vs. single PM_CONTEXT.md before) |
| **"Every iteration won't involve all topics - not all relevant"** | **STEP 1.2** implements **smart loading**: Always load core (domain, cross_session_ideas, evolution.log); conditionally load others (external_research.md only if first run or monthly, capabilities.md only if codebase changed) |
| **"Better to check against GitHub as well"** | **STEP 1.3** and **STEP 7.3** now check: closed issues, **open issues (NEW)**, and **open/closed PRs (NEW)** |

---

## References

### Existing Patterns (from codebase)
- **Agent Structure**: `src/planner.ts` (lines 1-20) - imports, fileURLToPath, loadProtocol
- **runAgent Usage**: `src/dev.ts` (line 130-135) - TARGET_REPO_PATH, model, tools config
- **Zero-Waste Protocol**: `protocols/planning.md` - Glob → Grep → Read discipline

### Technical Dependencies
- `@anthropic-ai/claude-agent-sdk`: Agent execution framework
- `tsx`: TypeScript runtime
- `dotenv`: Environment variable management (.env file with TARGET_REPO_PATH)
- `gh` CLI: GitHub issue/PR querying for deduplication

### Future Dependencies (Post-MVP)
- Web search API (e.g., Tavily, Perplexity) for external knowledge
- Industry data APIs (optional)

---

*Tech Spec updated by Atomo Architect | Confidence: 95% | Iteration 2: External knowledge + modular context + enhanced deduplication*
