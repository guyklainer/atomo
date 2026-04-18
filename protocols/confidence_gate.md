## Confidence Gate Protocol

Before taking any terminal action (labeling an issue, writing a TECH_SPEC), you MUST perform a confidence evaluation using the following weighted checklist. Score each criterion 0 (No) or 1 (Yes), multiply by its weight, and sum for a percentage total out of 100.

### For the Gatekeeper — classification confidence:
| Criterion | Weight |
|---|---|
| The issue title and body unambiguously match exactly ONE classification category | 35% |
| No critical context is missing that would change the classification | 30% |
| The request is actionable in its current form (not a vague idea) | 20% |
| There are no contradictory signals (e.g., sounds like both a bug AND a feature request) | 15% |

### For the Architect — planning confidence (Bug issues):
| Criterion | Weight |
|---|---|
| I know the exact root cause (not just a symptom) | 35% |
| I have identified the specific file(s) and line range(s) that must change | 30% |
| The fix scope is clear and bounded (no ambiguous edge cases) | 20% |
| I have enough reproduction context to verify the fix | 15% |

### For the Architect — planning confidence (Enhancement issues):
| Criterion | Weight |
|---|---|
| The expected user-facing behavior is precisely described | 30% |
| I have identified which files/modules will change | 25% |
| There are no unresolved design or API choices left to guess | 25% |
| The scope is clearly bounded (not too broad, not underspecified) | 20% |

### Decision Rule
- **Score >= 85**: Proceed with the planned action.
- **Score < 85**: DO NOT proceed. Compose ONE focused clarifying question that would raise the lowest-scoring criterion above. Post it as a GitHub comment using the format below, label the issue `needs-info`, and EXIT immediately without labeling or writing a spec.

**Comment format when posting needs-info:**
```
🤖 Planning paused (Confidence: {score}%): Before I can [classify/plan] this issue, I need to understand one thing:

{your single, specific question — no bullet lists, just one clear question}

I'll automatically re-evaluate once this is answered.
```
