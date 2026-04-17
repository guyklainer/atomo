# Project Setup
This repository uses Node.js and TypeScript to run a single, local autonomous agent based on the `@anthropic-ai/claude-agent-sdk`.

## Triage Protocol
* **Primary Tool**: Use the `bash` tool to interface with the local GitHub CLI (`gh`) for all issue management and data fetching.
* **Data Format**: Always request issue data in strict JSON format using the `--json` flag to assure deterministic inputs. Avoid parsing arbitrary text if JSON fields exist.
* **Codebase Analysis**:
  * Utilize the `grep` tool for targeted, efficient codebase searches.
  * Prefer `grep` over the `read` tool to preserve the context window and reduce token consumption.
  * You may use `glob` to locate files within specific directories.

## Commands
* **Run Scanner**: `npx tsx triage.ts`
