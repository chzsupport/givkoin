const fs = require('fs');
const os = require('os');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const { ensureStoreReady } = require('../src/lib/supabaseStore');
const { seedAutomationDemo } = require('../src/services/automationDemoService');

const MANIFEST_PATH = path.join(os.tmpdir(), 'choizze-automation-demo-last.json');

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
  console.log('Usage: node scripts/seedAutomationDemo.js [--tag=demo-tag] [--now=ISO_DATE] [--allow-production]');
}

function ensureLiveWriteAllowed(args) {
  const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv !== 'production') return;
  if (args['allow-production']) return;
  throw new Error(
    'Текущий backend .env выглядит как production. Для живого demo-сидa запусти с --allow-production.'
  );
}

function maskUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    return `${url.protocol}//${url.host}`;
  } catch {
    return String(raw || '').trim();
  }
}

function writeManifest(payload) {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  ensureLiveWriteAllowed(args);
  await ensureStoreReady();

  const result = await seedAutomationDemo({
    tag: args.tag || '',
    baseNow: args.now || null,
  });

  const manifest = {
    seededAt: new Date().toISOString(),
    supabase: {
      url: maskUrl(process.env.SUPABASE_URL),
      table: String(process.env.SUPABASE_TABLE || 'app_documents'),
    },
    ...result,
  };
  writeManifest(manifest);

  console.log(`[automation-demo] Seeded live demo with tag: ${result?.run?.tag || '-'}`);
  console.log(`[automation-demo] Supabase target: ${manifest.supabase.url} (${manifest.supabase.table})`);
  console.log(`[automation-demo] Manifest saved: ${MANIFEST_PATH}`);
  console.log('[automation-demo] Open the admin panel and inspect Security -> Проверка антиавтоматизации в проде.');
}

main().catch((error) => {
  console.error(`[automation-demo] Failed: ${error.message}`);
  process.exit(1);
});
