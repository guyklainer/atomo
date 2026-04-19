# Domain Profile

**Last Updated**: 2026-04-20
**Version**: 1.0

## Product Purpose
Atomo is a **local-first, multi-agent autonomous GitHub workflow automation system**. It replaces manual issue triage, technical planning, and implementation workflows with specialized AI agents that operate sequentially on GitHub issues.

## Primary Users
- **Solo developers** managing open-source projects
- **Small engineering teams** seeking to automate repetitive GitHub workflows
- **Maintainers** overwhelmed by issue triage and spec writing
- **AI-native development teams** building with autonomous agents

## Tech Stack
- **Runtime**: Node.js + TypeScript (ESM)
- **AI Framework**: @anthropic-ai/claude-agent-sdk (ReAct loop pattern)
- **Integration**: GitHub CLI (`gh`) for all repository operations
- **Architecture**: Sequential, headless agent execution with modular protocol system
- **Execution Model**: Local-first (runs on developer machine, no cloud dependency)

## Domain Keywords
autonomous agents, GitHub automation, issue triage, technical specification generation, multi-agent systems, ReAct loop, local-first development, AI-assisted development, workflow automation, software development agents

## Current Agent Roster
1. **Gatekeeper** (`triage.ts`) - Issue classification (bug/enhancement/question)
2. **Architect** (`planner.ts`) - Technical specification generation with review loops
3. **Dev** (`dev.ts`) - Implementation and PR creation
4. **PM** (`pm.ts`) - Product roadmap generation and feature ideation

## Architectural Patterns
- **Progressive Disclosure**: Protocols in `/protocols/*.md`, agents reference by name
- **Deterministic Pre-Processing**: FLOW B logic reduces LLM costs
- **Confidence Gating**: Self-evaluation before actions (85% threshold)
- **Human-in-the-Loop**: Review loops (`needs-review` → `APPROVED` → `for-dev`)
