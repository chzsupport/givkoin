const path = require('path');
const { createRequire } = require('module');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const dotenv = backendRequire('dotenv');
const { createClient } = backendRequire('@supabase/supabase-js');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

function parseArgs(argv) {
  const args = {};
  for (const token of argv) {
    if (!token.startsWith('--')) continue;
    const body = token.slice(2);
    const eqIndex = body.indexOf('=');
    args[eqIndex === -1 ? body : body.slice(0, eqIndex)] = eqIndex === -1 ? true : body.slice(eqIndex + 1);
  }
  return args;
}

function ensureLocalSupabase(urlValue) {
  const raw = String(urlValue || '').trim();
  if (!raw) throw new Error('SUPABASE_URL пустой. Нужна локальная Supabase.');
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const allowed = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (!allowed) {
    throw new Error(`Отказ: SUPABASE_URL не локальный (${url.origin}).`);
  }
}

async function deleteByTag(supabase, table, filterField, tag) {
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq(filterField, tag);
  if (error) throw error;
  return count || 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const confirm = String(args.confirm || '').trim();
  if (confirm !== 'DELETE_LOAD_TEST_USERS') {
    throw new Error('Очистка не запущена. Нужен параметр --confirm=DELETE_LOAD_TEST_USERS');
  }

  const tag = String(args.tag || 'givkoin_load_local').trim();
  const docTable = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

  ensureLocalSupabase(url);
  if (!key) throw new Error('SUPABASE_KEY пустой. Нужен ключ локальной Supabase.');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deletedDocuments = await deleteByTag(supabase, docTable, 'data->>loadTestTag', tag);
  const deletedUsers = await deleteByTag(supabase, 'users', 'data->>loadTestTag', tag);

  console.log(`[cleanup-local-users] удалено документов: ${deletedDocuments}`);
  console.log(`[cleanup-local-users] удалено пользователей: ${deletedUsers}`);
}

main().catch((error) => {
  console.error('[cleanup-local-users] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
