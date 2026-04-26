const path = require('path');
const Module = require('module');
const crypto = require('crypto');
const express = require('express');
const { createMockSupabaseStore } = require('../testUtils/mockSupabaseStore');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const RUNTIME_TABLE = 'battle_runtime_entries';

const PORT = Math.max(1, Number(process.env.BENCH_PORT || 10000));
const USER_COUNT = Math.max(100, Number(process.env.BENCH_USER_COUNT || 5000));
const ACTIVE_USER_COUNT = Math.max(0, Math.min(USER_COUNT, Number(process.env.BENCH_ACTIVE_USER_COUNT || 2000)));
const BATTLE_PENDING_BOOST_USERS = Math.max(0, Math.min(USER_COUNT, Number(process.env.BENCH_BATTLE_PENDING_BOOST_USERS || 0)));
const BATTLE_EXPIRING_BOOST_USERS = Math.max(0, Math.min(USER_COUNT - BATTLE_PENDING_BOOST_USERS, Number(process.env.BENCH_BATTLE_EXPIRING_BOOST_USERS || 0)));
const BENCH_BATTLE_DURATION_SECONDS = Math.max(60, Number(process.env.BENCH_BATTLE_DURATION_SECONDS || 3600));
const BENCH_BATTLE_PLAN_MINUTES = Math.max(1, Number(process.env.BENCH_BATTLE_PLAN_MINUTES || Math.ceil(BENCH_BATTLE_DURATION_SECONDS / 60)));
const BENCH_BATTLE_TAIL_USER_COUNT = Math.max(0, Math.min(USER_COUNT, Number(process.env.BENCH_BATTLE_TAIL_USER_COUNT || 0)));
const state = {
  users: [],
  battle: null,
  cursor: 0,
  chats: [],
  posts: [],
  nightShiftUsers: [],
  crystalCollectors: new Map(),
};

const BENCH_SEED_WORDS = Object.freeze([
  'amber', 'birch', 'cedar', 'dawn', 'ember', 'field', 'glow', 'harbor',
  'iris', 'jungle', 'kingdom', 'lumen', 'meadow', 'north', 'oasis', 'petal',
  'quartz', 'river', 'solace', 'timber', 'unity', 'velvet', 'willow', 'zenith',
]);

function benchIndexWord(index, shift = 0) {
  const safeIndex = Math.max(0, Number(index) || 0);
  return BENCH_SEED_WORDS[(safeIndex + shift) % BENCH_SEED_WORDS.length];
}

function buildBenchSeedPhrase(index) {
  let value = Math.max(0, Number(index) || 0) + 1;
  const words = [];
  for (let position = 0; position < 24; position += 1) {
    const digit = value % BENCH_SEED_WORDS.length;
    value = Math.floor(value / BENCH_SEED_WORDS.length);
    words.push(BENCH_SEED_WORDS[(digit + position) % BENCH_SEED_WORDS.length]);
  }
  return words.join(' ');
}

