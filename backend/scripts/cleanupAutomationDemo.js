const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { ensureStoreReady } = require('../src/lib/supabaseStore');
const { cleanupAutomationDemo } = require('../src/services/automationDemoService');

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eqIndex = body.indexOf('=');
    if (eqIndex === -1) {
      args[body] = true;
      continue;
    }
    args[body.slice(0, eqIndex)] = body.slice(eqIndex + 1);
  }
  return args;
}

function printUsage() {
  console.log('Usage: node scripts/cleanupAutomationDemo.js [--id=runId] [--tag=demo-tag] [--allow-production]');
}

function ensureLiveWriteAllowed(args) {
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv !== 'production') return;
  if (args['allow-production']) return;
  throw new Error(
    'Текущий backend .env выглядит как production. Для cleanup живого demo запусти с --allow-production.'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  ensureLiveWriteAllowed(args);
  await ensureStoreReady();

  const result = await cleanupAutomationDemo({
    runId: args.id || '',
    tag: args.tag || '',
  });

  console.log(`[automation-demo] Cleanup completed for tag: ${result?.run?.tag || '-'}`);
  console.log(JSON.stringify(result?.summary || {}, null, 2));
}

main().catch((error) => {
  console.error(`[automation-demo] Cleanup failed: ${error.message}`);
  process.exit(1);
});
