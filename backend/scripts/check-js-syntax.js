const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const scanRoots = [
  path.join(backendRoot, 'src'),
  path.join(backendRoot, 'scripts'),
];

const ignoredDirs = new Set([
  'node_modules',
  'tmp',
  'coverage',
  'dist',
  'build',
]);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        walk(path.join(dir, entry.name), files);
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

const files = scanRoots.flatMap((dir) => walk(dir)).sort();
const failures = [];

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: backendRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    failures.push({
      file: path.relative(backendRoot, file),
      output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    });
  }
}

if (failures.length > 0) {
  console.error(`JS syntax check failed: ${failures.length}/${files.length}`);
  for (const failure of failures) {
    console.error(`\n${failure.file}`);
    console.error(failure.output);
  }
  process.exit(1);
}

console.log(`JS syntax check passed: ${files.length} files`);