function mockModule(resolvedPath, exportsValue) {
  const mod = new Module(resolvedPath);
  mod.filename = resolvedPath;
  mod.loaded = true;
  mod.exports = exportsValue;
  require.cache[resolvedPath] = mod;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getBenchUserIndex(user) {
  const raw = String(user?._id || user?.id || '').trim();
  const match = raw.match(/(\d+)$/);
  return match ? Math.max(0, Number(match[1]) || 0) : 0;
}

function createBenchUser(role = 'user') {
  const picked = state.users.length ? nextUser() : { _id: 'benchuser0', email: 'benchuser0@example.com', nickname: 'benchuser0' };
  return {
    _id: picked._id,
    id: picked._id,
    email: picked.email,
    nickname: picked.nickname,
    role,
  };
}

function createBenchUserFromRow(picked, role = 'user') {
  if (!picked) return createBenchUser(role);
  return {
    _id: picked._id,
    id: picked._id,
    email: picked.email,
    nickname: picked.nickname,
    role,
  };
}

function benchAuth(req, _res, next) {
  req.user = createBenchUser('user');
  req.auth = { userId: req.user._id, sid: `bench_${req.user._id}` };
  next();
}

function benchOptionalAuth(req, _res, next) {
  req.user = createBenchUser('user');
  req.auth = { userId: req.user._id, sid: `bench_${req.user._id}` };
  next();
}

function benchAdminAuth(_req, _res, next) {
  next();
}

function createMockSupabaseClient() {
  const tables = new Map();

  const clone = (value) => {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
  };

  function getTable(name) {
    const key = String(name || '').trim();
    if (!tables.has(key)) tables.set(key, new Map());
    return tables.get(key);
  }

  function getPathValue(obj, path) {
    if (!obj || !path) return null;
    const parts = String(path).split('.').map((part) => part.trim()).filter(Boolean);
    if (!parts.length) return null;
    let current = obj;
    for (const part of parts) {
      if (!current || typeof current !== 'object' || !(part in current)) return null;
      current = current[part];
    }
    return current;
  }

  function getFieldValue(row, field) {
    const name = String(field || '').trim();
    if (!name) return null;
    if (name === 'id' || name === 'model' || name === 'created_at' || name === 'updated_at' || name === 'expires_at') {
      return row ? row[name] : null;
    }
    if (name.startsWith('data->>')) {
      return getPathValue(row?.data, name.slice(7));
    }
    if (name.startsWith('data->')) {
      return getPathValue(row?.data, name.slice(6));
    }
    return row ? row[name] : null;
  }

  function normalizeCompareValue(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return '';
      const asNumber = Number(trimmed);
      if (Number.isFinite(asNumber)) return asNumber;
      const asDate = Date.parse(trimmed);
      if (Number.isFinite(asDate)) return asDate;
      return trimmed;
    }
    return value;
  }

  function compareValues(a, b, ascending = true) {
    if (a == null && b == null) return 0;
    if (a == null) return ascending ? -1 : 1;
    if (b == null) return ascending ? 1 : -1;
    const left = normalizeCompareValue(a);
    const right = normalizeCompareValue(b);
    if (typeof left === 'number' && typeof right === 'number') {
      return ascending ? left - right : right - left;
    }
    const cmp = String(left).localeCompare(String(right));
    return ascending ? cmp : -cmp;
  }

  function applyOrFilter(rows, expression) {
    const raw = String(expression || '').trim();
    if (!raw) return rows;
    const cursorMatch = raw.match(/^created_at\.lt\.(.+),and\(created_at\.eq\.(.+),id\.lt\.(.+)\)$/);
    if (!cursorMatch) return rows;
    const [, ltValue, eqValue, idValue] = cursorMatch;
    return rows.filter((row) => {
      const createdAt = String(row?.created_at || '');
      if (createdAt < ltValue) return true;
      if (createdAt === eqValue && String(row?.id || '') < idValue) return true;
      return false;
    });
  }

  function applyFilters(rows, filters, orFilter) {
    let out = Array.isArray(rows) ? rows : [];
    for (const filter of filters) {
      const op = filter.op;
      const expected = filter.value;
      out = out.filter((row) => {
        const actual = getFieldValue(row, filter.field);
        if (op === 'eq') {
          if (expected === null) return actual === null || actual === undefined;
          return String(actual) === String(expected);
        }
        if (op === 'neq') {
          return String(actual) !== String(expected);
        }
        if (op === 'is') {
          return expected === null ? actual === null || actual === undefined : actual === expected;
        }
        if (op === 'in') {
          const list = Array.isArray(expected) ? expected : [];
          const set = new Set(list.map((value) => String(value)));
          return set.has(String(actual));
        }
        if (op === 'like') {
          const actualText = String(actual ?? '');
          const pattern = String(expected ?? '');
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`);
          return regex.test(actualText);
        }
        if (op === 'contains') {
          if (Array.isArray(actual) && Array.isArray(expected)) {
            const actualSet = new Set(actual.map((value) => String(value)));
            return expected.every((value) => actualSet.has(String(value)));
          }
          if (actual && typeof actual === 'object' && expected && typeof expected === 'object') {
            return Object.keys(expected).every((key) => String(actual[key]) === String(expected[key]));
          }
          return false;
        }
        if (op === 'lt') return compareValues(actual, expected, true) < 0;
        if (op === 'lte') return compareValues(actual, expected, true) <= 0;
        if (op === 'gt') return compareValues(actual, expected, true) > 0;
        if (op === 'gte') return compareValues(actual, expected, true) >= 0;
        return true;
      });
    }
    if (orFilter) {
      out = applyOrFilter(out, orFilter);
    }
    return out;
  }

  function applyOrders(rows, orders) {
    if (!orders.length) return rows;
    return [...rows].sort((left, right) => {
      for (const order of orders) {
        const cmp = compareValues(getFieldValue(left, order.field), getFieldValue(right, order.field), order.ascending);
        if (cmp !== 0) return cmp;
      }
      return 0;
    });
  }

  function pickColumns(row, columns) {
    if (!columns || columns === '*') return clone(row);
    const list = String(columns).split(',').map((col) => col.trim()).filter(Boolean);
    if (!list.length) return clone(row);
    const out = {};
    list.forEach((col) => {
      if (col in row) {
        out[col] = clone(row[col]);
      } else if (col === 'data') {
        out[col] = clone(row.data);
      } else {
        out[col] = clone(row[col]);
      }
    });
    return out;
  }

  function ensureRowDefaults(row) {
    const next = { ...(row && typeof row === 'object' ? row : {}) };
    if (!next.id) next.id = crypto.randomBytes(12).toString('hex');
    if (!next.created_at) next.created_at = new Date().toISOString();
    if (!next.updated_at) next.updated_at = next.created_at;
    if (next.model && next.data && typeof next.data === 'object' && !next.data._id) {
      next.data = { ...next.data, _id: String(next.id) };
    }
    return next;
  }

  function buildRowKey(row) {
    if (!row) return null;
    if (row.model != null) return `${String(row.model)}:${String(row.id)}`;
    if (row.id != null) return String(row.id);
    if (row.user_id != null) return String(row.user_id);
    if (row.session_id != null) return String(row.session_id);
    return null;
  }

  function createQuery(tableName) {
    const state = {
      tableName,
      action: 'select',
      payload: null,
      filters: [],
      orders: [],
      range: null,
      limit: null,
      select: null,
      count: null,
      head: false,
      or: null,
      onConflict: null,
    };

    async function execute() {
      const table = getTable(state.tableName);
      if (state.action === 'insert') {
        const batch = Array.isArray(state.payload) ? state.payload : [state.payload];
        const inserted = [];
        for (const raw of batch) {
          const prepared = ensureRowDefaults(raw || {});
          const key = buildRowKey(prepared);
          if (!key) {
            return { data: null, error: { message: 'Missing primary key', code: '23502' } };
          }
          if (table.has(key)) {
            return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
          }
          table.set(key, clone(prepared));
          inserted.push(prepared);
        }
        const data = state.select ? inserted.map((row) => pickColumns(row, state.select)) : null;
        return { data, error: null, count: null };
      }

      if (state.action === 'upsert') {
        const batch = Array.isArray(state.payload) ? state.payload : [state.payload];
        const upserted = [];
        for (const raw of batch) {
          const prepared = ensureRowDefaults(raw || {});
          const key = buildRowKey(prepared);
          if (!key) {
            return { data: null, error: { message: 'Missing primary key', code: '23502' } };
          }
          const existing = table.get(key);
          if (existing) {
            const next = { ...existing, ...prepared, updated_at: prepared.updated_at || new Date().toISOString() };
            table.set(key, clone(next));
            upserted.push(next);
          } else {
            table.set(key, clone(prepared));
            upserted.push(prepared);
          }
        }
        const data = state.select ? upserted.map((row) => pickColumns(row, state.select)) : null;
        return { data, error: null, count: null };
      }

      if (state.action === 'update') {
        const rows = Array.from(table.values());
        const filtered = applyFilters(rows, state.filters, state.or);
        const updated = [];
        for (const row of filtered) {
          const next = { ...row, ...(state.payload || {}) };
          if (!next.updated_at) next.updated_at = new Date().toISOString();
          table.set(buildRowKey(next), clone(next));
          updated.push(next);
        }
        const data = state.select ? updated.map((row) => pickColumns(row, state.select)) : null;
        return { data, error: null, count: null };
      }

      if (state.action === 'delete') {
        const rows = Array.from(table.values());
        const filtered = applyFilters(rows, state.filters, state.or);
        filtered.forEach((row) => {
          table.delete(buildRowKey(row));
        });
        return { data: null, error: null, count: null };
      }

      const rows = applyFilters(Array.from(table.values()), state.filters, state.or);
      const totalCount = rows.length;
      const ordered = applyOrders(rows, state.orders);
      let sliced = ordered;
      if (state.range) {
        const from = Math.max(0, Number(state.range.from) || 0);
        const to = Math.max(from, Number(state.range.to) || 0);
        sliced = sliced.slice(from, to + 1);
      }
      if (state.limit != null) {
        const limit = Math.max(0, Number(state.limit) || 0);
        if (limit > 0) sliced = sliced.slice(0, limit);
      }
      const data = state.head ? null : sliced.map((row) => pickColumns(row, state.select));
      return { data, error: null, count: state.count ? totalCount : null };
    }

    const builder = {
      select(columns, options = {}) {
        state.select = columns || null;
        state.head = Boolean(options.head);
        state.count = options.count || null;
        return builder;
      },
      eq(field, value) {
        state.filters.push({ op: 'eq', field, value });
        return builder;
      },
      neq(field, value) {
        state.filters.push({ op: 'neq', field, value });
        return builder;
      },
      is(field, value) {
        state.filters.push({ op: 'is', field, value });
        return builder;
      },
      in(field, value) {
        state.filters.push({ op: 'in', field, value });
        return builder;
      },
      like(field, value) {
        state.filters.push({ op: 'like', field, value });
        return builder;
      },
      contains(field, value) {
        state.filters.push({ op: 'contains', field, value });
        return builder;
      },
      lt(field, value) {
        state.filters.push({ op: 'lt', field, value });
        return builder;
      },
      lte(field, value) {
        state.filters.push({ op: 'lte', field, value });
        return builder;
      },
      gt(field, value) {
        state.filters.push({ op: 'gt', field, value });
        return builder;
      },
      gte(field, value) {
        state.filters.push({ op: 'gte', field, value });
        return builder;
      },
      order(field, options = {}) {
        state.orders.push({ field, ascending: options.ascending !== false });
        return builder;
      },
      range(from, to) {
        state.range = { from, to };
        return builder;
      },
      limit(count) {
        state.limit = count;
        return builder;
      },
      or(expression) {
        state.or = expression;
        return builder;
      },
      insert(payload) {
        state.action = 'insert';
        state.payload = payload;
        return builder;
      },
      upsert(payload, options = {}) {
        state.action = 'upsert';
        state.payload = payload;
        state.onConflict = options.onConflict || null;
        return builder;
      },
      update(payload) {
        state.action = 'update';
        state.payload = payload;
        return builder;
      },
      delete() {
        state.action = 'delete';
        return builder;
      },
      maybeSingle() {
        return execute().then((result) => {
          const next = { ...result };
          if (Array.isArray(next.data)) {
            next.data = next.data[0] || null;
          }
          return next;
        });
      },
      single() {
        return execute().then((result) => {
          const next = { ...result };
          if (Array.isArray(next.data)) {
            next.data = next.data[0] || null;
          }
          return next;
        });
      },
      then(resolve, reject) {
        return execute().then(resolve, reject);
      },
    };

    return builder;
  }

  return {
    from: (tableName) => createQuery(tableName),
    __reset: () => tables.clear(),
    __tables: tables,
  };
}

const mockStore = createMockSupabaseStore();
const mockSupabaseClient = createMockSupabaseClient();
mockModule(path.resolve(__dirname, '../src/lib/supabaseStore.js'), mockStore);
mockModule(path.resolve(__dirname, '../src/lib/supabaseClient.js'), {
  getSupabaseClient: () => mockSupabaseClient,
});
mockModule(require.resolve('bcryptjs'), {
  genSalt: async () => 'bench-salt',
  hash: async (value) => `hashed:${value}`,
  compare: async (candidate, hashed) => hashed === `hashed:${candidate}`,
});
mockModule(path.resolve(__dirname, '../src/services/kService.js'), {
  getTotalRewardMultiplier: async () => 1,
  getBattleDamageMultiplier: async () => 1,
  awardBattleK: async () => 0,
  creditK: async () => 0,
});
mockModule(path.resolve(__dirname, '../src/services/activityService.js'), {
  recordActivity: async () => {},
  countActivities: async () => 0,
});
mockModule(path.resolve(__dirname, '../src/services/entityMoodService.js'), {
  updateEntityMoodForUser: async () => {},
});
mockModule(path.resolve(__dirname, '../src/services/achievementService.js'), {
  grantAchievement: async () => null,
});
mockModule(path.resolve(__dirname, '../src/controllers/notificationController.js'), {
  createNotification: async () => null,
});
mockModule(path.resolve(__dirname, '../src/services/activityRadianceService.js'), {
  awardRadianceForActivity: async () => 0,
});
mockModule(path.resolve(__dirname, '../src/services/moderationFilterService.js'), {
  evaluateModeration: async () => ({ blocked: false, sanitizedText: null, flags: [] }),
});
mockModule(path.resolve(__dirname, '../src/middleware/adminAudit.js'), {
  adminAudit: async () => {},
});
mockModule(path.resolve(__dirname, '../src/config/cpmRates.js'), {
  getCPM: () => 0,
  getTier: () => 'tier-1',
});
mockModule(require.resolve('geoip-lite'), { lookup: () => null });
mockModule(path.resolve(__dirname, '../src/middleware/auth.js'), benchAuth);
mockModule(path.resolve(__dirname, '../src/middleware/optionalAuth.js'), benchOptionalAuth);
mockModule(path.resolve(__dirname, '../src/middleware/adminAuth.js'), benchAdminAuth);
mockModule(path.resolve(__dirname, '../src/middleware/rateLimit.js'), {
  buildUserOrIpKey: () => 'bench',
  createRateLimiter: () => (_req, _res, next) => next(),
});
mockModule(path.resolve(__dirname, '../src/services/translationService.js'), {
  translateMessage: async (text) => ({ translatedText: String(text || '') }),
  detectLanguage: () => 'ru',
});
mockModule(path.resolve(__dirname, '../src/services/emailService.js'), {
  sendConfirmationEmail: async () => {},
  sendComplaintNotification: async () => {},
  sendBanOutcomeEmail: async () => {},
  sendModerationAlert: async () => {},
  sendGenericEventEmail: async () => {},
  sendBattleResultEmail: async () => {},
});
mockModule(path.resolve(__dirname, '../src/services/notificationService.js'), {
  broadcastNotificationByPresence: async () => {},
});
mockModule(path.resolve(__dirname, '../src/socket.js'), {
  getIO: () => null,
});

const quoteController = require('../src/controllers/quoteController');
const newsController = require('../src/controllers/newsController');
const adController = require('../src/controllers/adController');
const battleController = require('../src/controllers/battleController');
const battleService = require('../src/services/battleService');
const battleRuntimeStore = require('../src/services/battleRuntimeStore');
const chatController = require('../src/controllers/chatController');
const treeController = require('../src/controllers/treeController');
const solarController = require('../src/controllers/solarController');
const meditationController = require('../src/controllers/meditationController');
const nightShiftController = require('../src/controllers/nightShiftController');
const crystalController = require('../src/controllers/crystalController');
const meditationRoutes = require('../src/routes/meditation');
const { setSetting } = require('../src/utils/settings');


function adjustedDayOfWeek(now = new Date()) {
  const day = now.getDay();
  return day === 0 ? 6 : day - 1;
}

function createControllerRes(onDone = null) {
  let done = typeof onDone === 'function' ? onDone : null;
  const finish = () => {
    if (!done) return;
    const next = done;
    done = null;
    next();
  };
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(field, value) { this.headers[field] = value; return this; },
    setHeader(field, value) { this.headers[field] = value; return this; },
    json(payload) { this.body = payload; finish(); return this; },
    send(payload) { this.body = payload; finish(); return this; },
    end(payload) { this.body = payload ?? this.body; finish(); return this; },
  };
}

async function invokeController(handler, req) {
  const res = createControllerRes();
  await new Promise((resolve, reject) => {
    Promise.resolve(handler(req, res, (error) => (error ? reject(error) : resolve())))
      .then(resolve)
      .catch(reject);
  });
  return res;
}

async function invokeRouter(router, { method = 'GET', url = '/', user = null, body = {}, query = {}, params = {} } = {}) {
  const req = {
    method: String(method).toUpperCase(),
    url,
    originalUrl: url,
    path: String(url).split('?')[0],
    body,
    query,
    params,
    headers: {},
    user,
    auth: user ? { userId: user._id, sid: `bench_${user._id}` } : null,
    get: () => undefined,
  };
  let res = null;
  await new Promise((resolve, reject) => {
    res = createControllerRes(resolve);
    router.handle(req, res, (error) => (error ? reject(error) : resolve()));
  });
  return res;
}

function nextUser() {
  const user = state.users[state.cursor % state.users.length];
  state.cursor += 1;
  return user;
}

async function getBenchUserRow(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return null;
  const { data, error } = await mockSupabaseClient
    .from('users')
    .select('*')
    .eq('id', safeUserId)
    .single();
  if (error || !data) return null;
  return data;
}

async function expireBenchBattleBoosts(userId) {
  const row = await getBenchUserRow(userId);
  if (!row || !row.data || typeof row.data !== 'object') return;

  await mockSupabaseClient
    .from('users')
    .update({
      data: {
        ...row.data,
        shopBoosts: {},
      },
      updated_at: nowIso(),
    })
    .eq('id', String(userId));
}

function getBenchUserById(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return null;
  return state.users.find((row) => String(row?._id || '') === safeUserId) || null;
}

async function getBattleDocById(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return null;
  const { data, error } = await mockSupabaseClient
    .from(DOC_TABLE)
    .select('*')
    .eq('model', 'Battle')
    .eq('id', safeBattleId)
    .single();
  if (error || !data?.data) return null;
  return {
    ...data.data,
    _id: data.id,
  };
}

async function patchBattleDoc(battleId, patch = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return null;
  const current = await getBattleDocById(safeBattleId);
  if (!current) return null;
  const next = {
    ...current,
    ...(patch && typeof patch === 'object' ? patch : {}),
    _id: safeBattleId,
  };
  const { error } = await mockSupabaseClient
    .from(DOC_TABLE)
    .update({
      data: next,
      updated_at: nowIso(),
    })
    .eq('model', 'Battle')
    .eq('id', safeBattleId);
  if (error) throw error;
  state.battle = next;
  return next;
}

function nextUserOutsideNightShift(maxAttempts = 50) {
  const blocked = new Set((Array.isArray(state.nightShiftUsers) ? state.nightShiftUsers : []).map((id) => String(id)));
  if (!blocked.size) return nextUser();

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = nextUser();
    if (!blocked.has(String(candidate?._id || ''))) {
      return candidate;
    }
  }

  return nextUser();
}

function resetCrystalCollectors() {
  if (state.crystalCollectors && typeof state.crystalCollectors.clear === 'function') {
    state.crystalCollectors.clear();
    return;
  }
  state.crystalCollectors = new Map();
}

function getCrystalCollectorState(userId) {
  if (!state.crystalCollectors) {
    state.crystalCollectors = new Map();
  }
  return state.crystalCollectors.get(String(userId)) || null;
}

function setCrystalCollectorState(userId, value) {
  if (!state.crystalCollectors) {
    state.crystalCollectors = new Map();
  }
  state.crystalCollectors.set(String(userId), value);
  return value;
}

function pickCrystalCollectorUser(maxAttempts = 50) {
  const blocked = new Set((Array.isArray(state.nightShiftUsers) ? state.nightShiftUsers : []).map((id) => String(id)));
  const reusable = Array.from((state.crystalCollectors || new Map()).entries())
    .filter(([userId, progress]) => {
      if (!progress || typeof progress !== 'object') return false;
      if (blocked.has(String(userId))) return false;
      return !progress.rewardGranted;
    })
    .map(([userId]) => String(userId));

  if (reusable.length && Math.random() < 0.85) {
    const pickedId = reusable[randomInt(0, reusable.length - 1)];
    const pickedUser = getBenchUserById(pickedId);
    if (pickedUser) return pickedUser;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = nextUserOutsideNightShift();
    if (!candidate) break;
    const progress = getCrystalCollectorState(candidate._id);
    if (!progress || !progress.rewardGranted) {
      return candidate;
    }
  }

  return nextUserOutsideNightShift();
}

function nowIso() {
  return new Date().toISOString();
}

function pickRandomPostId() {
  if (!state.posts.length) return null;
  const index = randomInt(0, state.posts.length - 1);
  return state.posts[index]?._id || null;
}

function pickRandomChat() {
  if (!state.chats.length) return null;
  return state.chats[randomInt(0, state.chats.length - 1)];
}

function pickPostByOffset(offset = 0) {
  if (!state.posts.length) return null;
  const index = Math.abs(Number(offset) || 0) % state.posts.length;
  return state.posts[index] || null;
}

async function getCollectiveSessionId() {
  const response = await invokeController(meditationController.getCollectiveMeditation, {});
  const activeId = response?.body?.activeSession?.id ? String(response.body.activeSession.id) : '';
  if (activeId) return activeId;
  const nextId = response?.body?.nextSession?.id ? String(response.body.nextSession.id) : '';
  return nextId || 'bench_collective';
}

async function recordBenchAction(mechanic, userId) {
  return insertDoc('BenchAction', {
    mechanic: String(mechanic || 'unknown'),
    user: String(userId || ''),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

async function handleBattleCycle(req, res, next) {
  try {
    const user = nextUser();
    const joinRes = await invokeController(battleController.joinBattle, {
      user: { _id: user._id, id: user._id },
      body: { joinedAt: new Date().toISOString() },
    });
    if (joinRes.statusCode >= 400 || !joinRes.body?.battleId) {
      return res.status(joinRes.statusCode).json(joinRes.body);
    }

    if (String(user?.battleBoostProfile || '') === 'expiring') {
      await expireBenchBattleBoosts(user._id);
    }

    const heartbeatRes = await invokeController(battleController.battleHeartbeat, {
      user: { _id: user._id, id: user._id },
      body: { battleId: joinRes.body.battleId },
    });

    return res.status(heartbeatRes.statusCode).json({
      ok: heartbeatRes.statusCode < 400,
      join: joinRes.body,
      heartbeat: heartbeatRes.body,
    });
  } catch (error) {
    return next(error);
  }
}

function getBattleBenchUserOrThrow(userId) {
  const row = getBenchUserById(userId);
  if (!row) {
    const error = new Error('bench_user_not_found');
    error.statusCode = 404;
    throw error;
  }
  return row;
}

function nextBenchBattleReportSequence(user) {
  const current = Math.max(0, Math.floor(Number(user?.__battleReportSequence) || 0));
  const next = current + 1;
  if (user && typeof user === 'object') {
    user.__battleReportSequence = next;
  }
  return next;
}

function buildBenchBattleFinalReport(user) {
  const index = getBenchUserIndex(user);
  const profile = String(user?.battleBoostProfile || '').trim();
  const profileDamageBoost = profile === 'pending' ? 4200 : profile === 'expiring' ? 2100 : 0;
  const profileLumenBoost = profile === 'pending' ? 800 : profile === 'expiring' ? 350 : 0;
  const damage = 4200 + (index * 37) + profileDamageBoost;
  const hits = 75 + (index % 65) + (profile === 'pending' ? 20 : profile === 'expiring' ? 10 : 0);
  const shots = hits + 15 + (index % 9);
  const lumensSpent = 900 + (index * 11) + profileLumenBoost;
  const crystalsCollected = index % 4;
  const lumensGained = crystalsCollected * 100;
  const baddieDamage = (index % 5) * 7;
  const weakZoneHits = Math.max(0, Math.floor(hits / 4));
  return {
    shotsByWeapon: { 1: shots, 2: 0, 3: 0 },
    hitsByWeapon: { 1: hits, 2: 0, 3: 0 },
    hits,
    damageDelta: damage,
    lumensSpent,
    lumensGained,
    crystalsCollected,
    sparkIds: Array.from({ length: crystalsCollected }, (_, sparkIndex) => `spark_${index}_${sparkIndex}`),
    weakZoneHitsById: weakZoneHits > 0 ? { [`weak_${index % 12}`]: weakZoneHits } : {},
    voiceResults: [],
    baddieDestroyedIds: [],
    baddieDamage,
    maxComboHits: Math.max(0, Math.floor(hits / 3)),
    maxComboMultiplier: damage >= 8000 ? 1.5 : 1,
    heldComboX2MaxDuration: damage >= 10000 ? 12 : 0,
    reachedX1_5InFirst30s: damage >= 9500,
    phoenixStage: damage >= 12000 ? 1 : 0,
    lumensSpentWeapon3First2Min: 0,
    lumensSpentOtherFirst2Min: lumensSpent,
    damageAfterZeroLumens: 0,
  };
}

function createEmptyBenchBattleReport() {
  return {
    shotsByWeapon: { 1: 0, 2: 0, 3: 0 },
    hitsByWeapon: { 1: 0, 2: 0, 3: 0 },
    hits: 0,
    damageDelta: 0,
    lumensSpent: 0,
    lumensGained: 0,
    crystalsCollected: 0,
    sparkIds: [],
    weakZoneHitsById: {},
    voiceResults: [],
    baddieDestroyedIds: [],
    baddieDamage: 0,
    maxComboHits: 0,
    maxComboMultiplier: 1,
    heldComboX2MaxDuration: 0,
    reachedX1_5InFirst30s: false,
    phoenixStage: 0,
    lumensSpentWeapon3First2Min: 0,
    lumensSpentOtherFirst2Min: 0,
    damageAfterZeroLumens: 0,
  };
}

function splitBenchBattleNumberAcrossMinutes(total, minutes) {
  const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 1));
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const base = Math.floor(safeTotal / safeMinutes);
  const remainder = safeTotal % safeMinutes;
  return Array.from({ length: safeMinutes }, (_, index) => base + (index < remainder ? 1 : 0));
}

function buildBenchBattleMinutePlan(user, minutes = 5) {
  const safeMinutes = Math.max(1, Math.floor(Number(minutes) || 5));
  const full = buildBenchBattleFinalReport(user);
  const hasBattleFinalTail = Boolean(user?.hasBattleFinalTail);
  const index = getBenchUserIndex(user);
  const tailPercent = hasBattleFinalTail ? (0.08 + ((index % 4) * 0.03)) : 0;
  const splitValue = (value) => {
    const safeValue = Math.max(0, Math.floor(Number(value) || 0));
    const tail = Math.min(safeValue, Math.floor(safeValue * tailPercent));
    return {
      main: safeValue - tail,
      tail,
    };
  };

  const shots1Total = splitValue(full.shotsByWeapon?.[1]);
  const shots2Total = splitValue(full.shotsByWeapon?.[2]);
  const shots3Total = splitValue(full.shotsByWeapon?.[3]);
  const hitsTotal = splitValue(full.hits);
  const hits1Total = splitValue(full.hitsByWeapon?.[1]);
  const hits2Total = splitValue(full.hitsByWeapon?.[2]);
  const hits3Total = splitValue(full.hitsByWeapon?.[3]);
  const damageTotal = splitValue(full.damageDelta);
  const lumensSpentTotal = splitValue(full.lumensSpent);
  const lumensGainedTotal = splitValue(full.lumensGained);
  const crystalsCollectedTotal = splitValue(full.crystalsCollected);
  const baddieDamageTotal = splitValue(full.baddieDamage);
  const heldComboTotal = splitValue(full.heldComboX2MaxDuration);
  const weapon3LumenTotal = splitValue(full.lumensSpentWeapon3First2Min);
  const otherLumenTotal = splitValue(full.lumensSpentOtherFirst2Min);
  const damageAfterZeroTotal = splitValue(full.damageAfterZeroLumens);

  const shots1 = splitBenchBattleNumberAcrossMinutes(shots1Total.main, safeMinutes);
  const shots2 = splitBenchBattleNumberAcrossMinutes(shots2Total.main, safeMinutes);
  const shots3 = splitBenchBattleNumberAcrossMinutes(shots3Total.main, safeMinutes);
  const hits1 = splitBenchBattleNumberAcrossMinutes(hits1Total.main, safeMinutes);
  const hits2 = splitBenchBattleNumberAcrossMinutes(hits2Total.main, safeMinutes);
  const hits3 = splitBenchBattleNumberAcrossMinutes(hits3Total.main, safeMinutes);
  const hits = splitBenchBattleNumberAcrossMinutes(hitsTotal.main, safeMinutes);
  const damage = splitBenchBattleNumberAcrossMinutes(damageTotal.main, safeMinutes);
  const lumensSpent = splitBenchBattleNumberAcrossMinutes(lumensSpentTotal.main, safeMinutes);
  const lumensGained = splitBenchBattleNumberAcrossMinutes(lumensGainedTotal.main, safeMinutes);
  const crystalsCollected = splitBenchBattleNumberAcrossMinutes(crystalsCollectedTotal.main, safeMinutes);
  const baddieDamage = splitBenchBattleNumberAcrossMinutes(baddieDamageTotal.main, safeMinutes);
  const heldComboX2MaxDuration = splitBenchBattleNumberAcrossMinutes(heldComboTotal.main, safeMinutes);
  const lumensSpentWeapon3First2Min = splitBenchBattleNumberAcrossMinutes(weapon3LumenTotal.main, safeMinutes);
  const lumensSpentOtherFirst2Min = splitBenchBattleNumberAcrossMinutes(otherLumenTotal.main, safeMinutes);
  const damageAfterZeroLumens = splitBenchBattleNumberAcrossMinutes(damageAfterZeroTotal.main, safeMinutes);

  const minuteReports = Array.from({ length: safeMinutes }, (_, index) => ({
    ...createEmptyBenchBattleReport(),
    shotsByWeapon: { 1: shots1[index], 2: shots2[index], 3: shots3[index] },
    hitsByWeapon: { 1: hits1[index], 2: hits2[index], 3: hits3[index] },
    hits: hits[index],
    damageDelta: damage[index],
    lumensSpent: lumensSpent[index],
    lumensGained: lumensGained[index],
    crystalsCollected: crystalsCollected[index],
    baddieDamage: baddieDamage[index],
    maxComboHits: index === safeMinutes - 1 ? Math.max(0, Number(full.maxComboHits) || 0) : 0,
    maxComboMultiplier: index === safeMinutes - 1 ? Math.max(1, Number(full.maxComboMultiplier) || 1) : 1,
    heldComboX2MaxDuration: heldComboX2MaxDuration[index],
    reachedX1_5InFirst30s: index === 0 ? Boolean(full.reachedX1_5InFirst30s) : false,
    phoenixStage: index === safeMinutes - 1 ? Math.max(0, Number(full.phoenixStage) || 0) : 0,
    lumensSpentWeapon3First2Min: lumensSpentWeapon3First2Min[index],
    lumensSpentOtherFirst2Min: lumensSpentOtherFirst2Min[index],
    damageAfterZeroLumens: damageAfterZeroLumens[index],
  }));

  return {
    minuteReports,
    finalReport: {
      ...createEmptyBenchBattleReport(),
      shotsByWeapon: { 1: shots1Total.tail, 2: shots2Total.tail, 3: shots3Total.tail },
      hitsByWeapon: { 1: hits1Total.tail, 2: hits2Total.tail, 3: hits3Total.tail },
      hits: hitsTotal.tail,
      damageDelta: damageTotal.tail,
      lumensSpent: lumensSpentTotal.tail,
      lumensGained: lumensGainedTotal.tail,
      crystalsCollected: crystalsCollectedTotal.tail,
      sparkIds: hasBattleFinalTail && crystalsCollectedTotal.tail > 0
        ? Array.from({ length: crystalsCollectedTotal.tail }, (_, sparkIndex) => `tail_spark_${index}_${sparkIndex}`)
        : [],
      weakZoneHitsById: {},
      baddieDamage: baddieDamageTotal.tail,
      maxComboHits: hasBattleFinalTail ? Math.max(0, Number(full.maxComboHits) || 0) : 0,
      maxComboMultiplier: hasBattleFinalTail ? Math.max(1, Number(full.maxComboMultiplier) || 1) : 1,
      heldComboX2MaxDuration: heldComboTotal.tail,
      reachedX1_5InFirst30s: false,
      phoenixStage: hasBattleFinalTail ? Math.max(0, Number(full.phoenixStage) || 0) : 0,
      lumensSpentWeapon3First2Min: weapon3LumenTotal.tail,
      lumensSpentOtherFirst2Min: otherLumenTotal.tail,
      damageAfterZeroLumens: damageAfterZeroTotal.tail,
    },
  };
}

function ensureBenchBattleMinutePlan(user) {
  if (!user || typeof user !== 'object') {
    return buildBenchBattleMinutePlan({}, 5);
  }
  if (!user.__battleMinutePlan || !Array.isArray(user.__battleMinutePlan.minuteReports)) {
    user.__battleMinutePlan = buildBenchBattleMinutePlan(user, BENCH_BATTLE_PLAN_MINUTES);
    user.__battleMinuteIndex = 0;
  }
  return user.__battleMinutePlan;
}

function getBenchBattleMinuteReport(user) {
  const plan = ensureBenchBattleMinutePlan(user);
  const currentIndex = Math.max(0, Math.floor(Number(user?.__battleMinuteIndex) || 0));
  const report = plan.minuteReports[currentIndex] || createEmptyBenchBattleReport();
  if (user && typeof user === 'object') {
    user.__battleMinuteIndex = currentIndex + 1;
    user.__battleTailReport = plan.finalReport || createEmptyBenchBattleReport();
  }
  return report;
}

async function handleBenchBattleUserJoin(req, res, next) {
  try {
    const user = createBenchUserFromRow(getBattleBenchUserOrThrow(req.query?.userId), 'user');
    const joinRes = await invokeController(battleController.joinBattle, {
      user: { _id: user._id, id: user._id },
      body: { joinedAt: new Date().toISOString() },
    });
    return res.status(joinRes.statusCode).json(joinRes.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'bench_join_failed' });
  }
}

async function handleBenchBattleUserHeartbeat(req, res, next) {
  try {
    const sourceUser = getBattleBenchUserOrThrow(req.query?.userId);
    const user = createBenchUserFromRow(sourceUser, 'user');
    if (String(req.query?.expire || '') === '1') {
      await expireBenchBattleBoosts(user._id);
    }
    const battleId = String(req.query?.battleId || state.battle?._id || '').trim();
    const withReport = String(req.query?.withReport || '') === '1';
    const minuteReport = withReport ? getBenchBattleMinuteReport(sourceUser) : null;
    const heartbeatRes = await invokeController(battleController.battleHeartbeat, {
      user: { _id: user._id, id: user._id },
      body: withReport ? {
        battleId,
        reportSequence: nextBenchBattleReportSequence(sourceUser),
        report: minuteReport,
      } : { battleId },
    });
    return res.status(heartbeatRes.statusCode).json(heartbeatRes.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'bench_heartbeat_failed' });
  }
}

async function handleBenchBattleExpireExpiringBoosts(_req, res, next) {
  try {
    const expiringUsers = state.users.filter((row) => String(row?.battleBoostProfile || '') === 'expiring');
    for (const user of expiringUsers) {
      await expireBenchBattleBoosts(user._id);
    }
    return res.json({ ok: true, expired: expiringUsers.length });
  } catch (error) {
    return next(error);
  }
}

async function handleBenchBattleEndNow(_req, res, next) {
  try {
    const battleId = String(state.battle?._id || '').trim();
    if (!battleId) return res.status(404).json({ message: 'battle_not_found' });
    const updated = await patchBattleDoc(battleId, { endsAt: nowIso() });
    await battleService.refreshBattleFinalizeSchedule(battleId).catch(() => {});
    return res.json({ ok: true, battleId, endsAt: updated?.endsAt || null });
  } catch (error) {
    return next(error);
  }
}

async function handleBenchBattleUserFinal(req, res, next) {
  try {
    const sourceUser = getBattleBenchUserOrThrow(req.query?.userId);
    const user = createBenchUserFromRow(sourceUser, 'user');
    const battleId = String(req.query?.battleId || state.battle?._id || '').trim();
    const reportSequence = nextBenchBattleReportSequence(sourceUser);
    const hasFinalTail = Boolean(sourceUser?.hasBattleFinalTail);
    const tailReport = hasFinalTail
      ? (sourceUser.__battleTailReport || createEmptyBenchBattleReport())
      : null;
    const finalRes = await invokeController(battleController.submitDamage, {
      user: { _id: user._id, id: user._id },
      body: {
        battleId,
        action: 'final',
        reportSequence,
        finalMarker: true,
        report: tailReport,
      },
    });
    return res.status(finalRes.statusCode).json(finalRes.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'bench_final_failed' });
  }
}

async function handleBenchBattleFinalizeNow(req, res, next) {
  try {
    const battleId = String(req.query?.battleId || state.battle?._id || '').trim();
    if (!battleId) return res.status(404).json({ message: 'battle_not_found' });
    const battle = await battleService.finalizeBattleWithReports(battleId);
    const updated = await getBattleDocById(battleId);
    state.battle = updated || state.battle;
    return res.json({ ok: Boolean(battle), battleId, status: updated?.status || null });
  } catch (error) {
    return next(error);
  }
}

async function handleBenchBattleUserSummary(req, res, next) {
  try {
    const user = createBenchUserFromRow(getBattleBenchUserOrThrow(req.query?.userId), 'user');
    const battleId = String(req.query?.battleId || state.battle?._id || '').trim();
    const summaryRes = await invokeController(battleController.getBattleSummary, {
      user: { _id: user._id, id: user._id },
      query: { battleId },
    });
    return res.status(summaryRes.statusCode).json(summaryRes.body);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || 'bench_summary_failed' });
  }
}

async function handleBenchBattleSummaryStats(req, res, next) {
  try {
    const battleId = String(req.query?.battleId || state.battle?._id || '').trim();
    if (!battleId) {
      return res.status(404).json({ message: 'battle_not_found' });
    }

    const summaries = await battleRuntimeStore.listFinalSummariesByBattle({ battleId, limit: 50000 }).catch(() => []);
    const totalCount = Array.isArray(summaries) ? summaries.length : 0;
    const completeCount = (Array.isArray(summaries) ? summaries : []).filter((row) => row && row.isComplete === true).length;

    return res.json({
      ok: true,
      battleId,
      totalCount,
      fullCount: completeCount,
      completeCount,
    });
  } catch (error) {
    return next(error);
  }
}

async function handleMeditationIndividualCycle(req, res, next) {
  try {
    const user = createBenchUser('user');
    const settleRes = await invokeRouter(meditationRoutes, {
      method: 'POST',
      url: '/individual/settle',
      user,
      body: { clientSessionId: `${user._id}_bench_session`, completedBreaths: 3 },
    });
    return res.json({ ok: true, settle: settleRes.body });
  } catch (error) {
    return next(error);
  }
}

async function handleMeditationCollectiveCycle(req, res, next) {
  try {
    const user = createBenchUser('user');
    const sessionId = await getCollectiveSessionId();
    const collectiveRes = await invokeController(meditationController.getCollectiveMeditation, {});
    const isActiveSession = Boolean(collectiveRes.body?.activeSession?.id) && String(collectiveRes.body.activeSession.id) === sessionId;
    const optInRes = !isActiveSession
      ? await invokeController(meditationController.optInCollectiveMeditation, {
        user,
        body: { sessionId },
      })
      : null;
    const joinRes = isActiveSession
      ? await invokeRouter(meditationRoutes, {
        method: 'POST',
        url: '/collective/join',
        user,
        body: { sessionId },
      })
      : null;
    const finishRes = isActiveSession
      ? await invokeRouter(meditationRoutes, {
        method: 'POST',
        url: '/collective/finish',
        user,
        body: { sessionId, reportedDurationSeconds: 180, reason: 'completed' },
      })
      : null;
    let participantsRes = null;
    if (Math.random() < 0.5) {
      participantsRes = await invokeController(meditationController.getCollectiveParticipants, {
        user,
        query: { sessionId },
      });
    }
    return res.json({
      ok: true,
      sessionId,
      collective: collectiveRes.body,
      optedIn: optInRes?.body || null,
      joined: joinRes?.body || null,
      finished: finishRes?.body || null,
      participants: participantsRes?.body || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function handleNightShiftCycle(req, res, next) {
  try {
    const pooledUserId = state.nightShiftUsers.length && Math.random() < 0.8
      ? state.nightShiftUsers[randomInt(0, state.nightShiftUsers.length - 1)]
      : null;
    const pooledUser = pooledUserId ? getBenchUserById(pooledUserId) : null;
    const user = pooledUser ? createBenchUserFromRow(pooledUser, 'user') : createBenchUser('user');
    const statusRes = await invokeController(nightShiftController.getStatus, { user });
    const currentNightShift = statusRes.body?.nightShift || null;
    if (!currentNightShift?.isServing && pooledUserId) {
      state.nightShiftUsers = state.nightShiftUsers.filter((id) => id !== pooledUserId);
    }

    if (!currentNightShift?.isServing) {
      const startRes = await invokeController(nightShiftController.startShift, { user });
      let heartbeatRes = null;
      const startWindow = startRes.body?.nightShift?.currentWindow;
      if (startRes.statusCode < 400 && !state.nightShiftUsers.includes(String(user._id))) {
        state.nightShiftUsers.push(String(user._id));
      }
      if (startRes.statusCode < 400 && startWindow?.startedAt && startWindow?.endedAt) {
        heartbeatRes = await invokeController(nightShiftController.heartbeat, {
          user,
          body: {
            shiftSessionId: startRes.body?.shiftSessionId,
            windowStartedAt: startWindow.startedAt,
            windowEndedAt: startWindow.endedAt,
          },
        });
      }
      return res.status(startRes.statusCode).json({
        ok: startRes.statusCode < 400,
        status: statusRes.body,
        start: startRes.body || null,
        heartbeat: heartbeatRes?.body || null,
        end: null,
      });
    }

    const shiftSessionId = currentNightShift.sessionId;
    const shiftStartTime = currentNightShift.startTime || new Date().toISOString();
    const currentWindow = currentNightShift.currentWindow || null;
    if (!currentWindow?.startedAt || !currentWindow?.endedAt) {
      return res.json({
        ok: true,
        status: statusRes.body,
        start: null,
        heartbeat: null,
        end: null,
      });
    }

    const completedWindows = Math.max(0, Math.floor(Number(currentWindow.index) || 0)) + 1;
    const completedHours = Math.floor(completedWindows / 12);
    const hourCheckpoint = ((completedWindows % 12) === 0)
      ? {
        hourIndex: completedHours - 1,
        hourAnomalyCount: 60,
      }
      : {};

    const heartbeatRes = await invokeController(nightShiftController.heartbeat, {
      user,
      body: {
        shiftSessionId,
        windowStartedAt: currentWindow.startedAt,
        windowEndedAt: currentWindow.endedAt,
        ...hourCheckpoint,
      },
    });
    if (heartbeatRes.body?.shouldClose) {
      state.nightShiftUsers = state.nightShiftUsers.filter((id) => id !== String(user._id));
    }

    let endRes = null;
    if (completedWindows >= 12 && Math.random() < 0.15) {
      endRes = await invokeController(nightShiftController.endShift, {
        user,
        body: {
          shiftSessionId,
          startedAt: shiftStartTime,
          endedAt: currentWindow.endedAt,
          totalDurationSeconds: completedWindows * 5 * 60,
          totalAnomalies: completedHours * 60,
          pageHits: { '/news': completedHours * 36, '/shop': completedHours * 24 },
          windowReports: [],
        },
      });
      if (endRes?.statusCode < 400) {
        state.nightShiftUsers = state.nightShiftUsers.filter((id) => id !== String(user._id));
      }
    }

    const statusCode = endRes?.statusCode || heartbeatRes.statusCode;
    return res.status(statusCode).json({
      ok: statusCode < 400,
      status: statusRes.body,
      start: null,
      heartbeat: heartbeatRes.body,
      end: endRes?.body || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function handleCrystalCycle(req, res, next) {
  try {
    const sourceUser = pickCrystalCollectorUser();
    const user = createBenchUserFromRow(sourceUser, 'user');
    let progress = getCrystalCollectorState(user._id);

    if (!progress) {
      const statusRes = await invokeController(crystalController.getCrystalStatus, { user });
      const locations = Array.isArray(statusRes.body?.locations) ? statusRes.body.locations : [];
      const collectionDisabled = Boolean(statusRes.body?.collectionDisabled);
      const rewardGranted = Boolean(statusRes.body?.rewardGranted);

      if (collectionDisabled || rewardGranted || locations.length < 12) {
        if (rewardGranted) {
          setCrystalCollectorState(user._id, {
            sessionKey: String(statusRes.body?.sessionKey || ''),
            locations,
            collectedEntries: [],
            collectedShardIds: [],
            rewardGranted: true,
            collectionDisabled: false,
          });
        }
        return res.json({
          ok: true,
          userId: user._id,
          mode: 'status',
          blocked: collectionDisabled,
          done: rewardGranted,
          collectedCount: 0,
        });
      }

      progress = setCrystalCollectorState(user._id, {
        sessionKey: String(statusRes.body?.sessionKey || ''),
        locations,
        collectedEntries: [],
        collectedShardIds: [],
        rewardGranted: false,
        collectionDisabled: false,
      });
    }

    if (progress.collectionDisabled || progress.rewardGranted) {
      return res.json({
        ok: true,
        userId: user._id,
        mode: progress.collectionDisabled ? 'blocked' : 'done',
        blocked: Boolean(progress.collectionDisabled),
        done: Boolean(progress.rewardGranted),
        collectedCount: Array.isArray(progress.collectedShardIds) ? progress.collectedShardIds.length : 0,
      });
    }

    const seenShardIds = new Set(Array.isArray(progress.collectedShardIds) ? progress.collectedShardIds : []);
    const remaining = (Array.isArray(progress.locations) ? progress.locations : []).filter((location) => !seenShardIds.has(String(location.shardId)));
    const collectNow = Math.min(remaining.length, randomInt(1, 3));
    const newEntries = [];
    for (let index = 0; index < collectNow; index += 1) {
      const location = remaining[index];
      if (!location) break;
      newEntries.push({
        shardId: location.shardId,
        shardIndex: location.shardIndex,
        pagePath: location.url,
        collectedAt: new Date().toISOString(),
      });
    }

    progress = setCrystalCollectorState(user._id, {
      ...progress,
      collectedEntries: [...(Array.isArray(progress.collectedEntries) ? progress.collectedEntries : []), ...newEntries],
      collectedShardIds: [
        ...(Array.isArray(progress.collectedShardIds) ? progress.collectedShardIds : []),
        ...newEntries.map((entry) => String(entry.shardId)),
      ],
    });

    if ((progress.collectedShardIds || []).length < 12) {
      return res.json({
        ok: true,
        userId: user._id,
        mode: 'local_collect',
        blocked: false,
        done: false,
        collectedCount: progress.collectedShardIds.length,
      });
    }

    const collectRes = await invokeController(crystalController.completeCollection, {
      user,
      body: {
        collectedCount: progress.collectedEntries.length,
        collectedEntries: progress.collectedEntries,
      },
    });

    progress = setCrystalCollectorState(user._id, {
      ...progress,
      rewardGranted: collectRes.statusCode < 400 && Boolean(collectRes.body?.rewardGranted),
    });

    return res.status(collectRes.statusCode).json({
      ok: collectRes.statusCode < 400,
      userId: user._id,
      mode: 'complete',
      blocked: false,
      done: Boolean(progress.rewardGranted),
      collectedCount: progress.collectedEntries.length,
    });
  } catch (error) {
    return next(error);
  }
}

async function handleNewsFullCycle(req, res, next) {
  try {
    const user = createBenchUser('user');
    const feedRes = await invokeController(newsController.listPosts, { user, query: { limit: 5 } });
    const baseIndex = Number(String(user._id).replace(/\D/g, '')) || state.cursor;
    const viewPost = pickPostByOffset(baseIndex);
    const likePost = pickPostByOffset(baseIndex + 1);
    const commentPost = pickPostByOffset(baseIndex + 2);
    const repostPost = pickPostByOffset(baseIndex + 3);

    const viewsRes = viewPost
      ? await invokeController(newsController.recordViews, { user, body: { postIds: [viewPost._id] } })
      : null;
    const likeRes = likePost
      ? await invokeController(newsController.interact, { user, params: { id: likePost._id }, body: { type: 'like' } })
      : null;
    const commentRes = commentPost
      ? await invokeController(newsController.interact, {
        user,
        params: { id: commentPost._id },
        body: { type: 'comment', content: `bench comment ${Date.now()}` },
      })
      : null;
    const repostRes = repostPost
      ? await invokeController(newsController.interact, { user, params: { id: repostPost._id }, body: { type: 'repost' } })
      : null;

    return res.json({
      ok: true,
      feedCount: Array.isArray(feedRes.body?.items) ? feedRes.body.items.length : 0,
      views: viewsRes?.body || null,
      like: likeRes?.body || null,
      comment: commentRes?.body || null,
      repost: repostRes?.body || null,
    });
  } catch (error) {
    return next(error);
  }
}

async function handleChatFullCycle(req, res, next) {
  try {
    const chat = pickRandomChat();
    if (!chat) {
      return res.json({ ok: true, skipped: true });
    }
    const user = { _id: chat.participants[0], id: chat.participants[0], role: 'user' };
    const activeRes = await invokeController(chatController.getActiveChat, { user });
    const chatId = activeRes.body?.chat?.id || activeRes.body?.id || chat.id;
    const readRes = await invokeController(chatController.getChatMessages, {
      user,
      params: { chatId },
    });
    const sendRes = await invokeController(chatController.sendChatMessage, {
      user,
      params: { chatId },
      body: { text: 'bench message' },
    });
    return res.json({
      ok: true,
      active: activeRes.body,
      read: readRes.body,
      send: sendRes.body,
    });
  } catch (error) {
    return next(error);
  }
}
async function insertDoc(model, doc, { createdAt, updatedAt } = {}) {
  const id = String(doc?._id || doc?.id || crypto.randomBytes(12).toString('hex'));
  const payload = { ...(doc && typeof doc === 'object' ? doc : {}) };
  payload._id = id;
  delete payload.id;
  const createdAtIso = createdAt ? new Date(createdAt).toISOString() : nowIso();
  const updatedAtIso = updatedAt ? new Date(updatedAt).toISOString() : createdAtIso;
  const { error } = await mockSupabaseClient.from(DOC_TABLE).insert({
    model: String(model),
    id,
    data: payload,
    created_at: createdAtIso,
    updated_at: updatedAtIso,
  });
  if (error) throw error;
  return { ...payload, _id: id, createdAt: createdAtIso, updatedAt: updatedAtIso };
}

async function seedUsers() {
  const chunkSize = 250;
  const users = [];
  for (let start = 0; start < USER_COUNT; start += chunkSize) {
    const now = nowIso();
    const inactiveSeenAt = new Date(Date.now() - (96 * 60 * 60 * 1000)).toISOString();
    const batch = [];
    const size = Math.min(chunkSize, USER_COUNT - start);
    for (let offset = 0; offset < size; offset += 1) {
      const index = start + offset;
      const id = `benchuser${index}`;
      const seedPhrase = buildBenchSeedPhrase(index);
      const isActive = index < ACTIVE_USER_COUNT;
      const hasPendingBattleBoosts = index < BATTLE_PENDING_BOOST_USERS;
      const hasExpiringBattleBoosts = !hasPendingBattleBoosts
        && index < (BATTLE_PENDING_BOOST_USERS + BATTLE_EXPIRING_BOOST_USERS);
      const hasBattleFinalTail = index < BENCH_BATTLE_TAIL_USER_COUNT;
      const gender = index % 2 === 0 ? 'male' : 'female';
      const preferredGender = gender === 'male' ? 'female' : 'male';
      const age = 18 + (index % 48);
      const birthYear = 2026 - age;
      const birthDate = `${birthYear}-06-15`;
      const lastSeenAt = isActive ? now : inactiveSeenAt;
      const shopBoosts = hasPendingBattleBoosts || hasExpiringBattleBoosts
        ? {
            battleDamage: { pending: true },
            battleLumensDiscount: { pending: true },
            weakZoneDamage: { pending: true },
          }
        : {};
      batch.push({
        id,
        nickname: `benchuser${index}`,
        email: `benchuser${index}@choizze.test`,
        role: 'user',
        status: isActive ? 'active' : 'idle',
        email_confirmed: true,
        email_confirmed_at: now,
        last_online_at: lastSeenAt,
        last_seen_at: lastSeenAt,
        data: {
          seedPhrase,
          lumens: 1000000,
          cp: 0,
          stars: 0,
          nickname: `benchuser${index}`,
          role: 'user',
          status: isActive ? 'active' : 'idle',
          emailConfirmed: true,
          quietWatchPassed: isActive,
          lastOnlineAt: lastSeenAt,
          lastSeenAt: lastSeenAt,
          gender,
          birthDate,
          preferredGender,
          preferredAgeFrom: Math.max(18, age - 2),
          preferredAgeTo: age + 2,
          treeBranch: null,
          nightShift: {},
          shopBoosts,
          achievementStats: {},
        },
        created_at: now,
        updated_at: now,
      });
      users.push({
        _id: id,
        email: `benchuser${index}@choizze.test`,
        nickname: `benchuser${index}`,
        seedPhrase,
        battleBoostProfile: hasPendingBattleBoosts ? 'pending' : (hasExpiringBattleBoosts ? 'expiring' : 'none'),
        hasBattleFinalTail,
      });
    }
    const { error } = await mockSupabaseClient.from('users').insert(batch);
    if (error) throw error;
  }
  return users;
}

async function reseed() {
  if (typeof mockStore.__reset === 'function') mockStore.__reset();
  if (typeof mockSupabaseClient.__reset === 'function') mockSupabaseClient.__reset();
  if (typeof quoteController.__resetQuoteControllerRuntimeState === 'function') quoteController.__resetQuoteControllerRuntimeState();
  if (typeof newsController.__resetNewsControllerRuntimeState === 'function') newsController.__resetNewsControllerRuntimeState();
  if (typeof adController.__resetAdControllerRuntimeState === 'function') adController.__resetAdControllerRuntimeState();
  if (typeof crystalController.__resetCrystalControllerRuntimeState === 'function') crystalController.__resetCrystalControllerRuntimeState();

  state.cursor = 0;
  state.users = await seedUsers();
  state.nightShiftUsers = [];
  resetCrystalCollectors();

  const now = Date.now();
  await setSetting(meditationController.COLLECTIVE_MEDITATION_SCHEDULE_KEY, [
    {
      id: 'bench_collective_active',
      startsAt: now - 60 * 1000,
      phase1Min: 1,
      phase2Min: 1,
      rounds: 3,
      weText: 'Bench collective meditation',
    },
  ]);

  const seededBattleStartMs = Date.now();
  const seededBattleStartAt = new Date(seededBattleStartMs).toISOString();
  state.battle = await insertDoc('Battle', {
    status: 'active',
    startsAt: seededBattleStartAt,
    firstPlayerJoinedAt: seededBattleStartAt,
    endsAt: new Date(seededBattleStartMs + (BENCH_BATTLE_DURATION_SECONDS * 1000)).toISOString(),
    durationSeconds: BENCH_BATTLE_DURATION_SECONDS,
    attendanceCount: 0,
    attendance: [],
    lightDamage: 0,
    darkDamage: 0,
  });

  await insertDoc('Quote', {
    text: 'Benchmark daily quote',
    author: 'Choizze Bench',
    dayOfWeek: adjustedDayOfWeek(),
    isActive: true,
  });

  const categories = await Promise.all([
    insertDoc('NewsCategory', { name: 'Alpha', slug: 'alpha' }),
    insertDoc('NewsCategory', { name: 'Beta', slug: 'beta' }),
    insertDoc('NewsCategory', { name: 'Gamma', slug: 'gamma' }),
  ]);

  const posts = [];
  for (let i = 0; i < 120; i += 1) {
    posts.push(await insertDoc('NewsPost', {
      title: `Benchmark post ${i}`,
      content: `Synthetic benchmark post ${i}`,
      category: categories[i % categories.length]._id,
      status: 'published',
      publishedAt: new Date(Date.now() - i * 60000).toISOString(),
      stats: { likes: 1, comments: 1, reposts: 1 },
    }));
  }
  state.posts = posts;

  const today = new Date().toISOString().slice(0, 10);
  const interactionTasks = [];
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    const likeUser = state.users[i % state.users.length]?._id;
    const commentUser = state.users[(i + 1) % state.users.length]?._id;
    const repostUser = state.users[(i + 2) % state.users.length]?._id;
    interactionTasks.push(insertDoc('NewsInteraction', { user: likeUser, post: post._id, type: 'like', dateKey: today }));
    interactionTasks.push(insertDoc('NewsInteraction', { user: commentUser, post: post._id, type: 'comment', content: 'bench', dateKey: today }));
    interactionTasks.push(insertDoc('NewsInteraction', { user: repostUser, post: post._id, type: 'repost', dateKey: today }));
  }
  await Promise.all(interactionTasks);
  await insertDoc('NewsViewBucket', {
    user: state.users[0]?._id,
    dateKey: today,
    postIds: posts.slice(0, 60).map((post) => post._id),
    updatedAt: new Date().toISOString(),
  }, { updatedAt: new Date().toISOString() });

  const chats = [];
  const chatCount = Math.max(10, Math.min(200, Math.floor(state.users.length / 2)));
  for (let i = 0; i < chatCount; i += 1) {
    const userA = state.users[i * 2];
    const userB = state.users[i * 2 + 1];
    if (!userA || !userB) break;
    const chatId = `chat_${i}`;
    const nowIso = new Date().toISOString();
    await mockSupabaseClient.from('chats').insert({
      id: chatId,
      participants: [userA._id, userB._id],
      status: 'active',
      started_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
      messages_count: {},
      ratings: [],
      hidden_for: [],
      complaint: null,
      k_awarded: false,
      waiting_state: null,
      disconnection_count: {},
    });
    await mockSupabaseClient.from('chat_messages').insert({
      id: `msg_${chatId}_0`,
      chat_id: chatId,
      sender_id: userA._id,
      original_text: 'bench hello',
      translated_text: null,
      original_lang: 'ru',
      target_lang: 'ru',
      status: 'sent',
      created_at: nowIso,
      updated_at: nowIso,
    });
    chats.push({ id: chatId, participants: [userA._id, userB._id] });
  }
  state.chats = chats;

  const solarSeedTasks = state.users.slice(0, 200).map((user) => mockSupabaseClient.from('solar_charges').upsert({
    user_id: user._id,
    current_lm: 50,
    capacity_lm: 100,
    last_collected_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    next_available_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    total_collected_lm: 250,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' }));
  await Promise.all(solarSeedTasks);

  await Promise.all(Array.from({ length: 24 }, (_, i) => insertDoc('AdCreative', {
    name: `Creative ${i}`,
    type: 'image',
    content: `https://example.com/banner-${i}.png`,
    link: 'https://example.com',
    targetPages: ['all', '/news'],
    targetPlacements: ['all', 'top'],
    active: true,
    priority: 24 - i,
    startDate: null,
    endDate: null,
  })));

  if (state.battle?._id) {
    const liveBattleStartMs = Date.now();
    const liveBattleStartAt = new Date(liveBattleStartMs).toISOString();
    await patchBattleDoc(state.battle._id, {
      startsAt: liveBattleStartAt,
      firstPlayerJoinedAt: liveBattleStartAt,
      endsAt: new Date(liveBattleStartMs + (BENCH_BATTLE_DURATION_SECONDS * 1000)).toISOString(),
      durationSeconds: BENCH_BATTLE_DURATION_SECONDS,
    });
    await battleService.refreshBattleFinalizeSchedule(state.battle._id).catch(() => {});
  }
}

function benchInfo() {
  const memory = process.memoryUsage();
  return {
    users: state.users.length,
    battleId: state.battle?._id || null,
    memoryMb: {
      rss: Math.round(memory.rss / 1024 / 1024),
      heapUsed: Math.round(memory.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memory.heapTotal / 1024 / 1024),
    },
  };
}

async function main() {
  await reseed();
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true, ...benchInfo() }));
  app.get('/bench/info', (_req, res) => res.json(benchInfo()));
  app.get('/bench/reset', async (_req, res, next) => {
    try {
      await reseed();
      res.json({ ok: true, ...benchInfo() });
    } catch (error) {
      next(error);
    }
  });
  app.get('/bench/quotes/active', (req, res) => quoteController.getActiveQuote(req, res));
  app.get('/bench/news/categories', (req, res, next) => newsController.listCategories(req, res, next));
  app.get('/bench/news', async (req, res, next) => {
    try {
      req.user = { _id: nextUser()._id };
      req.query = req.query || {};
      await newsController.listPosts(req, res, next);
    } catch (error) {
      next(error);
    }
  });
  app.get('/bench/ads/rotation', (req, res) => adController.getRotation(req, res));
  app.get('/bench/ads/creative', (req, res) => {
    req.query = { page: '/news', placement: 'top' };
    return adController.getActiveCreative(req, res);
  });
  app.get('/bench/page', async (req, res, next) => {
    try {
      const path = String(req.query?.path || '/');
      req.user = createBenchUser('user');
      if (path === '/news') {
        return newsController.listPosts(req, res, next);
      }
      if (path === '/battle') {
        return battleController.getCurrentBattle(req, res, next);
      }
      if (path === '/chat') {
        return chatController.getActiveChat(req, res, next);
      }
      if (path === '/tree') {
        return treeController.getTreeStatus(req, res);
      }
      if (path === '/solar') {
        return solarController.getSolarStatus(req, res);
      }
      if (path === '/practice/meditation/we') {
        return meditationController.getCollectiveMeditation(req, res);
      }
      if (path === '/activity/night-shift') {
        return nightShiftController.getStatus(req, res);
      }
      if (path === '/activity/collect') {
        return crystalController.getCrystalStatus(req, res);
      }
      return res.json({ ok: true, path });
    } catch (error) {
      return next(error);
    }
  });
  app.get('/bench/battle/users', async (_req, res) => {
    res.json({
      ok: true,
      battleId: state.battle?._id || null,
      users: state.users.map((user) => ({
        userId: user._id,
        battleBoostProfile: String(user?.battleBoostProfile || 'none'),
        hasFinalTail: Boolean(user?.hasBattleFinalTail),
      })),
    });
  });
  app.get('/bench/battle/user/join', handleBenchBattleUserJoin);
  app.get('/bench/battle/user/heartbeat', handleBenchBattleUserHeartbeat);
  app.get('/bench/battle/expire-expiring-boosts', handleBenchBattleExpireExpiringBoosts);
  app.get('/bench/battle/end-now', handleBenchBattleEndNow);
  app.get('/bench/battle/user/final', handleBenchBattleUserFinal);
  app.get('/bench/battle/finalize-now', handleBenchBattleFinalizeNow);
  app.get('/bench/battle/user/summary', handleBenchBattleUserSummary);
  app.get('/bench/battle/summary-stats', handleBenchBattleSummaryStats);
  app.all('/bench/action/:mechanic', async (req, res, next) => {
    try {
      const mechanic = String(req.params?.mechanic || '').trim();
      if (mechanic === 'battle' || mechanic === 'battle_full') {
        return handleBattleCycle(req, res, next);
      }
      if (mechanic === 'news' || mechanic === 'news_full') {
        return handleNewsFullCycle(req, res, next);
      }
      if (mechanic === 'chat' || mechanic === 'chat_full') {
        return handleChatFullCycle(req, res, next);
      }
      if (mechanic === 'chat_view') {
        const chat = pickRandomChat();
        if (!chat) return res.json({ ok: true, skipped: true });
        return chatController.getChatMessages({
          user: { _id: chat.participants[0], id: chat.participants[0], role: 'user' },
          params: { chatId: chat.id },
        }, res);
      }
      if (mechanic === 'meditation' || mechanic === 'meditation_collective') {
        return handleMeditationCollectiveCycle(req, res, next);
      }
      if (mechanic === 'meditation_individual') {
        return handleMeditationIndividualCycle(req, res, next);
      }
      if (mechanic === 'night_shift') {
        return handleNightShiftCycle(req, res, next);
      }
      if (mechanic === 'crystal') {
        return handleCrystalCycle(req, res, next);
      }
      req.user = createBenchUser('user');
      await recordBenchAction(mechanic || 'misc', req.user._id);
      return res.json({ ok: true, mechanic });
    } catch (error) {
      return next(error);
    }
  });
  app.get('/bench/battle/cycle', handleBattleCycle);
  app.use((error, _req, res, _next) => {
    console.error('[mock-bench] request failed', error);
    res.status(500).json({ message: error.message || 'Server error' });
  });

  app.listen(PORT, () => {
    console.log(`[mock-bench] listening on http://127.0.0.1:${PORT}`);
    console.log(`[mock-bench] seeded users=${state.users.length} battleId=${state.battle._id}`);
  });
}

main().catch((error) => {
  console.error('[mock-bench] FAILED');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});

