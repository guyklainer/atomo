# TECH_SPEC_80: Production Deployment Playbook

**Priority Score: 12.5** (I=5, C=5, E=2)  
**Issue**: #80  
**Type**: Enhancement - Documentation  
**Estimated Effort**: ~500 lines of documentation, 4-6 hours

---

## Root Cause / Requirements

**Problem**: Atomo documentation exclusively covers local development execution (`npm run triage` from a dev laptop). There is zero guidance for production deployment scenarios: scheduled cron jobs, CI/CD pipelines, containerized deployments, or cloud platform hosting.

**Business Impact**: This is an **enterprise adoption blocker**. Procurement teams and engineering managers require production deployment documentation to evaluate operational reliability, compliance readiness, and total cost of ownership.

**Technical Gap**:
- No cron job examples for scheduled agent execution
- No GitHub Actions workflow templates for CI-based automation
- No Dockerfile for containerized deployments
- No cloud platform deployment guides (AWS Lambda, Railway, Render, Fly.io)
- No monitoring/alerting setup documentation
- No secrets management best practices

---

## Target Files

### New Files to Create
1. **`docs/DEPLOYMENT.md`** (~500 lines)
   - Primary deployment documentation with 4 production patterns
   - Code examples, cost estimates, troubleshooting guides

### Files to Update
2. **`README.md`** (lines 95-108)
   - Add link to `DEPLOYMENT.md` in the "Internal Architecture" or "Contributing" section
   - Brief 1-2 sentence callout: "For production deployment (cron, CI/CD, Docker, cloud), see [DEPLOYMENT.md](docs/DEPLOYMENT.md)"

---

## Pattern Discovery

### Existing Documentation Patterns (from codebase scan)

1. **README.md structure**:
   - Uses emoji headers (⚡, 🧠, 🚀, 🛠, 📦, 🎮, 🧪, 📐, 🤝)
   - Command tables with clear action descriptions
   - Prerequisites listed upfront
   - Installation section with code blocks

2. **Environment configuration** (from `.env.example`):
   - `ANTHROPIC_API_KEY` (required)
   - `TARGET_REPO_PATH` (optional, defaults to `process.cwd()`)
   - All agents load via `import 'dotenv/config'`

3. **GitHub Actions workflow** (from `.github/workflows/test.yml`):
   - Uses pnpm (not npm) for package management
   - Caches pnpm store for CI efficiency
   - Node.js version: 20
   - Checkout action: `actions/checkout@v4`
   - Node setup: `actions/setup-node@v4`

4. **Agent invocation pattern** (from `package.json`):
   - All agents run via `tsx src/<agent>.ts`
   - Available commands: `triage`, `plan`, `dev`, `pm`, `review`, `release`
   - Sequential execution pattern: `triage` → `plan` → `dev`

---

## Implementation Pseudo-Code Roadmap

### Phase 1: Create `docs/DEPLOYMENT.md`

**1.1 Document Header & Overview** (lines 1-30)
```markdown
# Production Deployment Playbook

This guide covers 4 production deployment patterns for running Atomo agents reliably in production environments (scheduled, automated, or cloud-hosted).

## Prerequisites
- Node.js 20+
- GitHub CLI (`gh`) authenticated
- Anthropic API key
- Target repository with write access

## Deployment Patterns
1. [Cron Job (Self-Hosted)](#pattern-1-cron-job)
2. [GitHub Actions (CI/CD)](#pattern-2-github-actions)
3. [Docker Container](#pattern-3-docker)
4. [Cloud Platforms](#pattern-4-cloud)
```

