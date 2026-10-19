// secret-scanner.js — Secret scanner plugin
// Scans files before write/edit for hardcoded secrets, API keys, tokens.
// Blocks writes containing secrets using tool.execute.before hook.

const fs = require('fs');
const path = require('path');

const WRITE_TOOL_RE = /^(write|edit|multiedit|replace|create)$/i;
const PATH_KEY_RE = /^(path|file_?path|filepath|target_?path|target)$/i;

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Key', pattern: /aws_secret_access_key\s*=\s*['"][^'"]{20,}['"]/i },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z\-_]{35}/ },
  { name: 'GitHub Token', pattern: /gh[pousr]_[0-9A-Za-z]{36}/ },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9A-Za-z\-]{10,}/ },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/ },
  { name: 'Stripe Key', pattern: /sk_(live|test)_[0-9A-Za-z]{24,}/ },
  { name: 'OpenAI Key', pattern: /sk-[A-Za-z0-9]{32,}/ },
  { name: 'Generic API Key', pattern: /api[_-]?key\s*[:=]\s*['"][^'"]{16,}['"]/i },
  { name: 'Password Assignment', pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/i },
  { name: 'Secret Assignment', pattern: /secret\s*[:=]\s*['"][^'"]{16,}['"]/i },
  { name: 'Token Assignment', pattern: /token\s*[:=]\s*['"][^'"]{16,}['"]/i },
  { name: 'Database URL', pattern: /(postgres|mysql|mongodb|redis):\/\/[^\s:]+:[^\s@]+@[^\s]+/ },
  { name: 'SSH Key', pattern: /ssh-rsa AAAA[0-9A-Za-z+/=]{50,}/ },
  { name: 'Discord Token', pattern: /[MN][A-Za-z\d]{23}\.[\w-]{6}\.[\w-]{27}/ },
  { name: 'Telegram Bot Token', pattern: /[0-9]{8,10}:[A-Za-z0-9_-]{35}/ },
];

function extractContent(input) {
  const args = input.args || {};
  // For write: args.content or args.file_content
  if (args.content) return String(args.content);
  if (args.file_content) return String(args.file_content);
  // For edit: args.old_string + args.new_string
  if (args.new_string) return String(args.new_string);
  if (args.old_string) return String(args.old_string);
  return '';
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

function scanForSecrets(content) {
  const findings = [];
  for (const { name, pattern } of SECRET_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      findings.push({ name, match: match[0].substring(0, 60) });
    }
  }
  return findings;
}

async function secretScanner(input, output) {
  const toolName = String(input.tool || '').toLowerCase();
  if (!WRITE_TOOL_RE.test(toolName)) return;

  const content = extractContent(input);
  if (!content) return;

  const findings = scanForSecrets(content);
  if (findings.length > 0) {
    const msg = `Secret scan blocked: Found potential secrets in content:\n\n` +
      findings.map(f => `- ${f.name}: "${f.match}..."`).join('\n') +
      `\n\nRemove secrets before saving. Use environment variables or a secrets manager.`;
    throw new Error(msg);
  }
}

const SecretScanner = async () => ({
  'tool.execute.before': secretScanner,
});

module.exports = { id: 'secret-scanner', server: SecretScanner };