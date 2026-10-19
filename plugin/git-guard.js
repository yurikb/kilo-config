// git-guard.js — Git safety plugin
// Blocks dangerous git commands (force push, reset --hard, clean -fd).
// Uses tool.execute.before hook to intercept bash/git tool calls.

const { spawnSync } = require('child_process');

const BLOCKED_PATTERNS = [
  { pattern: /git\s+push\s+(?!.*--tags).*--force(?:-with-lease)?/i, reason: 'force push can overwrite git history and cause data loss' },
  { pattern: /git\s+reset\s+--hard/i, reason: 'git reset --hard discards all uncommitted changes' },
  { pattern: /git\s+clean\s+-fd/i, reason: 'git clean -fd permanently deletes untracked files' },
  { pattern: /git\s+checkout\s+(?!\s*-b\s)(?!\s*--\s)(?!=)(master|main)(?:\s|$)/i, reason: 'switching to main/master directly can cause merge conflicts' },
  { pattern: /rm\s+-rf\s+(?:\/|\\|\.\.)/i, reason: 'rm -rf with absolute path or traversal is dangerous' },
  { pattern: /git\s+branch\s+-D/i, reason: 'git branch -D permanently deletes a branch' },
  { pattern: /git\s+filter-branch/i, reason: 'git filter-branch is deprecated and destructive' },
];

const WARNED_PATTERNS = [
  { pattern: /git\s+push\s(?!.*--force)/i, reason: 'Remember to run tests before pushing' },
  { pattern: /npm\s+publish/i, reason: 'Publishing to npm is irreversible - double-check version' },
];

function checkCommand(command) {
  const cmd = String(command || '').trim();

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(cmd)) {
      return { block: true, reason };
    }
  }

  for (const { pattern, reason } of WARNED_PATTERNS) {
    if (pattern.test(cmd)) {
      return { block: false, warning: reason };
    }
  }

  return null;
}

async function gitGuard(input, output) {
  const toolName = String(input.tool || '').toLowerCase();
  if (toolName !== 'bash') return;

  const args = output.args || {};
  const command = String(args.command || '');

  if (!command.startsWith('git') && !command.startsWith('rm')) return;

  const result = checkCommand(command);
  if (result) {
    if (result.block) {
      throw new Error(`Git Guard: Blocked dangerous command: ${result.reason}\n\nCommand: ${command}`);
    }
    if (result.warning) {
      output.metadata = output.metadata || {};
      output.metadata.warning = `Git Guard: ${result.warning}`;
    }
  }
}

async function gitGuardAfter(input, output) {
  const toolName = String(input.tool || '').toLowerCase();
  if (toolName !== 'bash') return;

  const args = input.args || {};
  const result = String(output.output || output.title || '');
  const command = String(args.command || '');

  if (command.includes('git commit')) {
    try {
      const status = spawnSync('git', ['diff', '--cached', '--name-only'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 5000,
      });

      const stagedFiles = status.stdout.trim().split('\n').filter(Boolean);
      if (stagedFiles.length > 30) {
        output.metadata = output.metadata || {};
        output.metadata.warning = `Git Guard: ${stagedFiles.length} files staged (>30). Consider committing in smaller batches.`;
      }
    } catch {
      // silently fail
    }
  }
}

const GitGuard = async () => ({
  'tool.execute.before': gitGuard,
  'tool.execute.after': gitGuardAfter,
});

module.exports = { id: 'git-guard', server: GitGuard };