**1.2 Pattern 1: Cron Job (Self-Hosted)** (lines 31-120)
```markdown
## Pattern 1: Cron Job (Self-Hosted)

**Best for**: Self-hosted servers, VPS, home servers

### Setup Steps

1. **Clone and configure Atomo**:
   ```bash
   git clone <repo-url>
   cd atomo
   pnpm install
   cp .env.example .env
   # Edit .env with your ANTHROPIC_API_KEY
   ```

2. **Create cron wrapper script** (`scripts/cron-triage.sh`):
   ```bash
   #!/bin/bash
   set -euo pipefail
   
   cd /path/to/atomo
   export PATH="$HOME/.local/share/pnpm:$PATH"
   
   # Run triage agent
   pnpm run triage >> /var/log/atomo/triage.log 2>&1
   
   # Optional: Run planner after triage
   pnpm run plan >> /var/log/atomo/plan.log 2>&1
   ```

3. **Make script executable**:
   ```bash
   chmod +x scripts/cron-triage.sh
   ```

4. **Add to crontab** (run every 6 hours):
   ```cron
   0 */6 * * * /path/to/atomo/scripts/cron-triage.sh
   ```

5. **Setup log rotation** (`/etc/logrotate.d/atomo`):
   ```
   /var/log/atomo/*.log {
       daily
       rotate 7
       compress
       missingok
       notifempty
   }
   ```

### Systemd Timer Alternative (Modern Cron)

Create `/etc/systemd/system/atomo-triage.service`:
```ini
[Unit]
Description=Atomo Triage Agent
After=network.target

[Service]
Type=oneshot
User=atomo
WorkingDirectory=/path/to/atomo
Environment="PATH=/home/atomo/.local/share/pnpm:/usr/bin"
ExecStart=/usr/bin/pnpm run triage
StandardOutput=journal
StandardError=journal
```

Create `/etc/systemd/system/atomo-triage.timer`:
```ini
[Unit]
Description=Run Atomo Triage every 6 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h
Persistent=true

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now atomo-triage.timer
sudo systemctl status atomo-triage.timer
```

### Error Handling & Alerts

**Email alerts on failure** (using `mailx`):
```bash
#!/bin/bash
if ! /path/to/atomo/scripts/cron-triage.sh; then
    echo "Atomo triage agent failed at $(date)" | \
        mailx -s "Atomo Agent Failure" admin@example.com
fi
```

**Slack alerts** (using webhook):
```bash
#!/bin/bash
if ! /path/to/atomo/scripts/cron-triage.sh; then
    curl -X POST -H 'Content-type: application/json' \
        --data '{"text":"Atomo triage agent failed!"}' \
        $SLACK_WEBHOOK_URL
fi
```
```

**1.3 Pattern 2: GitHub Actions (CI/CD)** (lines 121-220)
```markdown
## Pattern 2: GitHub Actions (CI/CD)

**Best for**: Public/private GitHub repos, team collaboration

### Full Workflow Example

Create `.github/workflows/atomo-agents.yml`:

```yaml
name: Atomo Autonomous Agents

on:
  schedule:
    # Run triage every 6 hours
    - cron: '0 */6 * * *'
  workflow_dispatch:  # Allow manual triggering

jobs:
  triage:
    name: Triage Agent
    runs-on: ubuntu-latest
    outputs:
      has_triaged: ${{ steps.check.outputs.has_triaged }}
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run Triage Agent
        id: triage
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pnpm run triage
      
      - name: Check for triaged issues
        id: check
        run: |
          COUNT=$(gh issue list --label triaged --limit 1 --json number | jq length)
          echo "has_triaged=$([[ $COUNT -gt 0 ]] && echo 'true' || echo 'false')" >> $GITHUB_OUTPUT

  plan:
    name: Planner Agent
    runs-on: ubuntu-latest
    needs: triage
    if: needs.triage.outputs.has_triaged == 'true'
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: latest
      
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      
      - name: Run Planner Agent
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pnpm run plan
```

### Secrets Configuration

1. Navigate to **Settings → Secrets and variables → Actions**
2. Add repository secret:
   - Name: `ANTHROPIC_API_KEY`
   - Value: `sk-ant-api03-...`
3. `GITHUB_TOKEN` is automatically provided by GitHub Actions

### Cost Optimization

- **Conditional execution**: Skip `plan` job if `triage` found no issues
- **Cache pnpm store**: Add caching to speed up runs
- **Limit concurrency**: Prevent overlapping runs

```yaml
concurrency:
  group: atomo-agents
  cancel-in-progress: false  # Don't cancel running agents
```
```

**1.4 Pattern 3: Docker Container** (lines 221-320)
```markdown
## Pattern 3: Docker Container

**Best for**: Cloud-agnostic deployments, local testing, CI/CD runners

### Dockerfile

Create `Dockerfile` in project root:

```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS base

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install supercronic (cron alternative for containers)
RUN apk add --no-cache curl \
    && curl -fsSLO https://github.com/aptible/supercronic/releases/download/v0.2.29/supercronic-linux-amd64 \
    && mv supercronic-linux-amd64 /usr/local/bin/supercronic \
    && chmod +x /usr/local/bin/supercronic

WORKDIR /app

# Copy dependency files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
FROM base AS deps
RUN pnpm install --frozen-lockfile --prod

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

