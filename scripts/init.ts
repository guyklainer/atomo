import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const REQUIRED_LABELS = [
  { name: 'triaged', color: '0e8a16', description: 'Issue has been triaged' },
  { name: 'needs-info', color: 'fbca04', description: 'Requires clarification from reporter' },
  { name: 'Bug', color: 'd73a4a', description: 'Something isn\'t working' },
  { name: 'Enhancement', color: 'a2eeef', description: 'New feature or request' },
  { name: 'Question', color: 'd876e3', description: 'Further information is requested' },
  { name: 'Ambiguous', color: 'e99695', description: 'Lacks technical depth or actionable content' },
  { name: 'needs-repro', color: 'cfd3d7', description: 'Requires reproduction steps' },
  { name: 'needs-triage', color: '5319e7', description: 'Needs manual triage' },
  { name: 'pm-proposal', color: '1d76db', description: 'Proposed by PM agent' },
  { name: 'for-dev', color: '006b75', description: 'Ready for implementation' }
];

function checkCommand(command: string): boolean {
  try {
    execSync(`command -v ${command}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function runGh(args: string, cwd?: string): string {
  return execSync(`gh ${args}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], cwd }).trim();
}

async function main() {
  console.log('🚀 Initializing Atomo Environment Check...\n');

  // 1. Check Node.js
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0] || '0');
  if (majorVersion < 18) {
    console.error(`❌ Node.js version ${nodeVersion} detected. Please use Node.js 18 or higher.`);
    process.exit(1);
  }
  console.log(`✅ Node.js: ${nodeVersion}`);

  // 2. Check gh CLI
  if (!checkCommand('gh')) {
    console.error('❌ GitHub CLI (gh) is not installed. Please install it: https://cli.github.com/');
    process.exit(1);
  }
  console.log('✅ GitHub CLI: Installed');

  // 3. Check gh auth
  try {
    const authStatus = runGh('auth status');
    console.log('✅ GitHub CLI: Authenticated');
  } catch {
    console.error('❌ GitHub CLI: Not authenticated. Please run `gh auth login`.');
    process.exit(1);
  }

  // 4. Check Environment Variables
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('⚠️  ANTHROPIC_API_KEY not found in .env or environment.');
    console.log('   Please add it to .env: ANTHROPIC_API_KEY=your_key_here');
  } else {
    console.log('✅ ANTHROPIC_API_KEY: Found');
  }

  // 5. Target Repository Setup
  const targetPath = process.env.TARGET_REPO_PATH || process.cwd();
  console.log(`📂 Target Repo Path: ${targetPath}`);

  if (!fs.existsSync(targetPath)) {
    console.error(`❌ Target path does not exist: ${targetPath}`);
    process.exit(1);
  }

  try {
    const repoInfo = JSON.parse(runGh(`repo view --json name,owner,url`, targetPath));
    console.log(`✅ Connected to Repo: ${repoInfo.owner.login}/${repoInfo.name}`);
    
    // 6. Check Labels
    console.log('\n🏷️  Checking GitHub Labels...');
    const labelsUrl = `repos/${repoInfo.owner.login}/${repoInfo.name}/labels`;
    const existingLabelsJson = runGh(`api ${labelsUrl} --paginate`, targetPath);
    const existingLabels = JSON.parse(existingLabelsJson).map((l: any) => l.name.toLowerCase());

    for (const label of REQUIRED_LABELS) {
      if (existingLabels.includes(label.name.toLowerCase())) {
        console.log(`   ✅ Label exists: ${label.name}`);
      } else {
        console.log(`   ➕ Creating label: ${label.name}...`);
        try {
          runGh(`api -X POST ${labelsUrl} -f name="${label.name}" -f color="${label.color}" -f description="${label.description}"`, targetPath);
          console.log(`      ✅ Created.`);
        } catch (err: any) {
          console.error(`      ❌ Failed to create label ${label.name}: ${err.message}`);
        }
      }
    }

  } catch (err: any) {
    console.warn(`⚠️  Could not verify GitHub repo or labels at target path. Are you in a git repo with an upstream?`);
    console.error(`   Error: ${err.message}`);
  }

  console.log('\n✨ Environment check complete!');
}

main().catch(err => {
  console.error('💥 Unexpected error:', err);
  process.exit(1);
});
