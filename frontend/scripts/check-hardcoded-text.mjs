import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TARGET_DIRS = [
  path.join(ROOT, 'src', 'app', '[locale]'),
  path.join(ROOT, 'src', 'components'),
  path.join(ROOT, 'src', 'context'),
];

const IGNORE_FILES = new Set([
  path.join(ROOT, 'src', 'context', 'AuthContext.tsx'),
  path.join(ROOT, 'src', 'app', '[locale]', 'layout.tsx'),
  path.join(ROOT, 'src', 'app', '[locale]', 'about', 'page.tsx'),
  path.join(ROOT, 'src', 'app', '[locale]', 'roadmap', 'page.tsx'),
  path.join(ROOT, 'src', 'app', '[locale]', 'rules', 'page.tsx'),
  path.join(ROOT, 'src', 'app', '[locale]', 'battle', 'page.tsx'),
  path.join(ROOT, 'src', 'app', '[locale]', 'battle', 'enemyZones.ts'),
  path.join(ROOT, 'src', 'app', '[locale]', 'battle', 'battleState.ts'),
  path.join(ROOT, 'src', 'components', 'battle', 'enemyZones.ts'),
]);

const CYRILLIC_STRING_REGEX = /(['"`])(?:\\.|(?!\1).)*[А-Яа-яЁё](?:\\.|(?!\1).)*\1/g;

function walkFiles(dir, result = []) {
  if (!fs.existsSync(dir)) return result;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, result);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    if (IGNORE_FILES.has(fullPath)) continue;
    result.push(fullPath);
  }
  return result;
}

function main() {
  const files = TARGET_DIRS.flatMap((dir) => walkFiles(dir));
  const failures = [];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const matches = [...content.matchAll(CYRILLIC_STRING_REGEX)];
    if (!matches.length) continue;

    for (const match of matches) {
      failures.push(`${path.relative(ROOT, file)} -> ${match[0]}`);
    }
  }

  if (!failures.length) {
    console.log('hardcoded text check passed');
    return;
  }

  console.error('Hardcoded Cyrillic strings found:');
  for (const entry of failures) {
    console.error(`  - ${entry}`);
  }
  process.exitCode = 1;
}

main();
