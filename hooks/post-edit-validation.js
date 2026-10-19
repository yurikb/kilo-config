#!/usr/bin/env node
// gsd-hook-version: 1.5.0
// post-edit-validation.js — Post-edit validation hook for import/syntax/lint checking
//
// Runs after write-class tools (Write, Edit, MultiEdit, Replace) to validate:
// - Import statements (existence, resolution)
// - Syntax errors
// - Lint warnings/errors
//
// Protocol: JSON from Cursor on stdin; JSON response on stdout.
// Input: { tool_name, tool_input, tool_output, ... }
// Output: { additional_context?: string }  — injected as context after tool use

'use strict';

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
  '.rs': [
    { cmd: 'cargo', args: ['check', '--message-format=json'], desc: 'cargo check' },
  ],
  '.go': [
    { cmd: 'go', args: ['build', '{file}'], desc: 'go build' },
  ],
};

function getFileExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext;
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
  walk(input.tool_input || input.toolInput || {}, 0);
  return paths;
}

let raw = '';
const stdinTimeout = setTimeout(() => process.exit(0), 15000);

process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    let input;
    try { input = JSON.parse(raw || '{}'); } catch { process.stdout.write(JSON.stringify({})); return; }

    const toolName = String(input.tool_name || input.toolName || '').toLowerCase();
    if (!WRITE_TOOL_RE.test(toolName)) { process.stdout.write(JSON.stringify({})); return; }

    const paths = extractPaths(input);
    if (paths.length === 0) { process.stdout.write(JSON.stringify({})); return; }

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
      process.stdout.write(JSON.stringify({ additional_context: msg }));
      return;
    }
  } catch { /* fail open */ }
  process.stdout.write(JSON.stringify({}));
});