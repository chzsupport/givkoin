import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MESSAGES_DIR = path.join(ROOT, 'messages');
const SOURCE_DIR = path.join(ROOT, 'src');
const MESSAGE_FILES = ['ru.json', 'en.json'];
const KEY_REGEX = /\bt\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const NAMESPACE_REGEX = /namespace:\s*['"`]([^'"`]+)['"`]/;

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, filename), 'utf8'));
}

function flattenKeys(value, prefix = '', result = new Set()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return result;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    result.add(nextPrefix);
    flattenKeys(nested, nextPrefix, result);
  }

  return result;
}

function walkFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === 'i18n' || entry.name === 'messages') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, result);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    result.push(fullPath);
  }
  return result;
}

function collectSourceKeys(files) {
  const result = new Map();

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const namespaceMatch = content.match(NAMESPACE_REGEX);
    const namespace = namespaceMatch?.[1] || '';
    const matches = new Set();
    let match;
    while ((match = KEY_REGEX.exec(content)) !== null) {
      const key = match[1];
      if (key.includes('${')) continue;
      matches.add(namespace && !key.includes('.') ? `${namespace}.${key}` : key);
    }
    KEY_REGEX.lastIndex = 0;
    if (matches.size) {
      result.set(file, [...matches].sort());
    }
  }

  return result;
}

function main() {
  const messages = Object.fromEntries(MESSAGE_FILES.map((filename) => [filename, readJson(filename)]));
  const ruKeys = flattenKeys(messages['ru.json']);
  const enKeys = flattenKeys(messages['en.json']);

  const missingInEn = [...ruKeys].filter((key) => !enKeys.has(key)).sort();
  const missingInRu = [...enKeys].filter((key) => !ruKeys.has(key)).sort();

  const sourceKeys = collectSourceKeys(walkFiles(SOURCE_DIR));
  const missingInSource = [];

  for (const [file, keys] of sourceKeys) {
    for (const key of keys) {
      if (!ruKeys.has(key) || !enKeys.has(key)) {
        missingInSource.push(`${path.relative(ROOT, file)} -> ${key}`);
      }
    }
  }

  if (!missingInEn.length && !missingInRu.length && !missingInSource.length) {
    console.log('i18n check passed');
    return;
  }

  if (missingInEn.length) {
    console.error('Missing keys in en.json:');
    for (const key of missingInEn) console.error(`  - ${key}`);
  }

  if (missingInRu.length) {
    console.error('Missing keys in ru.json:');
    for (const key of missingInRu) console.error(`  - ${key}`);
  }

  if (missingInSource.length) {
    console.error('Missing keys used in source:');
    for (const entry of missingInSource) console.error(`  - ${entry}`);
  }

  process.exitCode = 1;
}

main();