# Copy runtime dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY --from=base /usr/local/bin/supercronic /usr/local/bin/supercronic

# Copy source code
COPY . .

# Create crontab file
RUN echo "0 */6 * * * cd /app && pnpm run triage >> /var/log/atomo.log 2>&1" > /etc/crontab

# Run supercronic
CMD ["supercronic", "/etc/crontab"]
```

### Docker Compose Setup

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  atomo:
    build: .
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - TARGET_REPO_PATH=/workspace
    volumes:
      - ./workspace:/workspace  # Mount target repo
      - atomo-data:/app/.atomo  # Persist agent memory
    restart: unless-stopped

volumes:
  atomo-data:
```

### Running the Container

```bash
# Build image
docker build -t atomo:latest .

# Run with environment variables
docker run -d \
  --name atomo-agent \
  -e ANTHROPIC_API_KEY="sk-ant-api03-..." \
  -v $(pwd):/workspace \
  -v atomo-data:/app/.atomo \
  --restart unless-stopped \
  atomo:latest

# View logs
docker logs -f atomo-agent

# Stop container
docker stop atomo-agent
```

### GitHub CLI Authentication in Docker

Mount your local `gh` config into the container:

```bash
docker run -d \
  -v ~/.config/gh:/root/.config/gh:ro \
  # ... other flags
```

Or use a GitHub Personal Access Token:

```bash
docker run -d \
  -e GH_TOKEN="ghp_xxxxxxxxxxxx" \
  # ... other flags
```
```

**1.5 Pattern 4: Cloud Platforms** (lines 321-450)
```markdown
## Pattern 4: Cloud Platforms

### Option A: Railway (Simplest)

**Cost**: ~$5/month for hobby tier

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Create `railway.json`**:
   ```json
   {
     "$schema": "https://railway.app/railway.schema.json",
     "build": {
       "builder": "NIXPACKS"
     },
     "deploy": {
       "numReplicas": 1,
       "restartPolicyType": "ON_FAILURE"
     }
   }
   ```

3. **Add cron service in `Procfile`**:
   ```
   worker: while true; do pnpm run triage && pnpm run plan; sleep 21600; done
   ```

4. **Deploy**:
   ```bash
   railway init
   railway up
   railway variables set ANTHROPIC_API_KEY=sk-ant-...
   ```

### Option B: Render (Cron Jobs)

**Cost**: Free tier available (limited hours)

1. **Create `render.yaml`**:
   ```yaml
   services:
     - type: cron
       name: atomo-triage
       env: node
       buildCommand: pnpm install --frozen-lockfile
       schedule: "0 */6 * * *"
       command: pnpm run triage
       envVars:
         - key: ANTHROPIC_API_KEY
           sync: false
   ```

2. **Deploy via GitHub integration**:
   - Connect repository to Render
   - Add `ANTHROPIC_API_KEY` secret in dashboard

### Option C: AWS Lambda (Serverless)

**Cost**: ~$0.20/month (free tier eligible)

**Prerequisites**: AWS CLI, SAM CLI

1. **Create `template.yaml`**:
   ```yaml
   AWSTemplateFormatVersion: '2010-09-09'
   Transform: AWS::Serverless-2016-10-31
   
   Resources:
     AtomoTriageFunction:
       Type: AWS::Serverless::Function
       Properties:
         Runtime: nodejs20.x
         Handler: src/triage.handler
         CodeUri: .
         Environment:
           Variables:
             ANTHROPIC_API_KEY: !Ref AnthropicApiKey
         Events:
           ScheduledTriage:
             Type: Schedule
             Properties:
               Schedule: rate(6 hours)
   
   Parameters:
     AnthropicApiKey:
       Type: String
       NoEcho: true
   ```

2. **Wrap agent for Lambda** (modify `src/triage.ts`):
   ```typescript
   export const handler = async () => {
     // Existing triage agent code
     await agent.run();
     return { statusCode: 200 };
   };
   ```

3. **Deploy**:
   ```bash
   sam build
   sam deploy --guided --parameter-overrides AnthropicApiKey=sk-ant-...
   ```

### Option D: Fly.io (Persistent VM)

**Cost**: ~$3/month (256MB RAM, 1GB storage)

1. **Create `fly.toml`**:
   ```toml
   app = "atomo-agent"
   primary_region = "iad"
   
   [build]
     dockerfile = "Dockerfile"
   
   [[services]]
     internal_port = 8080
     protocol = "tcp"
   ```

