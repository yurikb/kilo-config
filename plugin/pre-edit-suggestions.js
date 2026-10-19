// pre-edit-suggestions.js — Pre-edit suggestions plugin
// Runs before write/edit tools to suggest missing imports and improvements.
// Uses Kilo plugin API: tool.execute.before hook.

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
  return path.extname(filePath).toLowerCase();
}

function analyzeFileForSuggestions(filePath) {
  const ext = getFileExtension(filePath);
  const suggestionsConfig = IMPORT_SUGGESTIONS[ext];
  if (!suggestionsConfig) return [];

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const suggestions = [];

    if (suggestionsConfig.common) {
      for (const { symbol, from } of suggestionsConfig.common) {
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
  walk(input || {}, 0);
  return paths;
}

async function preEditSuggestions(input, output) {
  const toolName = String(input.tool || '').toLowerCase();
  if (!WRITE_TOOL_RE.test(toolName)) return;

  const paths = extractPaths(input.args);
  if (paths.length === 0) return;

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
    output.metadata = output.metadata || {};
    output.metadata.suggestions = msg;
  }
}

const PreEditSuggestions = async () => ({
  'tool.execute.before': preEditSuggestions,
});

module.exports = { id: 'pre-edit-suggestions', server: PreEditSuggestions };