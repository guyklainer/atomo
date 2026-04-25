## Triage Protocol
* **Primary Tool**: Use the `bash` tool to interface with the local GitHub CLI (`gh`) for all issue management and data fetching.
* **Data Format**: Always request issue data in strict JSON format using the `--json` flag to assure deterministic inputs. Avoid parsing arbitrary text if JSON fields exist.

### Meta-Prompt Heuristic Matrix
Classify issues using ONLY the following criteria:
1. **BUG**: Must contain explicit error messages, stack traces, or deviations from expected behavior. Keywords: `"error"`, `"fail"`, `"crash"`, `"broken"`. Check separately whether reproduction steps are present (`missingReproSteps`).
2. **ENHANCEMENT**: Requests new functionality or API expansions. Keywords: `"feature"`, `"support"`, `"allow"`, `"enable"`.
3. **QUESTION**: Seeks clarification without system failure. Keywords: `"how to"`, `"why"`, `"what"`.
4. **AMBIGUOUS**: Fails all criteria above — lacks technical depth or actionable content.

**Actions per classification (only taken when Confidence Gate score >= 85):**
- Bug (`missingReproSteps=true`): Comment asking for repro steps AND label `needs-repro,triaged`
- Bug (`missingReproSteps=false`) / Enhancement / Question: Label `<classification>,triaged`
- Ambiguous: Comment asking for clarification AND label `needs-triage,triaged`

**Label discipline — NEVER apply `needs-info` directly.** Use `needs-repro` (missing reproduction steps) or `needs-triage` (ambiguous content) to ensure the needs-info backlog stays below 35% of triaged issues. The generic `needs-info` label accumulates and obscures root-cause signals; always use the more specific label.

**Stale needs-info lifecycle (run on every triage batch before classifying new issues):**
> Note: the rate gate check (`needs_info_open / triaged_total > 0.35`) is enforced upstream in code before you are invoked. If you are running, the rate is within bounds.
1. Fetch: `gh issue list --search "is:open label:needs-info" --json number,updatedAt --limit 100`
2. For each issue with `updatedAt` older than **14 days**: close it with `gh issue close <N> --comment "Closing: no response in 14 days. Reopen or file a new issue with the requested context."` and remove the `needs-info` label.
3. Before applying any `needs-*` label to a new issue, verify you cannot answer the clarifying question from the issue body, linked code, or recent PRs. Escalate to human only when genuinely blocked.