2. **Deploy**:
   ```bash
   flyctl launch
   flyctl secrets set ANTHROPIC_API_KEY=sk-ant-...
   flyctl deploy
   ```

### Cost Comparison Table

| Platform      | Monthly Cost | Free Tier | Best For                  |
|---------------|--------------|-----------|---------------------------|
| Railway       | $5           | 500 hrs   | Quick setup               |
| Render        | $0-7         | Limited   | Budget-conscious          |
| AWS Lambda    | $0.20        | 1M reqs   | Serverless, pay-per-use   |
| Fly.io        | $3           | None      | Persistent VM control     |
| Self-Hosted   | $0           | N/A       | Full control, own hardware|
```

**1.6 Monitoring & Troubleshooting** (lines 451-500)
```markdown
## Monitoring & Alerting

### Health Check Script

Create `scripts/health-check.sh`:

```bash
#!/bin/bash
# Check if agent ran successfully in last 7 hours

LAST_RUN=$(gh issue list --label triaged --limit 1 --json updatedAt -q '.[0].updatedAt')
CURRENT=$(date -u +%s)
LAST_RUN_TS=$(date -d "$LAST_RUN" +%s)
DIFF=$(( (CURRENT - LAST_RUN_TS) / 3600 ))

if [ $DIFF -gt 7 ]; then
    echo "WARNING: Atomo hasn't run in $DIFF hours"
    exit 1
fi
```

### Common Issues

**Issue**: `gh: command not found`  
**Solution**: Install GitHub CLI or mount `gh` binary in Docker

**Issue**: `ANTHROPIC_API_KEY not set`  
**Solution**: Verify `.env` file or environment variable configuration

**Issue**: Agent runs but doesn't post comments  
**Solution**: Check `gh auth status` - token may have expired

**Issue**: Cron job doesn't execute  
**Solution**: Verify absolute paths in crontab, check `/var/log/syslog`

## Security Best Practices

1. **Never commit `.env`**: Always in `.gitignore`
2. **Use secret managers**: GitHub Secrets, AWS Secrets Manager, Railway vars
3. **Rotate API keys**: Every 90 days minimum
4. **Limit GitHub token scope**: Use fine-grained PATs with minimal permissions
5. **Enable 2FA**: On GitHub account running agents

---

## Next Steps

After deploying, monitor:
- Agent execution logs
- GitHub issue label changes (`triaged`, `for-dev`)
- API usage in Anthropic Console
- Infrastructure costs

For production support, see [CONTRIBUTING.md](../CONTRIBUTING.md) or open an issue.
```

### Phase 2: Update `README.md`

**Location**: After line 108 ("Contributing" section)

**Insertion**:
```markdown
## 🚀 Production Deployment

Running Atomo in production? See the **[Production Deployment Playbook](docs/DEPLOYMENT.md)** for:
- Scheduled cron jobs (self-hosted servers)
- GitHub Actions CI/CD automation
- Docker containerization
- Cloud platform deployment (Railway, AWS Lambda, Fly.io, Render)

---
```

---

## Reviewer Acceptance Criteria

This spec is ready for implementation if all 5 criteria are satisfied:

| # | Criterion | Reviewer Answer |
|---|-----------|-----------------|
| 1 | All 4 deployment patterns (cron, GitHub Actions, Docker, cloud) are covered with working code examples | |
| 2 | Security best practices (secrets management, token scoping) are documented | |
| 3 | Cost estimates for each cloud platform are provided | |
| 4 | Monitoring/troubleshooting section addresses common deployment failures | |
| 5 | The deployment guide is consistent with existing Atomo architecture (pnpm, tsx, dotenv, gh CLI) | |

---

## Implementation Notes

1. **No code changes required** - purely documentation
2. **File creation order**: `docs/DEPLOYMENT.md` first, then `README.md` update
3. **Testing**: Manually validate each code example before committing
4. **Existing patterns to follow**:
   - Use emoji headers matching README.md style
   - Code blocks with syntax highlighting
   - Table formatting for comparisons
   - Prerequisites sections at top of each pattern

5. **Skills/protocols to integrate**:
   - No specific skills in `.claude/` or `.agents/` directories relevant to deployment docs
   - Follow existing markdown formatting conventions from `README.md`

---

**Generated by**: Atomo Planner Agent  
**Date**: 2026-04-26  
**Confidence**: 100%
