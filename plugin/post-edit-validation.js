// post-edit-validation.js — Post-edit validation plugin
// Runs after write/edit tools to validate imports, syntax, and lint.
// Uses Kilo plugin API: tool.execute.after hook.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WRITE_TOOL_RE = /^(write|edit|multiedit|replace|create)$/i;
const PATH_KEY_RE = /^(path|file_?path|filepath|target_?path|target)$/i;

const LINT_COMMANDS = {
  '.py': [
    { cmd: 'ruff', args: ['check', '--select=F401,F811,F821,F822,F823,F841', '{file}'], desc: 'ruff (imports, unused)' },
    { cmd: 'pyright', args: ['{file}'], desc: 'pyright (types)' },
  ],
  '.ts': [
    { cmd: 'npx', args: ['tsc', '--noEmit', '{file}'], desc: 'tsc (types)' },
    { cmd: 'npx', args: ['eslint', '{file}', '--quiet'], desc: 'eslint' },
  ],
  '.tsx': [
    { cmd: 'npx', args: ['tsc', '--noEmit', '{file}'], desc: 'tsc (types)' },
    { cmd: 'npx', args: ['eslint', '{file}', '--quiet'], desc: 'eslint' },
  ],
  '.js': [
    { cmd: 'npx', args: ['eslint', '{file}', '--quiet'], desc: 'eslint' },
  ],
  '.jsx': [
    { cmd: 'npx', args: ['eslint', '{file}', '--quiet'], desc: 'eslint' },
  ],
};

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function runValidation(filePath) {
  const ext = getFileExtension(filePath);
  const commands = LINT_COMMANDS[ext];
  if (!commands) return null;

  const results = [];
  for (const { cmd, args, desc } of commands) {
    const resolvedArgs = args.map(a => a.replace('{file}', filePath));
    const result = spawnSync(cmd, resolvedArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 30000,
      shell: process.platform === 'win32',
    });

    if (result.status !== 0 && result.stdout) {
      const output = result.stdout.trim();
      if (output) {
        results.push({ tool: desc, output: output.split('\n').slice(0, 10).join('\n') });
      }
    } else if (result.stderr) {
      const output = result.stderr.trim();
      if (output && !output.includes('warning')) {
        results.push({ tool: desc, output: output.split('\n').slice(0, 10).join('\n') });
      }
    }
  }
  return results.length > 0 ? results : null;
}

function extractPaths(input) {
  const paths = [];
  const walk = (v, depth) => {
    if (depth > 5 || paths.length > 64) return;
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    if (v && typeof v === 'object') {
      for (const k of Object.keys(v)) {
        const val = v[k];
        if (typeof val === 'string' && PATH_KEY_RE.test(k)) paths.push(val);
        else walk(val, depth + 1);
      }
    }
  };
  walk(input || {}, 0);
  return paths;
}

async function postEditValidation(input, output) {
  const toolName = String(input.tool || '').toLowerCase();
  if (!WRITE_TOOL_RE.test(toolName)) return;

  const paths = extractPaths(input.args);
  if (paths.length === 0) return;

  const allIssues = [];
  for (const filePath of paths) {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) continue;

    const issues = runValidation(absPath);
    if (issues) {
      for (const issue of issues) {
        allIssues.push(`[${path.relative(process.cwd(), absPath)}] ${issue.tool}:\n${issue.output}`);
      }
    }
  }

  if (allIssues.length > 0) {
    const msg = 'Post-edit validation found issues:\n\n' + allIssues.join('\n\n');
    output.metadata = output.metadata || {};
    output.metadata.validation_issues = msg;
  }
}

const PostEditValidation = async () => ({
  'tool.execute.after': postEditValidation,
});

module.exports = { id: 'post-edit-validation', server: PostEditValidation };