const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const backendRequire = createRequire(path.join(BACKEND_DIR, 'package.json'));
const dotenv = backendRequire('dotenv');
const bcrypt = backendRequire('bcryptjs');
const { createClient } = backendRequire('@supabase/supabase-js');

dotenv.config({ path: path.join(BACKEND_DIR, '.env') });

const WORDS = Object.freeze([
  'amber', 'birch', 'cedar', 'dawn', 'ember', 'field', 'glow', 'harbor',
  'iris', 'jungle', 'kingdom', 'lumen', 'meadow', 'north', 'oasis', 'petal',
  'quartz', 'river', 'solace', 'timber', 'unity', 'velvet', 'willow', 'zenith',
]);

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

function buildSeedPhrase(index) {
  let value = Math.max(0, Number(index) || 0) + 1;
  const words = [];
  for (let position = 0; position < 24; position += 1) {
    const digit = value % WORDS.length;
    value = Math.floor(value / WORDS.length);
    words.push(WORDS[(digit + position) % WORDS.length]);
  }
  return words.join(' ');
}

async function upsertBatch(supabase, rows) {
  const { error } = await supabase
    .from('users')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: false });
  if (error) throw error;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = Math.max(1, Math.floor(Number(args.count || 5000)));
  const tag = String(args.tag || 'givkoin_load_local').trim();
  const chunkSize = Math.max(50, Math.floor(Number(args.chunk || 250)));
  const hashCost = Math.max(4, Math.min(10, Math.floor(Number(args.hashCost || 4))));
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

  ensureLocalSupabase(url);
  if (!key) throw new Error('SUPABASE_KEY пустой. Нужен ключ локальной Supabase.');

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const stateDir = path.join(__dirname, 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  const usersStatePath = path.join(stateDir, `${tag}-users.json`);
  const stateUsers = [];

  for (let start = 0; start < count; start += chunkSize) {
    const rows = [];
    const size = Math.min(chunkSize, count - start);
    for (let offset = 0; offset < size; offset += 1) {
      const index = start + offset;
      const number = String(index + 1).padStart(5, '0');
      const id = `${tag}_${number}`;
      const nickname = `loadtest${number}`;
      const email = `${nickname}@gmail.com`;
      const seedPhrase = buildSeedPhrase(index);
      const passwordHash = await bcrypt.hash(seedPhrase, hashCost);
      const nowIso = new Date().toISOString();
      const gender = index % 2 === 0 ? 'male' : 'female';
      const age = 18 + (index % 48);
      const birthDate = `${2026 - age}-06-15`;

      rows.push({
        id,
        email,
        password_hash: passwordHash,
        role: 'user',
        nickname,
        status: 'active',
        email_confirmed: true,
        email_confirmed_at: nowIso,
        access_restricted_until: null,
        access_restriction_reason: '',
        language: 'ru',
        data: {
          loadTestTag: tag,
          seedPhrase,
          nickname,
          role: 'user',
          status: 'active',
          emailConfirmed: true,
          quietWatchPassed: true,
          gender,
          birthDate,
          preferredGender: gender === 'male' ? 'female' : 'male',
          preferredAgeFrom: Math.max(18, age - 2),
          preferredAgeTo: age + 2,
          lives: 3,
          complaintChips: 15,
          stars: 1,
          sc: 0,
          lumens: 1000000,
          achievementStats: {},
          createdBy: 'load-tests/create-local-users.js',
        },
        last_seen_at: nowIso,
        last_online_at: nowIso,
        last_ip: '127.0.0.1',
        last_device_id: `${tag}_device_${number}`,
        last_fingerprint: `${tag}_fingerprint_${number}`,
        created_at: nowIso,
        updated_at: nowIso,
      });

      stateUsers.push({ id, email, nickname, seedPhrase });
    }

    await upsertBatch(supabase, rows);
    console.log(`[seed-local-users] создано/обновлено ${Math.min(start + size, count)} из ${count}`);
  }

  fs.writeFileSync(usersStatePath, JSON.stringify({
    tag,
    count,
    generatedAt: new Date().toISOString(),
    users: stateUsers,
  }, null, 2), 'utf8');

  console.log(`[seed-local-users] готово: ${usersStatePath}`);
}

main().catch((error) => {
  console.error('[seed-local-users] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
