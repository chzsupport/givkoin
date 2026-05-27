const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(backendRoot, 'src');

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = walk(srcRoot).sort();

if (testFiles.length === 0) {
  console.log('No backend unit tests found');
  process.exit(0);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: backendRoot,
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'test',
  },
  stdio: 'inherit',
});

process.exit(result.status || 0);
