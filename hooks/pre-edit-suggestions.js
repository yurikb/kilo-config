#!/usr/bin/env node
// gsd-hook-version: 1.5.0
// pre-edit-suggestions.js — Pre-edit suggestion hook for code improvements
//
// Runs before write-class tools to suggest:
// - Missing imports based on used symbols
// - Code style improvements
// - Potential refactors
//
// Protocol: JSON from Cursor on stdin; JSON response on stdout.
// Input: { tool_name, tool_input, tool_output, ... }
// Output: { additional_context?: string }  — injected as context before tool use

'use strict';

const fs = require('fs');
const path = require('path');

const WRITE_TOOL_RE = /^(write|edit|multiedit|replace|create)$/i;
const PATH_KEY_RE = /^(path|file_?path|filepath|target_?path|target)$/i;

const IMPORT_SUGGESTIONS = {
  '.py': {
    common: [
      { symbol: 'List', from: 'typing' },
      { symbol: 'Dict', from: 'typing' },
      { symbol: 'Optional', from: 'typing' },
      { symbol: 'Union', from: 'typing' },
      { symbol: 'dataclass', from: 'dataclasses' },
      { symbol: 'field', from: 'dataclasses' },
    ],
  },
  '.ts': {
    common: [
      { symbol: 'React', from: 'react' },
      { symbol: 'useState', from: 'react' },
      { symbol: 'useEffect', from: 'react' },
      { symbol: 'useContext', from: 'react' },
      { symbol: 'useRef', from: 'react' },
    ],
  },
  '.tsx': {
    common: [
      { symbol: 'React', from: 'react' },
      { symbol: 'useState', from: 'react' },
      { symbol: 'useEffect', from: 'react' },
      { symbol: 'useContext', from: 'react' },
      { symbol: 'useRef', from: 'react' },
    ],
  },
  '.js': {
    common: [
      { symbol: 'React', from: 'react' },
    ],
  },
  '.jsx': {
    common: [
      { symbol: 'React', from: 'react' },
    ],
  },
};

function getFileExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext;
}

function analyzeFileForSuggestions(filePath) {
  const ext = getFileExtension(filePath);
  const suggestionsConfig = IMPORT_SUGGESTIONS[ext];
  if (!suggestionsConfig) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const suggestions = [];

    // Check for common missing imports
    if (suggestionsConfig.common) {
      for (const { symbol, from } of suggestionsConfig.common) {
        // Simple check: if symbol is used but import not found
        const importPatterns = [
          `import.*${symbol}`,
          `from.*${symbol}`,
          `require.*${symbol}`,
          `import.*{.*${symbol}.*}`,
          `import.*${symbol}.*from`,
        ];
        const hasImport = importPatterns.some(pattern => 
          new RegExp(pattern, 'i').test(content)
        );

        const hasSymbol = new RegExp(`\\b${symbol}\\b`).test(content);
        
        if (hasSymbol && !hasImport) {
          suggestions.push(`Consider importing ${symbol} from '${from}'`);
        }
      }
    }

    return suggestions;
  } catch (err) {
    return [];
  }
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
const stdinTimeout = setTimeout(() => process.exit(0), 10000);

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

    const allSuggestions = [];
    for (const filePath of paths) {
      const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      if (!fs.existsSync(absPath)) continue;

      const suggestions = analyzeFileForSuggestions(absPath);
      allSuggestions.push(...suggestions.map(s => `[${path.relative(process.cwd(), absPath)}] ${s}`));
    }

    if (allSuggestions.length > 0) {
      const msg = 'Pre-edit suggestions:\n\n' + allSuggestions.slice(0, 8).join('\n');
      if (allSuggestions.length > 8) {
        msg += `\n\n...and ${allSuggestions.length - 8} more suggestions`;
      }
      process.stdout.write(JSON.stringify({ additional_context: msg }));
      return;
    }
  } catch { /* fail open */ }
  process.stdout.write(JSON.stringify({}));
});