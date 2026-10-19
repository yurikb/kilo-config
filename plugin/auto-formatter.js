// auto-formatter.js — Auto-formatter plugin
// Runs formatters after file write/edit (prettier, ruff, black, rustfmt, gofmt, etc).
// Uses tool.execute.after hook.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WRITE_TOOL_RE = /^(write|edit|multiedit|replace|create)$/i;
const PATH_KEY_RE = /^(path|file_?path|filepath|target_?path|target)$/i;

const FORMATTERS = {
  '.js': ['prettier', ['--write', '{file}']],
  '.jsx': ['prettier', ['--write', '{file}']],
  '.ts': ['prettier', ['--write', '{file}']],
  '.tsx': ['prettier', ['--write', '{file}']],
  '.json': ['prettier', ['--write', '{file}']],
  '.jsonc': ['prettier', ['--write', '{file}']],
  '.yaml': ['prettier', ['--write', '{file}']],
  '.yml': ['prettier', ['--write', '{file}']],
  '.md': ['prettier', ['--write', '{file}']],
  '.css': ['prettier', ['--write', '{file}']],
  '.scss': ['prettier', ['--write', '{file}']],
  '.html': ['prettier', ['--write', '{file}']],
  '.py': ['ruff', ['format', '{file}']],
  '.py': ['black', ['{file}']], // fallback if ruff not available
  '.rs': ['rustfmt', ['{file}']],
  '.go': ['gofmt', ['-w', '{file}']],
  '.java': ['google-java-format', ['-i', '{file}']],
  '.kt': ['ktfmt', ['-i', '{file}']],
  '.swift': ['swiftformat', ['{file}']],
  '.sh': ['shfmt', ['-w', '{file}']],
  '.lua': ['stylua', ['{file}']],
};

function getFileExtension(filePath) {
  return path.extname(filePath).toLowerCase();
}

function runFormatter(filePath) {
  const ext = getFileExtension(filePath);
  const formatter = FORMATTERS[ext];
  if (!formatter) return null;

  const [cmd, args] = formatter;
  const resolvedArgs = args.map(a => a.replace('{file}', filePath));

  const result = spawnSync(cmd, resolvedArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 30000,
    shell: process.platform === 'win32',
  });

  return {
    success: result.status === 0,
    tool: cmd,
    output: result.stdout || result.stderr,
  };
}

function extractPaths(input) {
  const args = input.args || {};
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
  walk(args, 0);
  return paths;
}

async function autoFormat(input, output) {
  const toolName = String(input.tool || '').toLowerCase();
  if (!WRITE_TOOL_RE.test(toolName)) return;

  const paths = extractPaths(input);
  if (paths.length === 0) return;

  const results = [];
  for (const filePath of paths) {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    if (!fs.existsSync(absPath)) continue;

    const result = runFormatter(absPath);
    if (result) {
      results.push(result);
    }
  }

  if (results.length > 0) {
    const formatted = results.filter(r => r.success).map(r => r.tool);
    const failed = results.filter(r => !r.success).map(r => `${r.tool}: ${r.output}`);

    output.metadata = output.metadata || {};
    if (formatted.length > 0) {
      output.metadata.auto_formatted = `Auto-formatted with: ${formatted.join(', ')}`;
    }
    if (failed.length > 0) {
      output.metadata.format_warnings = failed.join('; ');
    }
  }
}

const AutoFormatter = async () => ({
  'tool.execute.after': autoFormat,
});

module.exports = { id: 'auto-formatter', server: AutoFormatter };