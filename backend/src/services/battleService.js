const { sendBattleResultEmail, sendGenericEventEmail } = require('./emailService');
const { broadcastNotificationByPresence } = require('./notificationService');
const { awardBattleSc } = require('./scService');
const { getFrontendBaseUrl } = require('../config/env');
const { forEachUserBatch } = require('./userBatchService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const battleRuntimeStore = require('./battleRuntimeStore');
const { prepareBattleSummaries } = require('./battleSummaryService');
const { computeBattleRewardSc } = require('../utils/battleReward');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : (data.createdAt || null),
    updatedAt: row.updated_at ? new Date(row.updated_at) : (data.updatedAt || null),
  };
}

async function getModelDocById(model, id) {
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', String(model))
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function insertModelDoc(model, payload) {
  const supabase = getSupabaseClient();
  const id = payload && (payload._id || payload.id) ? String(payload._id || payload.id) : `${String(model)}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({ id, model: String(model), data: doc })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function updateModelDoc(model, id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();
  const current = await getModelDocById(model, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  delete next._id;
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: next })
    .eq('model', String(model))
    .eq('id', String(id))
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function listModelDocs(model) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = 1000;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', String(model))
      .range(from, from + size - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += data.length;
  }
  return out;
}

async function getLatestModelDoc(model) {
  const all = await listModelDocs(model);
  all.sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  return all[0] || null;
}

const DEFAULT_DURATION_SECONDS = parseInt(process.env.BATTLE_DURATION_SECONDS || '900', 10);
const TICK_SECONDS = parseInt(process.env.BATTLE_TICK_SECONDS || '5', 10);
const DARKNESS_DAMAGE_BASE = parseInt(process.env.DARKNESS_DAMAGE_BASE || '5', 10);
const DARKNESS_DAMAGE_NO_ATTENDANCE = parseInt(process.env.DARKNESS_DAMAGE_NO_ATTENDANCE || '20', 10);
const LIGHT_DAMAGE_PER_PLAYER = parseInt(process.env.LIGHT_DAMAGE_PER_PLAYER || '3', 10);

const DARKNESS_DAMAGE_PER_TARGET_USER = parseInt(process.env.DARKNESS_DAMAGE_PER_TARGET_USER || '500', 10);
const GUARDIAN_DAMAGE_BEFORE_FIRST_JOIN = parseInt(process.env.GUARDIAN_DAMAGE_BEFORE_FIRST_JOIN || '500', 10);
const GUARDIAN_DAMAGE_AFTER_FIRST_JOIN = parseInt(process.env.GUARDIAN_DAMAGE_AFTER_FIRST_JOIN || '250', 10);

const BATTLE_BASE_DURATION_SECONDS = 60 * 60;
const BATTLE_MIN_DURATION_SECONDS = 15 * 60;
const BATTLE_NO_ENTRY_DURATION_SECONDS = 3 * 60 * 60;
const BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS = 0.0054;
const BATTLE_SYNC_SLOT_COUNT = Math.max(1, parseInt(process.env.BATTLE_SYNC_SLOT_COUNT || '60', 10) || 60);
const BATTLE_SYNC_INTERVAL_SECONDS = Math.max(1, parseInt(process.env.BATTLE_SYNC_INTERVAL_SECONDS || '60', 10) || 60);
const BATTLE_FINAL_REPORT_ACCEPT_SECONDS = Math.max(1, parseInt(process.env.BATTLE_FINAL_REPORT_ACCEPT_SECONDS || '30', 10) || 30);
const BATTLE_FINAL_WINDOW_SECONDS = BATTLE_FINAL_REPORT_ACCEPT_SECONDS;
const BATTLE_FINAL_REPORT_RETRY_INTERVAL_MS = Math.max(250, parseInt(process.env.BATTLE_FINAL_REPORT_RETRY_INTERVAL_MS || '2000', 10) || 2000);
const BATTLE_FINAL_REPORT_WINDOW_CAPACITY = Math.max(1, parseInt(process.env.BATTLE_FINAL_REPORT_WINDOW_CAPACITY || '2000', 10) || 2000);
const BATTLE_FINAL_MIN_DAMAGE_PCT = Math.max(0, Math.min(1, Number(process.env.BATTLE_FINAL_MIN_DAMAGE_PCT || '0.1')));
const BATTLE_FINAL_DEFER_MIN_MS = Math.max(0, Number(process.env.BATTLE_FINAL_DEFER_MIN_MS || (2 * 60 * 1000)));
const BATTLE_FINAL_DEFER_MAX_MS = Math.max(BATTLE_FINAL_DEFER_MIN_MS, Number(process.env.BATTLE_FINAL_DEFER_MAX_MS || (5 * 60 * 1000)));
const battleEarlyFinalizeLocks = new Set();
const battleFinalizeTimers = new Map();
const CURRENT_BATTLE_POINTER_KIND = 'current';
const UPCOMING_BATTLE_POINTER_KIND = 'upcoming';

const GLOBAL_DEBUFF_NO_ENTRY_PERCENT = 5;
const TREE_INJURY_REWARD_DEBUFF_PERCENT = 50;

const BATTLE_POLICY = Object.freeze({
  timerMode: 'dynamic_attendance',
  noParticipantsDurationSeconds: BATTLE_NO_ENTRY_DURATION_SECONDS,
  firstJoinDurationSeconds: BATTLE_BASE_DURATION_SECONDS,
  minDurationSeconds: BATTLE_MIN_DURATION_SECONDS,
  shrinkPerNewPlayerSeconds: BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS,
  sync: Object.freeze({
    slotCount: BATTLE_SYNC_SLOT_COUNT,
    intervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  }),
});

const ACTIVE_HOURS_WINDOW = 72;

function clearBattleFinalizeSchedule(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return;
  const current = battleFinalizeTimers.get(safeBattleId);
  if (current?.timer) {
    clearTimeout(current.timer);
  }
  battleFinalizeTimers.delete(safeBattleId);
}

function clearBattleTransientState(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return;
  clearBattleFinalizeSchedule(safeBattleId);
  battleEarlyFinalizeLocks.delete(safeBattleId);
}

function clearAllBattleTransientState() {
  for (const battleId of Array.from(battleFinalizeTimers.keys())) {
    clearBattleFinalizeSchedule(battleId);
  }
  battleEarlyFinalizeLocks.clear();
}

async function getBattleById(battleId) {
  return getModelDocById('Battle', battleId);
}

function getBattleFinalizeAtMs(battleLike) {
  const endsAtMs = battleLike?.endsAt ? new Date(battleLike.endsAt).getTime() : NaN;
  if (!Number.isFinite(endsAtMs)) return NaN;
  return endsAtMs + (BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000);
}

function scheduleBattleFinalize(battleLike) {
  const battleId = String(battleLike?._id || '').trim();
  if (!battleId) return false;
  if (String(battleLike?.status || '') !== 'active') {
    clearBattleFinalizeSchedule(battleId);
    return false;
  }

  const runAtMs = getBattleFinalizeAtMs(battleLike);
  if (!Number.isFinite(runAtMs)) {
    clearBattleFinalizeSchedule(battleId);
    return false;
  }

  const existing = battleFinalizeTimers.get(battleId);
  if (existing && Number(existing.runAtMs) === runAtMs) {
    return true;
  }

  clearBattleFinalizeSchedule(battleId);

  // Через 60 секунд после конца боя сервер сам запускает финальный подсчёт,
  // если все участники не отметились раньше.
  // Клиент не должен будить этот момент отдельным запросом.
  const delayMs = Math.max(0, runAtMs - Date.now());
  const timer = setTimeout(() => {
    battleFinalizeTimers.delete(battleId);
    tryFinalizeBattleIfReady(battleId).catch((error) => {
      console.error('battle finalize timer error:', error);
    });
  }, delayMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  battleFinalizeTimers.set(battleId, { runAtMs, timer });
  return true;
}

async function refreshBattleFinalizeSchedule(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return null;
  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle) {
    clearBattleFinalizeSchedule(safeBattleId);
    return null;
  }
  scheduleBattleFinalize(battle);
  return battle;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function updateUserDataById(userId, patch, { userRow = null } = {}) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = userRow || await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,email,nickname,data')
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

function toId(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id);
    if (value.id != null) return toId(value.id);
  }
  return '';
}

async function listUsersPage({ from = 0, limit = 200 } = {}) {
  const supabase = getSupabaseClient();
  const safeFrom = Math.max(0, Number(from) || 0);
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 200));
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,role,status,email_confirmed,last_online_at,last_seen_at,data')
    .range(safeFrom, safeFrom + safeLimit - 1);
  if (error || !Array.isArray(data)) return [];
  return data;
}

async function getUsersByIds(userIds = []) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((v) => String(v || '').trim()).filter(Boolean))];
  if (!ids.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .in('id', ids);
  if (error || !Array.isArray(data)) return [];
  return data;
}

function getActiveUsersThresholdDate(now = new Date()) {
  return new Date(new Date(now).getTime() - ACTIVE_HOURS_WINDOW * 60 * 60 * 1000);
}

async function getActiveUsersCountSnapshot(now = new Date()) {
  const threshold = getActiveUsersThresholdDate(now);

  const thresholdMs = new Date(threshold).getTime();
  const isRecentEnough = (value) => {
    if (!value) return false;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() >= thresholdMs;
  };
  const isAdminEmail = (email) => /@admin(\.|$)/i.test(String(email || ''));

  const strictFilter = (row) => {
    const data = getUserData(row);
    const status = String(data.status || row.status || '');
    if (status !== 'active') return false;
    const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
    if (!emailConfirmed) return false;
    if (isAdminEmail(row.email || data.email)) return false;
    const recent = isRecentEnough(data.lastOnlineAt || row.last_online_at) || isRecentEnough(data.lastSeenAt || row.last_seen_at);
    if (!recent) return false;
    return Boolean(data.quietWatchPassed);
  };

  const fallbackFilter = (row) => {
    const data = getUserData(row);
    const status = String(data.status || row.status || '');
    if (status !== 'active') return false;
    const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
    if (!emailConfirmed) return false;
    if (isAdminEmail(row.email || data.email)) return false;
    const recent = isRecentEnough(data.lastOnlineAt || row.last_online_at) || isRecentEnough(data.lastSeenAt || row.last_seen_at);
    if (!recent) return false;
    const role = String(data.role || row.role || '');
    return role === 'user';
  };

  const pageSize = 500;
  let offset = 0;
  let strictCount = 0;
  let fallbackCount = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await listUsersPage({ from: offset, limit: pageSize });
    if (!rows.length) break;
    for (const row of rows) {
      if (strictFilter(row)) strictCount += 1;
      if (fallbackFilter(row)) fallbackCount += 1;
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  if (strictCount > 0) return strictCount;
  return fallbackCount;
}

async function getWorldLivingUsersCount() {
  const isAdminEmail = (email) => /@admin(\.|$)/i.test(String(email || ''));
  const pageSize = 500;
  let offset = 0;
  let total = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await listUsersPage({ from: offset, limit: pageSize });
    if (!rows.length) break;
    for (const row of rows) {
      const data = getUserData(row);
      const status = String(data.status || row.status || '');
      if (status !== 'active') continue;
      const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
      if (!emailConfirmed) continue;
      const role = String(data.role || row.role || '');
      if (role !== 'user') continue;
      if (isAdminEmail(row.email || data.email)) continue;
      total += 1;
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
  }

  return total;
}

const ENEMY_PLANE_Z = -260;
const ENEMY_BOUNDS = {
  minX: -368.32,
  maxX: 368.32,
  minY: -207.18,
  maxY: 207.18,
};
const ENEMY_OUTLINE_WIDTH = ENEMY_BOUNDS.maxX - ENEMY_BOUNDS.minX;
const ENEMY_OUTLINE_HEIGHT = ENEMY_BOUNDS.maxY - ENEMY_BOUNDS.minY;
const BASE_DOME_CENTER = { x: 0.5, y: 0.57 };
const BASE_DOME_RADIUS = 0.21;
const BASE_DOME_VISUAL_SCALE = 1.05;

const WEAK_ZONE_X_SEGMENTS = [-160, -110, -60, -10, 40, 90, 160];
const WEAK_ZONE_Y_SEGMENTS = [-60, -10, 40, 90, 140, 180];
const WEAK_ZONE_EXCLUDED_BASE_CELLS = new Set([12, 14]);
const WEAK_ZONE_SUBDIVISIONS = 3;
const WEAK_ZONE_EXCLUDED_ORDINALS = new Set([
  61, 62, 63, 58, 59, 55, 54, 53, 24, 21, 7, 4, 1, 115, 80, 81, 78, 75, 27, 90,
]);

const VOICE_COMMAND_DELAY_MIN_MS = 15000;
const VOICE_COMMAND_DELAY_MAX_MS = 45000;
const VOICE_COMMAND_DURATION_MIN_MS = 10000;
const VOICE_COMMAND_DURATION_MAX_MS = 15000;
const WEAK_ZONE_DELAY_MIN_MS = 15000;
const WEAK_ZONE_DELAY_MAX_MS = 45000;
const WEAK_ZONE_DURATION_MIN_MS = 10000;
const WEAK_ZONE_DURATION_MAX_MS = 15000;
const WEAK_ZONE_RADIUS = 55;
const VOICE_SLIDER_STEP = 5;
const VOICE_SLIDER_MIN = -50;
const VOICE_SLIDER_MAX = 50;
const SPARK_DELAY_MIN_MS = 15000;
const SPARK_DELAY_MAX_MS = 60000;
const SPARK_REWARD_LUMENS = 100;
const SPARK_BASE_SPEED = 0.0102;
const BADDIE_DELAY_MIN_MS = 15000;
const BADDIE_DELAY_MAX_MS = 30000;
const BADDIE_SIZE_RANGE = [0.045, 0.09];
const BADDIE_DAMAGE_INTERVAL_MS = 1000;
const BADDIE_COLORS = ['#2a0404', '#3a0707', '#4b0c0c', '#5b0b12', '#2b0a12'];
const BADDIE_SHAPES = ['spike', 'crystal'];
const BATTLE_SCENARIO_VERSION = 3;

const BATTLE_START_NOTIFICATION = {
  type: 'game',
  eventKey: 'battle_start',
  title: 'Мрак напал на Древо',
  message: 'Мрак напал! Войдите в бой и защитите Древо.',
  link: '/battle',
};

const BATTLE_START_EMAIL_SUBJECT = 'Мрак напал на Древо — срочно в бой';
const BATTLE_START_NOTIFY_BATCH = 200;
const CURRENT_BATTLE_SELECT = [
  '_id',
  'status',
  'startsAt',
  'endsAt',
  'durationSeconds',
  'darknessDamage',
  'lightDamage',
  'sectorDarknessDamagePerUser',
  'attendanceCount',
  'activeUsersCountSnapshot',
  'globalDebuffActive',
  'globalDebuffPercent',
  'firstPlayerJoinedAt',
  'scheduleSource',
  'scheduledIntervalHours',
  'injuries',
  'injury',
  'isShrunken',
  'createdAt',
  'updatedAt',
].join(' ');

const WEAK_ZONE_CELLS = (() => {
  const rows = WEAK_ZONE_Y_SEGMENTS.length - 1;
  const cols = WEAK_ZONE_X_SEGMENTS.length - 1;
  const cells = [];
  for (let baseRow = 0; baseRow < rows; baseRow++) {
    for (let baseCol = 0; baseCol < cols; baseCol++) {
      const baseIndexZero = baseRow * cols + baseCol;
      if (WEAK_ZONE_EXCLUDED_BASE_CELLS.has(baseIndexZero)) continue;

      const baseMinX = WEAK_ZONE_X_SEGMENTS[baseCol];
      const baseMaxX = WEAK_ZONE_X_SEGMENTS[baseCol + 1];
      const baseMinY = WEAK_ZONE_Y_SEGMENTS[baseRow];
      const baseMaxY = WEAK_ZONE_Y_SEGMENTS[baseRow + 1];

      for (let subRow = 0; subRow < WEAK_ZONE_SUBDIVISIONS; subRow++) {
        for (let subCol = 0; subCol < WEAK_ZONE_SUBDIVISIONS; subCol++) {
          const minX = baseMinX + ((baseMaxX - baseMinX) * subCol) / WEAK_ZONE_SUBDIVISIONS;
          const maxX = baseMinX + ((baseMaxX - baseMinX) * (subCol + 1)) / WEAK_ZONE_SUBDIVISIONS;
          const minY = baseMinY + ((baseMaxY - baseMinY) * subRow) / WEAK_ZONE_SUBDIVISIONS;
          const maxY = baseMinY + ((baseMaxY - baseMinY) * (subRow + 1)) / WEAK_ZONE_SUBDIVISIONS;
          const subIndex = subRow * WEAK_ZONE_SUBDIVISIONS + subCol + 1;
          const ordinal = baseIndexZero * (WEAK_ZONE_SUBDIVISIONS * WEAK_ZONE_SUBDIVISIONS) + subIndex;
          if (WEAK_ZONE_EXCLUDED_ORDINALS.has(ordinal)) continue;
          cells.push({ minX, maxX, minY, maxY });
        }
      }
    }
  }
  return cells;
})();

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

async function runInBatches(items, batchSize, handler) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeBatchSize = Math.max(1, Number(batchSize) || 1);
  for (let offset = 0; offset < safeItems.length; offset += safeBatchSize) {
    // Keep concurrency bounded so one finished battle does not create a thundering herd.
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(safeItems.slice(offset, offset + safeBatchSize).map(handler));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randBetween(min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.random() * (hi - lo);
}

function computeBattleScenarioDurationSeconds(battleLike) {
  const safeDuration = Math.max(0, Number(battleLike?.durationSeconds) || 0);
  if (safeDuration > 0) return safeDuration;
  if (battleLike?.firstPlayerJoinedAt) return BATTLE_BASE_DURATION_SECONDS;
  return BATTLE_NO_ENTRY_DURATION_SECONDS;
}

function buildBattleScenario(battleLike) {
  const battleId = String(battleLike?._id || battleLike?.id || `battle_${Date.now()}`);
  const durationSeconds = computeBattleScenarioDurationSeconds(battleLike);
  const durationMs = durationSeconds * 1000;
  const weakZones = [];
  const voiceCommands = [];
  const sparks = [];
  const baddieWaves = [];

  let weakCursorMs = 0;
  let weakIndex = 0;
  while (weakCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:weak:${weakIndex}`));
    const delayMs = WEAK_ZONE_DELAY_MIN_MS
      + Math.floor(rand() * (WEAK_ZONE_DELAY_MAX_MS - WEAK_ZONE_DELAY_MIN_MS + 1));
    const durationWindowMs = WEAK_ZONE_DURATION_MIN_MS
      + Math.floor(rand() * (WEAK_ZONE_DURATION_MAX_MS - WEAK_ZONE_DURATION_MIN_MS + 1));
    const startOffsetMs = weakCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;
    const endOffsetMs = Math.min(durationMs, startOffsetMs + durationWindowMs);
    const cell = WEAK_ZONE_CELLS.length
      ? WEAK_ZONE_CELLS[Math.min(WEAK_ZONE_CELLS.length - 1, Math.floor(rand() * WEAK_ZONE_CELLS.length))]
      : ENEMY_BOUNDS;
    const x = cell.minX + rand() * (cell.maxX - cell.minX);
    const y = cell.minY + rand() * (cell.maxY - cell.minY);
    weakZones.push({
      id: `weak_${weakIndex}`,
      startOffsetMs,
      endOffsetMs,
      radius: WEAK_ZONE_RADIUS,
      center: {
        x: clamp(x, ENEMY_BOUNDS.minX, ENEMY_BOUNDS.maxX),
        y: clamp(y, ENEMY_BOUNDS.minY, ENEMY_BOUNDS.maxY),
        z: ENEMY_PLANE_Z,
      },
    });
    weakCursorMs = endOffsetMs;
    weakIndex += 1;
  }

  let voiceCursorMs = 0;
  let voiceIndex = 0;
  while (voiceCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:voice:${voiceIndex}`));
    const delayMs = VOICE_COMMAND_DELAY_MIN_MS
      + Math.floor(rand() * (VOICE_COMMAND_DELAY_MAX_MS - VOICE_COMMAND_DELAY_MIN_MS + 1));
    const durationWindowMs = VOICE_COMMAND_DURATION_MIN_MS
      + Math.floor(rand() * (VOICE_COMMAND_DURATION_MAX_MS - VOICE_COMMAND_DURATION_MIN_MS + 1));
    const startOffsetMs = voiceCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;
    const endOffsetMs = Math.min(durationMs, startOffsetMs + durationWindowMs);
    const text = rand() > 0.5 ? 'СТРЕЛЯЙ' : 'СТОЙ';
    voiceCommands.push({
      id: `voice_${voiceIndex}`,
      startOffsetMs,
      endOffsetMs,
      durationMs: endOffsetMs - startOffsetMs,
      text,
      requireShot: text === 'СТОЙ',
    });
    voiceCursorMs = endOffsetMs;
    voiceIndex += 1;
  }

  let sparkCursorMs = 0;
  let sparkIndex = 0;
  while (sparkCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:spark:${sparkIndex}`));
    const delayMs = SPARK_DELAY_MIN_MS
      + Math.floor(rand() * (SPARK_DELAY_MAX_MS - SPARK_DELAY_MIN_MS + 1));
    const startOffsetMs = sparkCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;
    const x = 0.1 + rand() * 0.8;
    const y = 0.2 + rand() * 0.6;
    const angle = (rand() - 0.5) * 0.7;
    const direction = rand() > 0.5 ? 1 : -1;
    sparks.push({
      id: `spark_${sparkIndex}`,
      startOffsetMs,
      x,
      y,
      vx: Math.cos(angle) * SPARK_BASE_SPEED * direction,
      vy: Math.sin(angle) * SPARK_BASE_SPEED,
      rewardLumens: SPARK_REWARD_LUMENS,
    });
    sparkCursorMs = startOffsetMs;
    sparkIndex += 1;
  }

  const worldMin = Math.min(ENEMY_OUTLINE_WIDTH, ENEMY_OUTLINE_HEIGHT);
  const baddieSpeed = (worldMin * SPARK_BASE_SPEED) / 90;

  let baddieCursorMs = 0;
  let waveIndex = 0;
  while (baddieCursorMs < durationMs) {
    const rand = mulberry32(hashStringToInt(`${battleId}:scenario:baddie-wave:${waveIndex}`));
    const delayMs = BADDIE_DELAY_MIN_MS
      + Math.floor(rand() * (BADDIE_DELAY_MAX_MS - BADDIE_DELAY_MIN_MS + 1));
    const startOffsetMs = baddieCursorMs + delayMs;
    if (startOffsetMs >= durationMs) break;

    const edge = Math.floor(rand() * 4);
    let spawnX = 0;
    let spawnY = 0;
    if (edge === 0) {
      spawnX = ENEMY_BOUNDS.minX + rand() * ENEMY_OUTLINE_WIDTH;
      spawnY = ENEMY_BOUNDS.maxY;
    } else if (edge === 1) {
      spawnX = ENEMY_BOUNDS.maxX;
      spawnY = ENEMY_BOUNDS.minY + rand() * ENEMY_OUTLINE_HEIGHT;
    } else if (edge === 2) {
      spawnX = ENEMY_BOUNDS.minX + rand() * ENEMY_OUTLINE_WIDTH;
      spawnY = ENEMY_BOUNDS.minY;
    } else {
      spawnX = ENEMY_BOUNDS.minX;
      spawnY = ENEMY_BOUNDS.minY + rand() * ENEMY_OUTLINE_HEIGHT;
    }

    baddieWaves.push({
      id: `wave_${waveIndex}`,
      startOffsetMs,
      spheres: [{
        id: `baddie_${waveIndex}_0`,
        x: spawnX,
        y: spawnY,
        size: BADDIE_SIZE_RANGE[0] + rand() * (BADDIE_SIZE_RANGE[1] - BADDIE_SIZE_RANGE[0]),
        color: BADDIE_COLORS[Math.floor(rand() * BADDIE_COLORS.length)],
        shape: BADDIE_SHAPES[Math.floor(rand() * BADDIE_SHAPES.length)],
        speed: baddieSpeed,
      }],
    });
    baddieCursorMs = startOffsetMs;
    waveIndex += 1;
  }

  return {
    version: BATTLE_SCENARIO_VERSION,
    durationSeconds,
    sparkRewardLumens: SPARK_REWARD_LUMENS,
    baddieDamagePerTick: 1,
    baddieDamageIntervalMs: BADDIE_DAMAGE_INTERVAL_MS,
    weakZones,
    voiceCommands,
    sparks,
    baddieWaves,
  };
}

function getBattleScenario(battleLike) {
  const storedScenario = battleLike?.scenario && typeof battleLike.scenario === 'object'
    ? battleLike.scenario
    : null;
  if (storedScenario) return storedScenario;
  return buildBattleScenario(battleLike);
}

function computeBattleForceTotals(battleLike, { endedAt = null, baddieDamage = 0 } = {}) {
  const battleStartMs = battleLike?.startsAt ? new Date(battleLike.startsAt).getTime() : NaN;
  const battleEndMs = endedAt ? new Date(endedAt).getTime() : (battleLike?.endsAt ? new Date(battleLike.endsAt).getTime() : NaN);
  if (!Number.isFinite(battleStartMs) || !Number.isFinite(battleEndMs) || battleEndMs <= battleStartMs) {
    return {
      guardianDamage: Math.max(0, Number(battleLike?.lightDamage) || 0),
      darknessBaseDamage: Math.max(0, Number(battleLike?.darknessDamage) || 0),
      darknessDamageFromBaddies: Math.max(0, Number(baddieDamage) || 0),
    };
  }

  const activeUsersCount = Math.max(0, Number(battleLike?.activeUsersCountSnapshot) || 0);
  const targetHalfActiveUsers = activeUsersCount * 0.5;
  const darknessTickDamage = targetHalfActiveUsers * DARKNESS_DAMAGE_PER_TARGET_USER;
  const guardianTickBeforeJoin = targetHalfActiveUsers * GUARDIAN_DAMAGE_BEFORE_FIRST_JOIN;
  const guardianTickAfterJoin = targetHalfActiveUsers * GUARDIAN_DAMAGE_AFTER_FIRST_JOIN;
  const firstJoinMs = battleLike?.firstPlayerJoinedAt ? new Date(battleLike.firstPlayerJoinedAt).getTime() : NaN;

  const totalTicks = Math.floor(Math.max(0, battleEndMs - battleStartMs) / (TICK_SECONDS * 1000));
  const darknessBaseDamage = totalTicks * darknessTickDamage;

  let guardianDamage = 0;
  if (Number.isFinite(firstJoinMs) && firstJoinMs > battleStartMs && firstJoinMs < battleEndMs) {
    const beforeTicks = Math.floor((firstJoinMs - battleStartMs) / (TICK_SECONDS * 1000));
    const afterTicks = Math.floor(Math.max(0, battleEndMs - firstJoinMs) / (TICK_SECONDS * 1000));
    guardianDamage = beforeTicks * guardianTickBeforeJoin + afterTicks * guardianTickAfterJoin;
  } else if (Number.isFinite(firstJoinMs) && firstJoinMs <= battleStartMs) {
    guardianDamage = totalTicks * guardianTickAfterJoin;
  } else {
    guardianDamage = totalTicks * guardianTickBeforeJoin;
  }

  return {
    guardianDamage: Math.max(0, Math.round(guardianDamage)),
    darknessBaseDamage: Math.max(0, Math.round(darknessBaseDamage)),
    darknessDamageFromBaddies: Math.max(0, Math.round(Number(baddieDamage) || 0)),
  };
}

const WEAPON_COMBAT_RULES = Object.freeze({
  1: { damage: 6, costLumens: 10, maxHitsPerShot: 10, minShotGapMs: 35, maxAimDeviation: 85 },
  2: { damage: 500, costLumens: 100, maxHitsPerShot: 2, minShotGapMs: 2600, maxAimDeviation: 45 },
  3: { damage: 5000, costLumens: 500, maxHitsPerShot: 1, minShotGapMs: 4500, maxAimDeviation: 28 },
});

function getWeaponCombatRules(weaponId) {
  return WEAPON_COMBAT_RULES[Number(weaponId)] || null;
}

function computeBattleMaxLimits(battle) {
  const durationSeconds = Number(battle?.durationSeconds) || BATTLE_BASE_DURATION_SECONDS;
  const rules1 = getWeaponCombatRules(1);
  const rules2 = getWeaponCombatRules(2);
  const rules3 = getWeaponCombatRules(3);
  const maxShots1 = rules1 ? Math.ceil((durationSeconds * 1000) / rules1.minShotGapMs) : 0;
  const maxShots2 = rules2 ? Math.ceil((durationSeconds * 1000) / rules2.minShotGapMs) : 0;
  const maxShots3 = rules3 ? Math.ceil((durationSeconds * 1000) / rules3.minShotGapMs) : 0;
  const clickDamage = {
    weapon1: 60,
    weapon2: 1000,
    weapon3: 5000,
  };
  const maxDamage = (
    maxShots1 * clickDamage.weapon1
    + maxShots2 * clickDamage.weapon2
    + maxShots3 * clickDamage.weapon3
  ) * 1.5;
  const maxLumensSpent =
    maxShots1 * (rules1?.costLumens || 0)
    + maxShots2 * (rules2?.costLumens || 0)
    + maxShots3 * (rules3?.costLumens || 0);
  const maxCrystals = Math.ceil(durationSeconds / 35);
  return {
    maxDamage: Math.floor(maxDamage),
    maxShots: { weapon1: maxShots1, weapon2: maxShots2, weapon3: maxShots3 },
    maxLumensSpent: Math.max(0, Math.floor(maxLumensSpent)),
    maxCrystals: Math.max(0, Math.floor(maxCrystals)),
    maxLumensGained: 72000,
  };
}

function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBattleStateSeed(battle, userId, scope, bucketIndex) {
  const battleId = battle?._id || 'battle';
  const safeUserId = userId ? userId.toString() : 'global';
  return `${battleId}:${safeUserId}:${scope}:${bucketIndex}`;
}

function getVoiceCommandSeedRand(battle, bucketIndex, userId = null) {
  const seedStr = buildBattleStateSeed(battle, userId, 'voice', bucketIndex);
  return mulberry32(hashStringToInt(seedStr));
}

function getVoiceCommandForBucket(battle, bucketIndex, userId = null) {
  if (!battle?.startsAt) return null;
  if (bucketIndex < 0) return null;

  const startedAt = new Date(battle.startsAt).getTime();
  let cursorMs = startedAt;
  for (let index = 0; index <= bucketIndex; index += 1) {
    const rand = getVoiceCommandSeedRand(battle, index, userId);
    const delayMs =
      VOICE_COMMAND_DELAY_MIN_MS + Math.floor(rand() * (VOICE_COMMAND_DELAY_MAX_MS - VOICE_COMMAND_DELAY_MIN_MS + 1));
    const durationMs =
      VOICE_COMMAND_DURATION_MIN_MS + Math.floor(rand() * (VOICE_COMMAND_DURATION_MAX_MS - VOICE_COMMAND_DURATION_MIN_MS + 1));
    const startAt = cursorMs + delayMs;
    const endsAt = startAt + durationMs;

    if (index === bucketIndex) {
      const roll = rand() > 0.5;
      const text = roll ? 'СТРЕЛЯЙ' : 'СТОЙ';
      const requireShot = text === 'СТОЙ';
      return {
        bucketIndex,
        id: `${bucketIndex}`,
        text,
        requireShot,
        startAt,
        endsAt,
        durationMs,
      };
    }

    cursorMs = endsAt;
  }

  return null;
}

function getVoiceCommandState(battle, at = new Date(), userId = null) {
  if (!battle?.startsAt) return { active: false, command: null, bucketIndex: null };

  const startedAt = new Date(battle.startsAt).getTime();
  const now = new Date(at).getTime();
  const maxCommands = Math.max(1, Math.ceil(Math.max(0, now - startedAt) / VOICE_COMMAND_DELAY_MIN_MS) + 2);

  for (let bucketIndex = 0; bucketIndex < maxCommands; bucketIndex += 1) {
    const cmd = getVoiceCommandForBucket(battle, bucketIndex, userId);
    if (!cmd) break;
    if (now < cmd.startAt) {
      return { active: false, command: null, bucketIndex: null };
    }
    if (now >= cmd.startAt && now < cmd.endsAt) {
      return { active: true, command: cmd, bucketIndex };
    }
  }

  return { active: false, command: null, bucketIndex: null };
}

function buildAttendanceSyncState(attendanceIndex) {
  const safeIndex = Math.max(0, Math.floor(Number(attendanceIndex) || 0));
  return {
    syncSlot: safeIndex % BATTLE_SYNC_SLOT_COUNT,
    syncSlotCount: BATTLE_SYNC_SLOT_COUNT,
    syncIntervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  };
}

async function persistAttendanceSyncState({ battleId, userId, syncState }) {
  if (!battleId || !userId || !syncState) return syncState || null;

  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return syncState;
  const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
  const idx = attendance.findIndex((entry) => String(entry?.user || '') === String(userId));
  if (idx < 0) return syncState;
  attendance[idx] = {
    ...(attendance[idx] || {}),
    syncSlot: syncState.syncSlot,
    syncSlotCount: syncState.syncSlotCount,
    syncIntervalSeconds: syncState.syncIntervalSeconds,
  };
  await updateModelDoc('Battle', battleId, { attendance });

  return syncState;
}

async function ensureAttendanceSyncState({ battleId, userId }) {
  if (!battleId || !userId) return null;

  const snapshot = await getModelDocById('Battle', battleId);
  const attendance = Array.isArray(snapshot?.attendance) ? snapshot.attendance : [];
  const targetUserId = String(userId);
  const attendanceIndex = attendance.findIndex((entry) => String(entry?.user || '') === targetUserId);
  if (attendanceIndex < 0) {
    return null;
  }

  const syncState = buildAttendanceSyncState(attendanceIndex);
  const current = attendance[attendanceIndex] || {};
  const needsUpdate = Number(current?.syncSlot) !== syncState.syncSlot
    || Number(current?.syncSlotCount) !== syncState.syncSlotCount
    || Number(current?.syncIntervalSeconds) !== syncState.syncIntervalSeconds;

  if (needsUpdate) {
    await persistAttendanceSyncState({ battleId, userId, syncState });
  }

  return syncState;
}

async function ensureAttendanceInitForUser({ battleId, userId, lumensAtStart, scAtStart = null, starsAtStart = null }) {
  if (!battleId || !userId) return;
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return;
  const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
  const idx = attendance.findIndex((entry) => String(entry?.user || '') === String(userId));
  if (idx < 0) return;
  const current = attendance[idx] || {};
  const nextEntry = { ...current };
  let changed = false;
  if (nextEntry.lumensAtBattleStart === null || nextEntry.lumensAtBattleStart === undefined) {
    nextEntry.lumensAtBattleStart = Math.max(0, Number(lumensAtStart) || 0);
    changed = true;
  }
  if ((nextEntry.scAtBattleStart === null || nextEntry.scAtBattleStart === undefined) && scAtStart != null) {
    nextEntry.scAtBattleStart = Math.max(0, Number(scAtStart) || 0);
    changed = true;
  }
  if ((nextEntry.starsAtBattleStart === null || nextEntry.starsAtBattleStart === undefined) && starsAtStart != null) {
    nextEntry.starsAtBattleStart = Math.max(0, Number(starsAtStart) || 0);
    changed = true;
  }
  if (!changed) return;
  attendance[idx] = {
    ...nextEntry,
  };
  await updateModelDoc('Battle', battleId, { attendance });
}

async function markVoiceShotDetected({ battleId, userId, bucketIndex }) {
  const idx = Number(bucketIndex);
  if (!Number.isFinite(idx) || idx < 0) return;
  const stored = idx + 1;
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return;
  const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
  const aidx = attendance.findIndex((entry) => String(entry?.user || '') === String(userId));
  if (aidx < 0) return;
  attendance[aidx] = {
    ...(attendance[aidx] || {}),
    voiceShotDetectedBucket: stored,
  };
  await updateModelDoc('Battle', battleId, { attendance });
}

function buildVoiceResolutionUpdate({ battle, attendanceEntry = null, at = new Date(), userId = null }) {
  const entry = attendanceEntry || null;
  const currentSlider = Number(entry?.personalSlider) || 0;
  const currentViolation = Boolean(entry?.sectorLastMinuteViolation);

  if (!battle?.startsAt) {
    return {
      voice: { active: false, command: null, bucketIndex: null },
      personalSlider: currentSlider,
      sectorLastMinuteViolation: currentViolation,
      update: null,
    };
  }

  const now = new Date(at);
  const state = getVoiceCommandState(battle, now, userId);
  const lastResolvedStored = Math.max(0, Number(entry?.voiceLastResolvedBucket) || 0);
  const shotDetectedStored = Math.max(0, Number(entry?.voiceShotDetectedBucket) || 0);

  let slider = currentSlider;
  let violation = currentViolation;
  let lastResolved = lastResolvedStored;
  let voiceCommandsSuccess = Number(entry?.voiceCommandsSuccess) || 0;
  let voiceCommandsSilenceSuccess = Number(entry?.voiceCommandsSilenceSuccess) || 0;
  let voiceCommandsAttackSuccess = Number(entry?.voiceCommandsAttackSuccess) || 0;
  let voiceCommandsConsecutive = Number(entry?.voiceCommandsConsecutive) || 0;
  let voiceCommandsTotalAttempts = Number(entry?.voiceCommandsTotalAttempts) || 0;
  let voiceCommandsHistory = Array.isArray(entry?.voiceCommandsHistory) ? [...entry.voiceCommandsHistory] : [];

  const nowMs = now.getTime();
  const endsAtMs = battle.endsAt ? new Date(battle.endsAt).getTime() : null;
  const inLastMinute = endsAtMs != null ? nowMs >= endsAtMs - 60000 : false;
  const nextPendingCommand = getVoiceCommandForBucket(battle, lastResolved, userId);
  const needsLastMinuteViolationCheck = inLastMinute && (slider < 1 || slider > 10) && !violation;

  if ((!nextPendingCommand || nowMs < nextPendingCommand.endsAt) && !needsLastMinuteViolationCheck) {
    return {
      voice: state,
      personalSlider: slider,
      sectorLastMinuteViolation: violation,
      update: null,
    };
  }

  let changed = false;
  if (needsLastMinuteViolationCheck) {
    violation = true;
    changed = true;
  }

  for (;;) {
    const nextBucket = lastResolved;
    const cmd = getVoiceCommandForBucket(battle, nextBucket, userId);
    if (!cmd) break;
    if (nowMs < cmd.endsAt) break;

    const bucketStored = nextBucket + 1;
    const shotDetected = shotDetectedStored === bucketStored;
    const success = cmd.requireShot ? shotDetected : !shotDetected;

    slider = clamp(slider + (success ? VOICE_SLIDER_STEP : -VOICE_SLIDER_STEP), VOICE_SLIDER_MIN, VOICE_SLIDER_MAX);
    lastResolved = nextBucket + 1;
    voiceCommandsTotalAttempts += 1;

    if (success) {
      voiceCommandsSuccess += 1;
      voiceCommandsConsecutive += 1;
      if (cmd.text === 'СТРЕЛЯЙ') {
        voiceCommandsSilenceSuccess += 1;
      } else if (cmd.text === 'СТОЙ') {
        voiceCommandsAttackSuccess += 1;
      }
    } else {
      voiceCommandsConsecutive = 0;
    }
    voiceCommandsHistory.push(success);

    if (endsAtMs != null && cmd.endsAt >= endsAtMs - 60000 && (slider < 1 || slider > 10)) {
      violation = true;
    }
    changed = true;
  }

  if (!changed) {
    return {
      voice: state,
      personalSlider: slider,
      sectorLastMinuteViolation: violation,
      update: null,
    };
  }

  return {
    voice: state,
    personalSlider: slider,
    sectorLastMinuteViolation: violation,
    update: {
      $set: {
        'attendance.$.personalSlider': slider,
        'attendance.$.sectorLastMinuteViolation': violation,
        'attendance.$.voiceLastResolvedBucket': lastResolved,
        'attendance.$.voiceCommandsSuccess': voiceCommandsSuccess,
        'attendance.$.voiceCommandsSilenceSuccess': voiceCommandsSilenceSuccess,
        'attendance.$.voiceCommandsAttackSuccess': voiceCommandsAttackSuccess,
        'attendance.$.voiceCommandsConsecutive': voiceCommandsConsecutive,
        'attendance.$.voiceCommandsTotalAttempts': voiceCommandsTotalAttempts,
        'attendance.$.voiceCommandsHistory': voiceCommandsHistory,
      },
    },
  };
}

async function applyVoiceResolutionsForUser({ battleId, userId, at = new Date() }) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle?.startsAt) return null;

  const attendance = Array.isArray(battle.attendance) ? battle.attendance : [];
  const entry = attendance.find((row) => String(row?.user || '') === String(userId)) || null;
  if (!entry) return null;
  const resolution = buildVoiceResolutionUpdate({
    battle,
    attendanceEntry: entry,
    at,
    userId,
  });

  if (resolution?.update) {
    const patch = resolution.update?.$set && typeof resolution.update.$set === 'object' ? resolution.update.$set : {};
    const nextAttendance = [...attendance];
    const idx = nextAttendance.findIndex((row) => String(row?.user || '') === String(userId));
    if (idx >= 0) {
      const current = nextAttendance[idx] || {};
      const mapped = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (!key.startsWith('attendance.$.')) continue;
        const field = key.slice('attendance.$.'.length);
        mapped[field] = value;
      }
      nextAttendance[idx] = mapped;
      await updateModelDoc('Battle', battleId, { attendance: nextAttendance });
    }
  }

  return {
    voice: resolution.voice,
    personalSlider: resolution.personalSlider,
    sectorLastMinuteViolation: resolution.sectorLastMinuteViolation,
  };
}

function buildBattleStartEmailHtml(nickname, battleUrl) {
  const safeName = nickname || 'друг';
  const safeUrl = String(battleUrl || '');
  return `
    <h2>Здравствуйте, ${safeName}!</h2>
    <p>Мрак напал на Древо. Войдите в бой и помогите защитить его.</p>
    <p><a href="${safeUrl}">Перейти к бою</a></p>
  `;
}

async function notifyBattleStart() {
  const appUrl = getFrontendBaseUrl();
  const battleUrl = `${appUrl}/battle`;
  await broadcastNotificationByPresence({
    online: {
      type: BATTLE_START_NOTIFICATION.type,
      title: BATTLE_START_NOTIFICATION.title,
      message: BATTLE_START_NOTIFICATION.message,
      link: BATTLE_START_NOTIFICATION.link,
    },
    offline: {
      type: 'event',
      eventKey: BATTLE_START_NOTIFICATION.eventKey,
      title: BATTLE_START_NOTIFICATION.title,
      message: BATTLE_START_NOTIFICATION.message,
      link: BATTLE_START_NOTIFICATION.link,
    },
  });

  await forEachUserBatch({
    pageSize: BATTLE_START_NOTIFY_BATCH,
    filter: (user) => Boolean(user?.email),
    map: (user) => ({ email: user.email, nickname: user.nickname, language: user.language }),
    handler: async (batch) => {
      await Promise.all(
        batch.map((user) =>
        emailService.sendDarknessAttackEmail(
          user.email,
          user.nickname,
          battleUrl,
          user.language
        ))
      );
    },
  });
}

function getWeakZoneState(battle, at = new Date(), userId = null) {
  const startedAt = battle?.startsAt ? new Date(battle.startsAt).getTime() : Date.now();
  const now = new Date(at).getTime();

  const maxZones = Math.max(1, Math.ceil(Math.max(0, now - startedAt) / WEAK_ZONE_DELAY_MIN_MS) + 2);
  for (let zoneIndex = 0; zoneIndex < maxZones; zoneIndex += 1) {
    const zone = getWeakZoneForIndex(battle, zoneIndex, userId);
    if (!zone) break;
    if (now < zone.startAt.getTime()) {
      break;
    }
    if (now >= zone.startAt.getTime() && now < zone.endsAt.getTime()) {
      return {
        active: true,
        center: zone.center,
        radius: zone.radius,
        startsAt: zone.startAt,
        endsAt: zone.endsAt,
      };
    }
  }

  return {
    active: false,
    center: null,
    radius: WEAK_ZONE_RADIUS,
    startsAt: null,
    endsAt: null,
  };
}

function getWeakZoneForIndex(battle, zoneIndex, userId = null) {
  if (!battle?.startsAt) return null;
  if (zoneIndex < 0) return null;

  const startedAt = new Date(battle.startsAt).getTime();
  let cursorMs = startedAt;
  for (let index = 0; index <= zoneIndex; index += 1) {
    const seedStr = buildBattleStateSeed(battle, userId, 'weak-zone', index);
    const rand = mulberry32(hashStringToInt(seedStr));
    const delayMs =
      WEAK_ZONE_DELAY_MIN_MS + Math.floor(rand() * (WEAK_ZONE_DELAY_MAX_MS - WEAK_ZONE_DELAY_MIN_MS + 1));
    const durationMs =
      WEAK_ZONE_DURATION_MIN_MS + Math.floor(rand() * (WEAK_ZONE_DURATION_MAX_MS - WEAK_ZONE_DURATION_MIN_MS + 1));
    const startAtMs = cursorMs + delayMs;
    const endAtMs = startAtMs + durationMs;

    if (index === zoneIndex) {
      const cellCount = WEAK_ZONE_CELLS.length;
      const cell = cellCount
        ? WEAK_ZONE_CELLS[Math.min(cellCount - 1, Math.floor(rand() * cellCount))]
        : ENEMY_BOUNDS;
      const x = cell.minX + rand() * (cell.maxX - cell.minX);
      const y = cell.minY + rand() * (cell.maxY - cell.minY);
      return {
        radius: WEAK_ZONE_RADIUS,
        startAt: new Date(startAtMs),
        endsAt: new Date(endAtMs),
        center: {
          x: clamp(x, ENEMY_BOUNDS.minX, ENEMY_BOUNDS.maxX),
          y: clamp(y, ENEMY_BOUNDS.minY, ENEMY_BOUNDS.maxY),
          z: ENEMY_PLANE_Z,
        },
      };
    }

    cursorMs = endAtMs;
  }

  return null;
}

function computeLightDebuffMultiplier() {
  return 1;
}

async function scheduleBattle({
  startsAt,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  durationLocked = false,
  scheduleSource = 'auto',
  scheduledIntervalHours = null,
} = {}) {
  const starts = startsAt ? new Date(startsAt) : new Date();
  const ends = new Date(starts.getTime() + durationSeconds * 1000);
  const created = await insertModelDoc('Battle', {
    status: 'scheduled',
    startsAt: starts,
    endsAt: ends,
    durationSeconds,
    durationLocked: Boolean(durationLocked),
    scheduleSource,
    scheduledIntervalHours: scheduledIntervalHours == null ? null : Number(scheduledIntervalHours),
    darknessDamage: 0,
    lightDamage: 0,
    sectorDarknessDamagePerUser: 0,
    activeUsersCountSnapshot: 0,
    attendanceCount: 0,
    maxAttendanceCount: 0,
    uniqueAttendanceCount: 0,
    attendance: [],
    globalDebuffActive: false,
    globalDebuffPercent: 0,
    injuries: [],
    injury: null,
    summaryTopPlayer: null,
    firstPlayerJoinedAt: null,
    isShrunken: false,
    cancellationReason: '',
  });
  if (!created) throw new Error('Failed to schedule battle');
  await battleRuntimeStore.setBattlePointer(UPCOMING_BATTLE_POINTER_KIND, created._id).catch(() => {});
  return created;
}

async function updateScheduledBattle(
  battleId,
  {
    startsAt,
    durationSeconds,
    durationLocked,
    scheduleSource,
    scheduledIntervalHours,
  } = {}
) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  if (String(battle.status || '') !== 'scheduled') {
    throw new Error('Only scheduled battle can be updated');
  }

  const nextStartsAt = startsAt ? new Date(startsAt) : new Date(battle.startsAt || Date.now());
  if (Number.isNaN(nextStartsAt.getTime())) {
    throw new Error('Battle start time is invalid');
  }

  const nextDurationSeconds = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
    ? Number(durationSeconds)
    : Number(battle.durationSeconds) || DEFAULT_DURATION_SECONDS;

  const patch = {
    startsAt: nextStartsAt,
    durationSeconds: nextDurationSeconds,
    endsAt: new Date(nextStartsAt.getTime() + nextDurationSeconds * 1000),
  };

  if (scheduleSource !== undefined) {
    patch.scheduleSource = scheduleSource;
  }
  if (durationLocked !== undefined) {
    patch.durationLocked = Boolean(durationLocked);
  }
  if (scheduledIntervalHours !== undefined) {
    patch.scheduledIntervalHours = scheduledIntervalHours == null ? null : Number(scheduledIntervalHours);
  }

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (!saved) throw new Error('Battle not found');
  await battleRuntimeStore.setBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  return saved;
}

async function startBattle(battleId, {
  startsAt,
  durationSeconds,
  durationLocked,
  scheduleSource,
  scheduledIntervalHours,
} = {}) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const starts = startsAt ? new Date(startsAt) : new Date();
  const durationSec = durationSeconds ?? battle.durationSeconds ?? DEFAULT_DURATION_SECONDS;
  const scenario = buildBattleScenario({
    _id: battleId,
    startsAt: starts,
    durationSeconds: durationSec,
  });
  const patch = {
    status: 'active',
    startsAt: starts,
    durationSeconds: durationSec,
    endsAt: new Date(starts.getTime() + durationSec * 1000),
    durationLocked: durationLocked === undefined ? Boolean(battle.durationLocked) : Boolean(durationLocked),
    firstPlayerJoinedAt: null,
    globalDebuffActive: true,
    globalDebuffPercent: GLOBAL_DEBUFF_NO_ENTRY_PERCENT,
    scenario,
  };
  if (scheduleSource) {
    patch.scheduleSource = scheduleSource;
  }
  if (scheduledIntervalHours !== undefined) {
    patch.scheduledIntervalHours = scheduledIntervalHours == null ? null : Number(scheduledIntervalHours);
  }

  try {
    const activeUsersCount = await getActiveUsersCountSnapshot(starts);
    patch.activeUsersCountSnapshot = Math.max(0, Number(activeUsersCount) || 0);
  } catch (e) {
    patch.activeUsersCountSnapshot = battle.activeUsersCountSnapshot || 0;
  }

  // Keep current Tree injuries in the battle snapshot for summary only.
  try {
    const tree = await getLatestModelDoc('Tree');
    const injuries = Array.isArray(tree?.injuries) ? tree.injuries : [];
    patch.injuries = injuries
      .filter((inj) => (inj?.healedPercent || 0) < 100)
      .map((inj) => ({
        branchName: inj.branchName,
        requiredRadiance: inj.requiredRadiance,
        healedRadiance: inj.healedRadiance,
        debuffPercent: TREE_INJURY_REWARD_DEBUFF_PERCENT,
      }));
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('startBattle: failed to load tree injuries', e);
  }

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (!saved) throw new Error('Battle not found');
  await battleRuntimeStore.setBattlePointer(CURRENT_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearDarknessState('cycle_anchor').catch(() => {});
  scheduleBattleFinalize(saved);
  notifyBattleStart().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('startBattle: notifyBattleStart error', e);
  });
  return saved;
}

function computeBattleDurationSecondsForAttendance(attendanceCount) {
  const attendance = Math.max(0, Number(attendanceCount) || 0);
  const reduced = BATTLE_BASE_DURATION_SECONDS - attendance * BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS;
  return Math.max(BATTLE_MIN_DURATION_SECONDS, Math.round(reduced));
}

function computeBattleDurationSecondsForAttendanceWithBase(attendanceCount, baseDurationSeconds) {
  const base = Math.max(0, Number(baseDurationSeconds) || 0);
  if (!base) return computeBattleDurationSecondsForAttendance(attendanceCount);
  const attendance = Math.max(0, Number(attendanceCount) || 0);
  const reduced = base - attendance * BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS;
  const minDuration = base < BATTLE_MIN_DURATION_SECONDS ? base : BATTLE_MIN_DURATION_SECONDS;
  return Math.max(minDuration, Math.round(reduced));
}

function buildAttendanceTimingUpdate(battle) {
  if (!battle || battle.status !== 'active') return null;
  if (battle.durationLocked) return null;

  const anchor = battle.firstPlayerJoinedAt ? new Date(battle.firstPlayerJoinedAt) : null;
  if (!anchor) return null;

  const baseDurationSeconds = battle.durationSeconds || BATTLE_BASE_DURATION_SECONDS;
  const nextDurationSeconds = computeBattleDurationSecondsForAttendanceWithBase(
    battle.attendanceCount || 0,
    baseDurationSeconds
  );
  const nextEndsAt = new Date(anchor.getTime() + nextDurationSeconds * 1000);
  const currentEndsAtMs = battle.endsAt ? new Date(battle.endsAt).getTime() : NaN;
  const shouldShrink = Number.isFinite(currentEndsAtMs) && nextEndsAt.getTime() < currentEndsAtMs;
  const finalEndsAt = Number.isFinite(currentEndsAtMs)
    ? new Date(Math.min(currentEndsAtMs, nextEndsAt.getTime()))
    : nextEndsAt;

  return {
    durationSeconds: nextDurationSeconds,
    endsAt: finalEndsAt,
    isShrunken: Boolean(battle.isShrunken || shouldShrink),
  };
}

async function markFirstPlayerJoinIfNeeded(battleId, at = new Date()) {
  const now = new Date(at);

  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return null;
  if (String(battle.status) !== 'active') return null;
  if (battle.firstPlayerJoinedAt) return null;

  const patch = {
    firstPlayerJoinedAt: now,
    globalDebuffActive: false,
    globalDebuffPercent: 0,
  };

  if (!battle.durationLocked) {
    const baseDurationSeconds = BATTLE_BASE_DURATION_SECONDS;
    patch.durationSeconds = baseDurationSeconds;
    patch.endsAt = new Date(now.getTime() + baseDurationSeconds * 1000);
  }

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (saved) {
    scheduleBattleFinalize(saved);
  }

  return saved;
}

async function recomputeEndsAtForAttendance(battleId, { battle: battleSnapshot = null } = {}) {
  const battle = battleSnapshot || await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'active') return null;

  const nextTiming = buildAttendanceTimingUpdate(battle);
  if (!nextTiming) {
    return null;
  }

  const currentEndsAtMs = battle.endsAt ? new Date(battle.endsAt).getTime() : NaN;
  const nextEndsAtMs = nextTiming.endsAt ? new Date(nextTiming.endsAt).getTime() : NaN;
  const unchanged = Number(battle.durationSeconds || 0) === Number(nextTiming.durationSeconds || 0)
    && Boolean(battle.isShrunken) === Boolean(nextTiming.isShrunken)
    && currentEndsAtMs === nextEndsAtMs;

  if (unchanged) {
    return null;
  }

  const saved = await updateModelDoc('Battle', battleId, nextTiming);
  if (saved) {
    scheduleBattleFinalize(saved);
  }
  return saved;
}

function computeMissingAttendancePercent({ attendanceCount, activeUsersCount }) {
  const active = Math.max(0, Number(activeUsersCount) || 0);
  if (active <= 0) return 0;
  const attendancePct = (Math.max(0, Number(attendanceCount) || 0) / active) * 100;
  // Target = 50% of active users
  return Math.max(0, (50 - attendancePct) * 2);
}

async function pickPriorityInjuryBranchName(battle, now = new Date()) {
  try {
    const threshold = getActiveUsersThresholdDate(now);
    const thresholdMs = new Date(threshold).getTime();
    const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
    const participantIds = attendance
      .map((row) => (row?.user ? row.user : row))
      .filter(Boolean);

    const excluded = new Set(participantIds.map((v) => toId(v)).filter(Boolean));
    const isAdminEmail = (email) => /@admin(\.|$)/i.test(String(email || ''));
    const isRecentEnough = (value) => {
      if (!value) return false;
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return false;
      return d.getTime() >= thresholdMs;
    };

    const counts = new Map();
    const pageSize = 500;
    let offset = 0;
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await listUsersPage({ from: offset, limit: pageSize });
      if (!rows.length) break;
      for (const row of rows) {
        const id = String(row?.id || '').trim();
        if (!id) continue;
        if (excluded.has(id)) continue;
        const data = getUserData(row);

        const status = String(data.status || row.status || '');
        if (status !== 'active') continue;
        const emailConfirmed = Boolean(data.emailConfirmed ?? row.email_confirmed);
        if (!emailConfirmed) continue;
        const role = String(data.role || row.role || '');
        if (role !== 'user') continue;
        if (isAdminEmail(row.email || data.email)) continue;

        const treeBranch = data.treeBranch ? String(data.treeBranch) : null;
        if (!treeBranch) continue;

        const qwPassed = Boolean(data.quietWatchPassed);
        const qwCheckedAt = data.quietWatchCheckedAt ? new Date(data.quietWatchCheckedAt) : null;
        const qwOk = qwPassed || !qwCheckedAt || Number.isNaN(qwCheckedAt.getTime());
        if (!qwOk) continue;

        const recent = isRecentEnough(data.lastOnlineAt || row.last_online_at) || isRecentEnough(data.lastSeenAt || row.last_seen_at);
        if (!recent) continue;

        counts.set(treeBranch, (counts.get(treeBranch) || 0) + 1);
      }
      if (rows.length < pageSize) break;
      offset += rows.length;
    }

    const entries = Array.from(counts.entries());

    if (!entries.length) return null;
    const maxCount = Math.max(...entries.map(([, c]) => c));
    const top = entries.filter(([, c]) => c === maxCount).map(([b]) => b);
    if (!top.length) return null;
    return top[Math.floor(Math.random() * top.length)];
  } catch (e) {
    return null;
  }
}

function normalizeBattleUserId(value) {
  return value == null ? '' : String(value);
}

async function findBattleByStatusFallback(status, sortMode = 'desc') {
  const all = await listModelDocs('Battle');
  const filtered = all.filter((row) => String(row?.status || '') === String(status));
  filtered.sort((a, b) => {
    const aTime = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bTime = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
    return sortMode === 'asc' ? aTime - bTime : bTime - aTime;
  });
  return filtered[0] || null;
}

async function listScheduledBattles({ includeAuto = false } = {}) {
  const all = await listModelDocs('Battle');
  return all
    .filter((row) => {
      if (String(row?.status || '') !== 'scheduled') return false;
      if (!includeAuto && String(row?.scheduleSource || '') === 'auto') return false;
      return true;
    })
    .sort((a, b) => {
      const aTime = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
      const bTime = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
      return aTime - bTime;
    });
}

async function resolveBattleByPointer({ kind, expectedStatus, fallbackSortMode }) {
  const pointer = await battleRuntimeStore.getBattlePointer(kind).catch(() => null);
  const pointedBattleId = String(pointer?.battleId || '').trim();

  if (pointedBattleId) {
    const pointedBattle = await getModelDocById('Battle', pointedBattleId);
    if (pointedBattle && String(pointedBattle.status || '') === String(expectedStatus)) {
      return pointedBattle;
    }
    await battleRuntimeStore.clearBattlePointer(kind, pointedBattleId).catch(() => {});
  }

  // Запасной путь нужен только чтобы подхватить уже существующий бой после обновления.
  const fallbackBattle = await findBattleByStatusFallback(expectedStatus, fallbackSortMode);
  if (fallbackBattle?._id) {
    await battleRuntimeStore.setBattlePointer(kind, fallbackBattle._id).catch(() => {});
  }
  return fallbackBattle || null;
}

async function buildFinishedBattleSummary(battle) {
  const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
  if (!attendance.length) {
    battle.summaryTopPlayer = null;
    return { usersById: new Map() };
  }

  const attendanceIds = attendance
    .map((row) => normalizeBattleUserId(row?.user))
    .filter(Boolean);

  const userRows = attendanceIds.length
    ? await getUsersByIds(attendanceIds)
    : [];

  const usersById = new Map(
    (Array.isArray(userRows) ? userRows : []).map((row) => {
      const data = getUserData(row);
      return [normalizeBattleUserId(row?.id), {
        _id: row?.id,
        email: row?.email || data.email,
        nickname: row?.nickname || data.nickname,
        treeBranch: data.treeBranch || null,
      }];
    })
  );

  const indexed = attendance.map((row, index) => {
    const userId = normalizeBattleUserId(row?.user);
    const userDoc = usersById.get(userId) || null;
    return {
      row,
      index,
      userId,
      damage: Math.max(0, Number(row?.damage) || 0),
      nickname: String(userDoc?.nickname || 'Игрок'),
      treeBranch: userDoc?.treeBranch ? String(userDoc.treeBranch) : null,
    };
  });

  const sorted = [...indexed].sort((left, right) => {
    const diff = right.damage - left.damage;
    if (diff !== 0) return diff;
    return left.index - right.index;
  });

  const rankByUserId = new Map();
  sorted.forEach((item, idx) => {
    if (item.userId && !rankByUserId.has(item.userId)) {
      rankByUserId.set(item.userId, idx + 1);
    }
  });

  const branchStats = new Map();
  for (const item of indexed) {
    if (!item.treeBranch) continue;
    const prev = branchStats.get(item.treeBranch) || { count: 0, damage: 0 };
    prev.count += 1;
    prev.damage += item.damage;
    branchStats.set(item.treeBranch, prev);
  }

  for (const item of indexed) {
    item.row.finalRank = item.userId ? rankByUserId.get(item.userId) || null : null;
    if (item.treeBranch) {
      const branch = branchStats.get(item.treeBranch) || { count: 0, damage: 0 };
      const othersCount = Math.max(0, branch.count - 1);
      item.row.finalBranchAvgDamageOther = othersCount > 0
        ? (branch.damage - item.damage) / othersCount
        : null;
    } else {
      item.row.finalBranchAvgDamageOther = null;
    }
  }

  const top = sorted[0] || null;
  battle.summaryTopPlayer = top
    ? {
      userId: top.userId,
      nickname: top.nickname,
      damage: top.damage,
    }
    : null;

  return { usersById };
}

async function finishBattle(
  battleId,
  {
    darknessDamage = 0,
    lightDamage = 0,
    absoluteDarknessDamage = null,
    absoluteLightDamage = null,
    attendance = null,
    attendanceCount,
    endedAt = null,
    deferSideEffects = false,
  } = {}
) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const finalAttendance = Array.isArray(attendance) ? attendance : (Array.isArray(battle.attendance) ? battle.attendance : []);
  const nextLightDamage = absoluteLightDamage == null
    ? (Number(battle.lightDamage) || 0) + (Number(lightDamage) || 0)
    : Math.max(0, Number(absoluteLightDamage) || 0);
  const nextDarknessDamage = absoluteDarknessDamage == null
    ? (Number(battle.darknessDamage) || 0) + (Number(darknessDamage) || 0)
    : Math.max(0, Number(absoluteDarknessDamage) || 0);
  const finalAttendanceCount = typeof attendanceCount === 'number'
    ? attendanceCount
    : finalAttendance.length;
  const patch = {
    status: 'finished',
    endsAt: endedAt ? new Date(endedAt) : new Date(),
    darknessDamage: nextDarknessDamage,
    lightDamage: nextLightDamage,
    attendance: finalAttendance,
  };
  if (typeof finalAttendanceCount === 'number') {
    patch.attendanceCount = finalAttendanceCount;
  }

  let battleInjury = null;

  const isDraw = nextLightDamage === nextDarknessDamage;
  const darknessWins = nextDarknessDamage > nextLightDamage;

  // If Darkness wins, there is a chance to inflict a Tree injury (per TZ formula)
  if (!isDraw && darknessWins) {
    try {
      const activeUsersCount = battle.activeUsersCountSnapshot && battle.activeUsersCountSnapshot > 0
        ? Number(battle.activeUsersCountSnapshot)
        : await getActiveUsersCountSnapshot((patch.endsAt || battle.endsAt) || new Date());

      const missingPercent = computeMissingAttendancePercent({
        attendanceCount: finalAttendanceCount || 0,
        activeUsersCount,
      });

      if (missingPercent > 0) {
        const riskPercent = Math.min(100, missingPercent);
        const roll = Math.random() * 100;
        if (roll < riskPercent) {
          const damageDelta = Math.max(0, nextDarknessDamage - nextLightDamage);
          if (damageDelta > 0) {
            const injurySize = damageDelta * (missingPercent / 100);
            const worldLivingUsersCount = await getWorldLivingUsersCount();
            const effectiveUsers = Math.max(
              1,
              Number(worldLivingUsersCount) || Number(activeUsersCount) || 1,
            );
            const requiredRadiance = Math.round(injurySize * effectiveUsers);
            const debuffPercent = TREE_INJURY_REWARD_DEBUFF_PERCENT;

            const pickedBranchName = await pickPriorityInjuryBranchName(
              { ...battle, attendance: finalAttendance, endsAt: patch.endsAt },
              patch.endsAt || battle.endsAt || new Date(),
            );
            if (pickedBranchName) {
              const injury = {
                branchName: pickedBranchName,
                severityPercent: missingPercent,
                debuffPercent,
                requiredRadiance,
                healedRadiance: 0,
                healedPercent: 0,
                causedAt: new Date(),
              };

              battleInjury = {
                branchName: injury.branchName,
                requiredRadiance: injury.requiredRadiance,
                debuffPercent: injury.debuffPercent,
                causedAt: injury.causedAt,
              };

              const tree = await getLatestModelDoc('Tree');
              if (tree) {
                const injuries = Array.isArray(tree.injuries) ? [...tree.injuries] : [];
                injuries.push(injury);
                await updateModelDoc('Tree', tree._id, { injuries });

                // Keep snapshot in battle for debuff analytics
                patch.injuries = injuries
                  .filter((inj) => (inj?.healedPercent || 0) < 100)
                  .map((inj) => ({
                    branchName: inj.branchName,
                    requiredRadiance: inj.requiredRadiance,
                    healedRadiance: inj.healedRadiance,
                    debuffPercent: TREE_INJURY_REWARD_DEBUFF_PERCENT,
                  }));
              }
            }
          }
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('finishBattle: injury calculation failed', e);
    }
  }

  patch.injury = battleInjury;

  let attendanceUsersById = new Map();
  try {
    const summary = await buildFinishedBattleSummary({ ...battle, ...patch });
    attendanceUsersById = summary?.usersById || new Map();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('finishBattle: summary build failed', e);
    patch.summaryTopPlayer = null;
  }

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (!saved) throw new Error('Battle not found');
  clearBattleFinalizeSchedule(saved._id);
  await battleRuntimeStore.clearBattlePointer(CURRENT_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});

  try {
    await prepareBattleSummaries(saved._id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('finishBattle: prepare summaries failed', e);
  }

  const runSideEffects = async (delayPerBatchMs = 0) => {
    // Итоговая награда за бой считается один раз в конце только по урону.
    try {
      const batchSize = 25;
      for (let offset = 0; offset < finalAttendance.length; offset += batchSize) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(finalAttendance.slice(offset, offset + batchSize).map(async (row) => {
          const userId = row?.user;
          if (!userId) return;
          const amount = computeBattleRewardSc({
            damage: Number(row?.damage) || 0,
          });
          const scUpdatedRow = await awardBattleSc({
            userId,
            amount,
            relatedEntity: battle._id,
            description: null,
            skipDebuff: true,
          }).catch((error) => {
            // eslint-disable-next-line no-console
            console.error('finishBattle: awardBattleSc failed', { battleId, userId, error });
            return null;
          });

          const userData = getUserData(scUpdatedRow);
          const startLumens = row?.lumensAtBattleStart == null
            ? Math.max(0, Number(userData?.lumens) || 0)
            : Math.max(0, Math.floor(Number(row.lumensAtBattleStart) || 0));
          const nextLumens = Math.max(
            0,
            startLumens
              + Math.max(0, Math.floor(Number(row?.lumensGainedTotal) || 0))
              - Math.max(0, Math.floor(Number(row?.lumensSpentTotal) || 0)),
          );

          if (Math.max(0, Math.floor(Number(userData?.lumens) || 0)) !== nextLumens) {
            await updateUserDataById(
              userId,
              { lumens: nextLumens },
              { userRow: scUpdatedRow || null },
            ).catch((error) => {
              // eslint-disable-next-line no-console
              console.error('finishBattle: update battle lumens failed', { battleId, userId, error });
            });
          }
        }));
        if (delayPerBatchMs > 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(delayPerBatchMs);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('finishBattle: final K award failed', e);
    }

    // Уведомление участникам (простая рассылка по явке, без фильтра email)
    if ((saved.attendance || []).length) {
      try {
        const result = saved.lightDamage === saved.darknessDamage
          ? 'draw'
          : saved.lightDamage > saved.darknessDamage
            ? 'light'
            : 'dark';
        const users = Array.from(attendanceUsersById.values()).filter((user) => user?.email);
        const batchSize = 25;
        for (let offset = 0; offset < users.length; offset += batchSize) {
          // eslint-disable-next-line no-await-in-loop
          await Promise.all(users.slice(offset, offset + batchSize).map((u) =>
            sendBattleResultEmail(u.email, u.nickname, {
              result,
              damageLight: saved.lightDamage,
              damageDark: saved.darknessDamage,
              startedAt: saved.startsAt,
              endedAt: saved.endsAt,
            }, (u?.language || u?.data?.language || 'ru') === 'en' ? 'en' : 'ru').catch(() => { })
          ));
          if (delayPerBatchMs > 0) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(delayPerBatchMs);
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('sendBattleResultEmail error', e);
      }
    }
  };

  if (deferSideEffects) {
    const startDelayMs = Math.floor(randBetween(BATTLE_FINAL_DEFER_MIN_MS, BATTLE_FINAL_DEFER_MAX_MS));
    const spreadMs = Math.floor(randBetween(BATTLE_FINAL_DEFER_MIN_MS, BATTLE_FINAL_DEFER_MAX_MS));
    setTimeout(async () => {
      const batchSize = 25;
      const batches = Math.max(1, Math.ceil(finalAttendance.length / batchSize));
      const perBatchDelay = Math.max(0, Math.floor(spreadMs / batches));
      await runSideEffects(perBatchDelay).catch(() => {});
    }, startDelayMs);
  } else {
    await runSideEffects(0);
  }
  return saved;
}

async function cancelBattle(battleId, reason = 'Cancelled by scheduler') {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const saved = await updateModelDoc('Battle', battleId, {
    status: 'cancelled',
    cancellationReason: reason,
    endsAt: new Date(),
  });
  if (!saved) throw new Error('Battle not found');
  clearBattleFinalizeSchedule(saved._id);
  await battleRuntimeStore.clearBattlePointer(CURRENT_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  return saved;
}

async function recordDamage(battleId, { lightDamageDelta = 0, darknessDamageDelta = 0 } = {}) {
  const safeLightDamageDelta = Number(lightDamageDelta) || 0;
  const safeDarknessDamageDelta = Number(darknessDamageDelta) || 0;
  if (!safeLightDamageDelta && !safeDarknessDamageDelta) {
    return;
  }

  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const saved = await updateModelDoc('Battle', battleId, {
    lightDamage: (Number(battle.lightDamage) || 0) + safeLightDamageDelta,
    darknessDamage: (Number(battle.darknessDamage) || 0) + safeDarknessDamageDelta,
  });
  if (!saved) throw new Error('Battle not found');
}

async function registerAttendance(
  battleId,
  userId,
  {
    joinedAt = new Date(),
    battle = null,
  } = {}
) {
  if (!userId) return { joined: false, appliedTimerUpdate: false, sync: null, battleSnapshot: null };
  const snapshot = battle || await getModelDocById('Battle', battleId);
  if (!snapshot) {
    return { joined: false, appliedTimerUpdate: false, sync: null, battleSnapshot: null };
  }
  const currentAttendanceCount = Math.max(0, Number(snapshot.attendanceCount) || 0);
  const currentMaxAttendanceCount = Math.max(0, Number(snapshot.maxAttendanceCount) || currentAttendanceCount);
  const currentUniqueAttendanceCount = Math.max(0, Number(snapshot.uniqueAttendanceCount) || currentAttendanceCount);
  const sync = buildAttendanceSyncState(currentAttendanceCount);
  const safeJoinedAt = new Date(joinedAt);
  const attendanceEntry = {
    user: String(userId),
    joinedAt: safeJoinedAt,
    damage: 0,
    syncSlot: sync.syncSlot,
    syncSlotCount: sync.syncSlotCount,
    syncIntervalSeconds: sync.syncIntervalSeconds,
  };
  const claimedAttendance = await battleRuntimeStore.createAttendanceStateIfAbsent({
    battleId,
    userId,
    state: attendanceEntry,
  });
  if (!claimedAttendance?.created) {
    return { joined: false, appliedTimerUpdate: false, sync, battleSnapshot: snapshot };
  }

  const timingUpdate = buildAttendanceTimingUpdate(snapshot);
  const nextPatch = {
    attendanceCount: currentAttendanceCount + 1,
    maxAttendanceCount: Math.max(currentMaxAttendanceCount, currentAttendanceCount + 1),
    uniqueAttendanceCount: currentUniqueAttendanceCount + 1,
  };
  if (timingUpdate) {
    Object.assign(nextPatch, timingUpdate);
  }

  const joinedBattle = await updateModelDoc('Battle', battleId, nextPatch);
  if (!joinedBattle) {
    await battleRuntimeStore.deleteAttendanceState({ battleId, userId }).catch(() => {});
    return { joined: false, appliedTimerUpdate: false, sync: null };
  }

  return {
    joined: true,
    appliedTimerUpdate: Boolean(timingUpdate),
    sync,
    battleSnapshot: joinedBattle ? {
      _id: joinedBattle._id,
      status: joinedBattle.status,
      startsAt: joinedBattle.startsAt || null,
      firstPlayerJoinedAt: joinedBattle.firstPlayerJoinedAt || null,
      durationSeconds: Number(joinedBattle.durationSeconds) || BATTLE_BASE_DURATION_SECONDS,
      attendanceCount: Math.max(0, Number(joinedBattle.attendanceCount) || 0),
      maxAttendanceCount: Math.max(0, Number(joinedBattle.maxAttendanceCount) || 0),
      uniqueAttendanceCount: Math.max(0, Number(joinedBattle.uniqueAttendanceCount) || 0),
      endsAt: joinedBattle.endsAt || null,
      isShrunken: Boolean(joinedBattle.isShrunken),
      activeUsersCountSnapshot: Math.max(0, Number(joinedBattle.activeUsersCountSnapshot) || 0),
      scenario: joinedBattle?.scenario && typeof joinedBattle.scenario === 'object' ? joinedBattle.scenario : null,
      injuries: Array.isArray(joinedBattle.injuries) ? joinedBattle.injuries : [],
      injury: joinedBattle.injury || null,
    } : null,
  };
}

async function incrementAttendance(battleId, delta = 1) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const saved = await updateModelDoc('Battle', battleId, {
    attendanceCount: (Number(battle.attendanceCount) || 0) + (Number(delta) || 0),
  });
  if (!saved) throw new Error('Battle not found');
  return saved;
}

async function processActiveBattleTick(battle) {
  const battleId = battle?._id;
  if (!battleId) return;
  let activeUsersCount = Math.max(0, Number(battle.activeUsersCountSnapshot) || 0);

  if (activeUsersCount <= 0) {
    try {
      activeUsersCount = Math.max(0, Number(await getActiveUsersCountSnapshot()) || 0);
      if (activeUsersCount > 0) {
        await updateModelDoc('Battle', battleId, {
          activeUsersCountSnapshot: activeUsersCount,
        });
      }
    } catch (e) {
      // ignore snapshot failures to keep battle tick light
    }
  }

  if (activeUsersCount <= 0) return;
}

function getBattlePolicy() {
  return {
    ...BATTLE_POLICY,
  };
}

function getBattleSyncConfig() {
  return {
    slotCount: BATTLE_SYNC_SLOT_COUNT,
    intervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  };
}

function getBattleFinalWindowConfig() {
  return {
    windowSeconds: BATTLE_FINAL_WINDOW_SECONDS,
    reportAcceptSeconds: BATTLE_FINAL_REPORT_ACCEPT_SECONDS,
    reportRetryIntervalMs: BATTLE_FINAL_REPORT_RETRY_INTERVAL_MS,
    reportWindowCapacity: BATTLE_FINAL_REPORT_WINDOW_CAPACITY,
    slotCount: BATTLE_SYNC_SLOT_COUNT,
    slotWindowMs: Math.floor((BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000) / BATTLE_SYNC_SLOT_COUNT),
    minDamagePct: BATTLE_FINAL_MIN_DAMAGE_PCT,
  };
}

function normalizeUniqueIds(list, { limit = 5000 } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeWeakZoneHitsMap(value, { limit = 2000 } = {}) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  let used = 0;
  for (const [rawId, rawCount] of Object.entries(value)) {
    if (used >= limit) break;
    const id = String(rawId || '').trim();
    if (!id) continue;
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if (!count) continue;
    out[id] = count;
    used += 1;
  }
  return out;
}

function normalizeVoiceResults(value, { limit = 2000 } = {}) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(value) ? value : []) {
    if (out.length >= limit) break;
    const id = String(row?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text: String(row?.text || '').trim() === 'СТОЙ' ? 'СТОЙ' : 'СТРЕЛЯЙ',
      acted: Boolean(row?.acted),
      success: Boolean(row?.success),
    });
  }
  return out;
}

function createEmptyReportedState(intervalSeconds = 60) {
  const safeIntervalSeconds = Math.max(1, Math.floor(Number(intervalSeconds) || 60));
  return {
    intervalSeconds: safeIntervalSeconds,
    shotsByWeapon: { 1: 0, 2: 0, 3: 0 },
    hitsByWeapon: { 1: 0, 2: 0, 3: 0 },
    hits: 0,
    damage: 0,
    damageDelta: 0,
    totalShots: 0,
    totalHits: 0,
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

function normalizeReportedState(value, intervalSeconds = 60) {
  const safeValue = value && typeof value === 'object' ? value : {};
  const shotsByWeapon = safeValue.shotsByWeapon && typeof safeValue.shotsByWeapon === 'object'
    ? safeValue.shotsByWeapon
    : {};
  const hitsByWeapon = safeValue.hitsByWeapon && typeof safeValue.hitsByWeapon === 'object'
    ? safeValue.hitsByWeapon
    : {};
  const normalized = createEmptyReportedState(Number(safeValue.intervalSeconds) || intervalSeconds || 60);

  normalized.shotsByWeapon = {
    1: Math.max(0, Math.floor(Number(shotsByWeapon[1] ?? shotsByWeapon.weapon1) || 0)),
    2: Math.max(0, Math.floor(Number(shotsByWeapon[2] ?? shotsByWeapon.weapon2) || 0)),
    3: Math.max(0, Math.floor(Number(shotsByWeapon[3] ?? shotsByWeapon.weapon3) || 0)),
  };
  normalized.hitsByWeapon = {
    1: Math.max(0, Math.floor(Number(hitsByWeapon[1] ?? hitsByWeapon.weapon1) || 0)),
    2: Math.max(0, Math.floor(Number(hitsByWeapon[2] ?? hitsByWeapon.weapon2) || 0)),
    3: Math.max(0, Math.floor(Number(hitsByWeapon[3] ?? hitsByWeapon.weapon3) || 0)),
  };
  normalized.hits = Math.max(0, Math.floor(Number(safeValue.hits) || 0));
  normalized.damageDelta = Math.max(0, Math.floor(Number(safeValue.damageDelta ?? safeValue.damage) || 0));
  normalized.damage = normalized.damageDelta;
  normalized.totalShots = normalized.shotsByWeapon[1] + normalized.shotsByWeapon[2] + normalized.shotsByWeapon[3];
  normalized.totalHits = normalized.hits;
  normalized.lumensSpent = Math.max(0, Math.floor(Number(safeValue.lumensSpent) || 0));
  normalized.lumensGained = Math.max(0, Math.floor(Number(safeValue.lumensGained) || 0));
  normalized.crystalsCollected = Math.max(0, Math.floor(Number(safeValue.crystalsCollected) || 0));
  normalized.sparkIds = normalizeUniqueIds(safeValue.sparkIds, { limit: 1000 });
  normalized.weakZoneHitsById = normalizeWeakZoneHitsMap(safeValue.weakZoneHitsById, { limit: 1000 });
  normalized.voiceResults = normalizeVoiceResults(safeValue.voiceResults, { limit: 1000 });
  normalized.baddieDestroyedIds = normalizeUniqueIds(safeValue.baddieDestroyedIds, { limit: 2000 });
  normalized.baddieDamage = Math.max(0, Math.floor(Number(safeValue.baddieDamage) || 0));
  normalized.maxComboHits = Math.max(0, Math.floor(Number(safeValue.maxComboHits) || 0));
  normalized.maxComboMultiplier = Math.max(1, Number(safeValue.maxComboMultiplier) || 1);
  normalized.heldComboX2MaxDuration = Math.max(0, Math.floor(Number(safeValue.heldComboX2MaxDuration) || 0));
  normalized.reachedX1_5InFirst30s = Boolean(safeValue.reachedX1_5InFirst30s);
  normalized.phoenixStage = Math.max(0, Math.floor(Number(safeValue.phoenixStage) || 0));
  normalized.lumensSpentWeapon3First2Min = Math.max(0, Math.floor(Number(safeValue.lumensSpentWeapon3First2Min) || 0));
  normalized.lumensSpentOtherFirst2Min = Math.max(0, Math.floor(Number(safeValue.lumensSpentOtherFirst2Min) || 0));
  normalized.damageAfterZeroLumens = Math.max(0, Math.floor(Number(safeValue.damageAfterZeroLumens) || 0));

  return normalized;
}

function mergeWeakZoneHitsMaps(base = {}, chunk = {}, { limit = 1000 } = {}) {
  const merged = { ...normalizeWeakZoneHitsMap(base, { limit }) };
  for (const [key, value] of Object.entries(normalizeWeakZoneHitsMap(chunk, { limit }))) {
    merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
  }
  return normalizeWeakZoneHitsMap(merged, { limit });
}

function mergeVoiceResults(base = [], chunk = [], { limit = 1000 } = {}) {
  const map = new Map();
  for (const row of normalizeVoiceResults(base, { limit })) {
    map.set(row.id, row);
  }
  for (const row of normalizeVoiceResults(chunk, { limit })) {
    map.set(row.id, row);
  }
  return Array.from(map.values()).slice(0, limit);
}

function mergeReportedState(current, chunk, intervalSeconds = 60) {
  const base = normalizeReportedState(current, intervalSeconds);
  const incoming = normalizeReportedState(chunk, base.intervalSeconds || intervalSeconds || 60);
  const merged = createEmptyReportedState(base.intervalSeconds || incoming.intervalSeconds || 60);

  merged.shotsByWeapon = {
    1: (Number(base.shotsByWeapon?.[1]) || 0) + (Number(incoming.shotsByWeapon?.[1]) || 0),
    2: (Number(base.shotsByWeapon?.[2]) || 0) + (Number(incoming.shotsByWeapon?.[2]) || 0),
    3: (Number(base.shotsByWeapon?.[3]) || 0) + (Number(incoming.shotsByWeapon?.[3]) || 0),
  };
  merged.hitsByWeapon = {
    1: (Number(base.hitsByWeapon?.[1]) || 0) + (Number(incoming.hitsByWeapon?.[1]) || 0),
    2: (Number(base.hitsByWeapon?.[2]) || 0) + (Number(incoming.hitsByWeapon?.[2]) || 0),
    3: (Number(base.hitsByWeapon?.[3]) || 0) + (Number(incoming.hitsByWeapon?.[3]) || 0),
  };
  merged.hits = (Number(base.hits) || 0) + (Number(incoming.hits) || 0);
  merged.damageDelta = (Number(base.damageDelta) || 0) + (Number(incoming.damageDelta) || 0);
  merged.damage = merged.damageDelta;
  merged.totalShots = merged.shotsByWeapon[1] + merged.shotsByWeapon[2] + merged.shotsByWeapon[3];
  merged.totalHits = merged.hits;
  merged.lumensSpent = (Number(base.lumensSpent) || 0) + (Number(incoming.lumensSpent) || 0);
  merged.lumensGained = (Number(base.lumensGained) || 0) + (Number(incoming.lumensGained) || 0);
  merged.crystalsCollected = (Number(base.crystalsCollected) || 0) + (Number(incoming.crystalsCollected) || 0);
  merged.sparkIds = normalizeUniqueIds([...(base.sparkIds || []), ...(incoming.sparkIds || [])], { limit: 1000 });
  merged.weakZoneHitsById = mergeWeakZoneHitsMaps(base.weakZoneHitsById, incoming.weakZoneHitsById, { limit: 1000 });
  merged.voiceResults = mergeVoiceResults(base.voiceResults, incoming.voiceResults, { limit: 1000 });
  merged.baddieDestroyedIds = normalizeUniqueIds([...(base.baddieDestroyedIds || []), ...(incoming.baddieDestroyedIds || [])], { limit: 2000 });
  merged.baddieDamage = (Number(base.baddieDamage) || 0) + (Number(incoming.baddieDamage) || 0);
  merged.maxComboHits = Math.max(Number(base.maxComboHits) || 0, Number(incoming.maxComboHits) || 0);
  merged.maxComboMultiplier = Math.max(Number(base.maxComboMultiplier) || 1, Number(incoming.maxComboMultiplier) || 1);
  merged.heldComboX2MaxDuration = Math.max(Number(base.heldComboX2MaxDuration) || 0, Number(incoming.heldComboX2MaxDuration) || 0);
  merged.reachedX1_5InFirst30s = Boolean(base.reachedX1_5InFirst30s || incoming.reachedX1_5InFirst30s);
  merged.phoenixStage = Math.max(Number(base.phoenixStage) || 0, Number(incoming.phoenixStage) || 0);
  merged.lumensSpentWeapon3First2Min = (Number(base.lumensSpentWeapon3First2Min) || 0) + (Number(incoming.lumensSpentWeapon3First2Min) || 0);
  merged.lumensSpentOtherFirst2Min = (Number(base.lumensSpentOtherFirst2Min) || 0) + (Number(incoming.lumensSpentOtherFirst2Min) || 0);
  merged.damageAfterZeroLumens = (Number(base.damageAfterZeroLumens) || 0) + (Number(incoming.damageAfterZeroLumens) || 0);

  return merged;
}

function buildLatestFinalReportsMap(rows = []) {
  const finalReportsByUserId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = String(row?.userId || row?.user || '').trim();
    if (!userId) continue;
    const current = finalReportsByUserId.get(userId);
    const currentSequence = Math.max(0, Math.floor(Number(current?.reportSequence) || 0));
    const nextSequence = Math.max(0, Math.floor(Number(row?.reportSequence) || 0));
    if (!current || nextSequence >= currentSequence) {
      finalReportsByUserId.set(userId, row);
    }
  }
  return finalReportsByUserId;
}

async function finalizeBattleWithReports(battleId) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  if (String(battle.status) !== 'active') return null;

  const runtimeAttendance = await battleRuntimeStore.listAttendanceStatesByBattle({ battleId, limit: 50000 }).catch(() => []);
  const runtimeFinalReports = await battleRuntimeStore.listFinalReportsByBattle({ battleId, limit: 50000 }).catch(() => []);
  const finalReportsByUserId = buildLatestFinalReportsMap(runtimeFinalReports);
  const attendance = Array.isArray(runtimeAttendance) && runtimeAttendance.length
    ? runtimeAttendance
    : (Array.isArray(battle.attendance) ? battle.attendance : []);
  const updatedAttendance = new Array(attendance.length);
  await runInBatches(attendance.map((row, index) => ({ row, index })), 25, async ({ row, index }) => {
    const userId = String(row?.user || '').trim();
    if (!userId) {
      updatedAttendance[index] = row;
      return;
    }

    const finalReportState = finalReportsByUserId.get(userId) || null;
    const finalReportSequence = Math.max(0, Math.floor(Number(finalReportState?.reportSequence) || 0));
    const currentAcceptedSequence = Math.max(0, Math.floor(Number(row?.lastAcceptedReportSequence) || 0));
    const shouldMergeFinalReport = Boolean(finalReportState?.report) && finalReportSequence > currentAcceptedSequence;
    const hasAcceptedFinalReport = Boolean(finalReportState) || Boolean(row?.finalReportAt);
    const reported = shouldMergeFinalReport
      ? mergeReportedState(row?.reported, finalReportState.report, row?.syncIntervalSeconds || 60)
      : (row?.reported && typeof row.reported === 'object' ? row.reported : null);

    const sparkIds = normalizeUniqueIds(reported?.sparkIds, { limit: 1000 });
    const weakZoneHitsById = normalizeWeakZoneHitsMap(reported?.weakZoneHitsById, { limit: 1000 });
    const voiceResults = normalizeVoiceResults(reported?.voiceResults, { limit: 1000 });
    const baddieDestroyedIds = normalizeUniqueIds(reported?.baddieDestroyedIds, { limit: 2000 });
    const reportedBaddieDamage = Math.max(0, Math.floor(Number(reported?.baddieDamage) || 0));
    const hitsByWeaponRaw = reported?.hitsByWeapon && typeof reported.hitsByWeapon === 'object'
      ? reported.hitsByWeapon
      : {};
    const hitsByWeapon = {
      1: Math.max(0, Math.floor(Number(hitsByWeaponRaw[1] ?? hitsByWeaponRaw.weapon1) || 0)),
      2: Math.max(0, Math.floor(Number(hitsByWeaponRaw[2] ?? hitsByWeaponRaw.weapon2) || 0)),
      3: Math.max(0, Math.floor(Number(hitsByWeaponRaw[3] ?? hitsByWeaponRaw.weapon3) || 0)),
    };
    const maxComboHits = Math.max(0, Math.floor(Number(reported?.maxComboHits) || 0));
    const maxComboMultiplier = Math.max(1, Number(reported?.maxComboMultiplier) || 1);
    const heldComboX2MaxDuration = Math.max(0, Math.floor(Number(reported?.heldComboX2MaxDuration) || 0));
    const reachedX1_5InFirst30s = Boolean(reported?.reachedX1_5InFirst30s);
    const phoenixStage = Math.max(0, Math.floor(Number(reported?.phoenixStage) || 0));
    const lumensSpentWeapon3First2Min = Math.max(0, Math.floor(Number(reported?.lumensSpentWeapon3First2Min) || 0));
    const lumensSpentOtherFirst2Min = Math.max(0, Math.floor(Number(reported?.lumensSpentOtherFirst2Min) || 0));
    const damageAfterZeroLumens = Math.max(0, Math.floor(Number(reported?.damageAfterZeroLumens) || 0));

    const weakZoneHits = Object.values(weakZoneHitsById).reduce((sum, value) => sum + value, 0);
    const totalHitsByWeapon = hitsByWeapon[1] + hitsByWeapon[2] + hitsByWeapon[3];
    const reportedTotalHits = Math.max(0, Math.floor(Number(reported?.totalHits ?? reported?.hits) || totalHitsByWeapon));
    const safeWeakZoneHits = Math.min(weakZoneHits, reportedTotalHits);
    const safeNonWeakZoneHits = Math.max(0, reportedTotalHits - safeWeakZoneHits);

    let voiceCommandsSuccess = 0;
    let voiceCommandsSilenceSuccess = 0;
    let voiceCommandsAttackSuccess = 0;
    let voiceCommandsConsecutive = 0;
    let voiceCommandsTotalAttempts = 0;
    let bestVoiceConsecutive = 0;
    const voiceCommandsHistory = [];
    voiceResults.forEach((voiceRow) => {
      const safeSuccess = Boolean(voiceRow.success);
      voiceCommandsHistory.push(safeSuccess);
      voiceCommandsTotalAttempts += 1;
      if (safeSuccess) {
        voiceCommandsSuccess += 1;
        voiceCommandsConsecutive += 1;
        if (voiceRow.text === 'СТРЕЛЯЙ') voiceCommandsSilenceSuccess += 1;
        if (voiceRow.text === 'СТОЙ') voiceCommandsAttackSuccess += 1;
      } else {
        voiceCommandsConsecutive = 0;
      }
      bestVoiceConsecutive = Math.max(bestVoiceConsecutive, voiceCommandsConsecutive);
    });

    const next = { ...(row || {}) };
    if (reported) {
      next.reported = reported;
      next.damage = Math.max(0, Math.floor(Number(reported?.damageDelta ?? reported?.damage) || 0));
      next.totalShots = Math.max(0, Math.floor(Number(reported?.totalShots) || 0));
      next.totalHits = reportedTotalHits;
      next.lumensSpentTotal = Math.max(0, Math.floor(Number(reported?.lumensSpent) || 0));
      next.crystalsCollected = Math.max(0, Math.floor(Number(reported?.crystalsCollected) || sparkIds.length || 0));
      next.lumensGainedTotal = Math.max(0, Math.floor(Number(reported?.lumensGained) || 0));
      next.sparkIds = sparkIds;
      next.weakZoneHits = safeWeakZoneHits;
      next.nonWeakZoneHits = safeNonWeakZoneHits;
      next.weapon2Hits = hitsByWeapon[2];
      next.weapon3Hits = hitsByWeapon[3];
      next.nonBaseWeaponHits = hitsByWeapon[2] + hitsByWeapon[3];
      next.voiceCommandsSuccess = voiceCommandsSuccess;
      next.voiceCommandsSilenceSuccess = voiceCommandsSilenceSuccess;
      next.voiceCommandsAttackSuccess = voiceCommandsAttackSuccess;
      next.voiceCommandsConsecutive = bestVoiceConsecutive;
      next.voiceCommandsTotalAttempts = voiceCommandsTotalAttempts;
      next.voiceCommandsHistory = voiceCommandsHistory;
      next.baddieDestroyedIds = baddieDestroyedIds;
      next.darknessDamageFromBaddies = reportedBaddieDamage;
      next.comboHits = maxComboHits;
      next.comboMultiplier = maxComboMultiplier;
      next.heldComboX2MaxDuration = heldComboX2MaxDuration;
      next.reachedX1_5InFirst30s = reachedX1_5InFirst30s;
      next.phoenixStage = phoenixStage;
      next.lumensSpentWeapon3First2Min = lumensSpentWeapon3First2Min;
      next.lumensSpentOtherFirst2Min = lumensSpentOtherFirst2Min;
      next.damageAfterZeroLumens = damageAfterZeroLumens;
      next.finalReportAt = shouldMergeFinalReport
        ? (finalReportState.acceptedAt || row?.finalReportAt || row?.lastClientSyncAt || new Date().toISOString())
        : (finalReportState?.acceptedAt || row?.finalReportAt || row?.lastClientSyncAt || null);
      next.lastAcceptedReportSequence = shouldMergeFinalReport
        ? Math.max(currentAcceptedSequence, finalReportSequence)
        : currentAcceptedSequence;
      next.finalReportLate = !hasAcceptedFinalReport;
      next.finalReportVerificationPending = false;
      next.finalReportHasPayload = shouldMergeFinalReport;
      next.personalDataSource = shouldMergeFinalReport ? 'final_report' : 'last_heartbeat';
    } else {
      next.damage = 0;
      next.totalShots = 0;
      next.totalHits = 0;
      next.lumensSpentTotal = 0;
      next.crystalsCollected = 0;
      next.lumensGainedTotal = 0;
      next.sparkIds = [];
      next.weakZoneHits = 0;
      next.nonWeakZoneHits = 0;
      next.weapon2Hits = 0;
      next.weapon3Hits = 0;
      next.nonBaseWeaponHits = 0;
      next.voiceCommandsSuccess = 0;
      next.voiceCommandsSilenceSuccess = 0;
      next.voiceCommandsAttackSuccess = 0;
      next.voiceCommandsConsecutive = 0;
      next.voiceCommandsTotalAttempts = 0;
      next.voiceCommandsHistory = [];
      next.baddieDestroyedIds = [];
      next.darknessDamageFromBaddies = 0;
      next.finalReportAt = finalReportState?.acceptedAt || null;
      next.finalReportLate = !hasAcceptedFinalReport;
      next.finalReportVerificationPending = false;
      next.finalReportHasPayload = false;
      next.personalDataSource = 'none';
    }

    next.suspicious = false;
    next.suspiciousAt = null;
    next.suspiciousReasons = [];
    next.suspiciousEvidence = null;

    next.rewardSc = computeBattleRewardSc({
      damage: next.damage,
    });

    updatedAttendance[index] = next;
  });

  const actualBattleEndAt = battle?.endsAt ? new Date(battle.endsAt) : new Date();
  const forceTotals = computeBattleForceTotals(battle, {
    endedAt: actualBattleEndAt,
    baddieDamage: updatedAttendance.reduce((sum, row) => sum + (Number(row?.darknessDamageFromBaddies) || 0), 0),
  });
  const totalPlayerDamage = updatedAttendance.reduce((sum, row) => sum + (Number(row?.damage) || 0), 0);
  const totalLightDamage = totalPlayerDamage + forceTotals.guardianDamage;
  const totalDarknessDamage = forceTotals.darknessBaseDamage + forceTotals.darknessDamageFromBaddies;

  try {
    await buildFinishedBattleSummary({
      ...battle,
      attendance: updatedAttendance,
      lightDamage: totalLightDamage,
      darknessDamage: totalDarknessDamage,
    });
  } catch (_error) {
    // Rank and top player will still be rechecked inside finishBattle if needed.
  }

  const finalizedBattle = await finishBattle(battleId, {
    attendance: updatedAttendance,
    attendanceCount: updatedAttendance.length,
    absoluteLightDamage: totalLightDamage,
    absoluteDarknessDamage: totalDarknessDamage,
    endedAt: actualBattleEndAt,
    deferSideEffects: true,
  });
  if (!finalizedBattle) return null;

  await updateModelDoc('Battle', battleId, {
    finalReportWindowSeconds: BATTLE_FINAL_WINDOW_SECONDS,
    finalReportWindowClosedAt: new Date().toISOString(),
    guardianDamage: forceTotals.guardianDamage,
    darknessBaseDamage: forceTotals.darknessBaseDamage,
    darknessDamageFromBaddies: forceTotals.darknessDamageFromBaddies,
  });
  await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
  return getModelDocById('Battle', battleId);
}

async function tryFinalizeBattleIfReady(battleId, { allParticipantsReported = false } = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId || battleEarlyFinalizeLocks.has(safeBattleId)) {
    return false;
  }

  battleEarlyFinalizeLocks.add(safeBattleId);
  try {
    const battle = await getModelDocById('Battle', safeBattleId);
    if (!battle || String(battle.status || '') !== 'active') {
      return false;
    }

    const nowMs = Date.now();
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    const reportAcceptEndsAtMs = Number.isFinite(endsAtMs)
      ? endsAtMs + (BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000)
      : NaN;
    if (!Number.isFinite(endsAtMs) || !Number.isFinite(reportAcceptEndsAtMs) || nowMs < endsAtMs) {
      return false;
    }

    let shouldFinalize = nowMs >= reportAcceptEndsAtMs;
    if (!shouldFinalize && allParticipantsReported) {
      shouldFinalize = true;
    }
    if (!shouldFinalize) {
      return false;
    }

    await finalizeBattleWithReports(safeBattleId);
    return true;
  } catch (error) {
    console.error('tryFinalizeBattleIfReady error:', error);
    return false;
  } finally {
    battleEarlyFinalizeLocks.delete(safeBattleId);
  }
}

async function processDueBattleSettlements({ now = new Date() } = {}) {
  const settlements = await battleRuntimeStore.listDueFinalSettlements({ nowMs: now.getTime() });
  const processed = [];

  for (const settlement of settlements) {
    const battleId = String(settlement?.battleId || '').trim();
    if (!battleId) continue;

    const battle = await getModelDocById('Battle', battleId);
    if (!battle) {
      await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
      continue;
    }

    if (String(battle.status) === 'finished') {
      await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
      continue;
    }

    await finishBattle(battleId, {
      attendance: Array.isArray(settlement.attendance) ? settlement.attendance : [],
      attendanceCount: Number(settlement.attendanceCount) || 0,
      absoluteLightDamage: Number(settlement.totalLightDamage) || 0,
      absoluteDarknessDamage: Number(settlement.totalDarknessDamage) || 0,
      endedAt: settlement.finalReportWindowClosedAt || null,
      deferSideEffects: true,
    });
    await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
    processed.push(battleId);
  }

  return processed;
}

async function applyFinalSettlementNow(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return null;

  const settlement = await battleRuntimeStore.getFinalSettlement({ battleId: safeBattleId }).catch(() => null);
  if (!settlement) {
    return getModelDocById('Battle', safeBattleId);
  }

  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle) {
    await battleRuntimeStore.deleteFinalSettlement({ battleId: safeBattleId }).catch(() => {});
    return null;
  }

  if (String(battle.status) === 'finished') {
    await battleRuntimeStore.deleteFinalSettlement({ battleId: safeBattleId }).catch(() => {});
    return battle;
  }

  await finishBattle(safeBattleId, {
    attendance: Array.isArray(settlement.attendance) ? settlement.attendance : [],
    attendanceCount: Number(settlement.attendanceCount) || 0,
    absoluteLightDamage: Number(settlement.totalLightDamage) || 0,
    absoluteDarknessDamage: Number(settlement.totalDarknessDamage) || 0,
    endedAt: settlement.finalReportWindowClosedAt || null,
    deferSideEffects: true,
  });
  await battleRuntimeStore.deleteFinalSettlement({ battleId: safeBattleId }).catch(() => {});
  return getModelDocById('Battle', safeBattleId);
}

async function forceFinishBattleNow(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) throw new Error('Battle not found');

  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle) throw new Error('Battle not found');

  const status = String(battle.status || '').trim();
  if (status === 'finished') return battle;
  if (status === 'settling') {
    const settled = await applyFinalSettlementNow(safeBattleId);
    if (!settled) throw new Error('Battle not found');
    return settled;
  }
  if (status !== 'active') {
    throw new Error('Only active battle can be finished now');
  }

  await finalizeBattleWithReports(safeBattleId);
  const settled = await applyFinalSettlementNow(safeBattleId);
  if (!settled) throw new Error('Battle not found');
  return settled;
}

async function getCurrentBattle() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const battle = await resolveBattleByPointer({
      kind: CURRENT_BATTLE_POINTER_KIND,
      expectedStatus: 'active',
      fallbackSortMode: 'desc',
    });
    if (!battle) {
      return null;
    }

    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    const finalAcceptEndsAtMs = Number.isFinite(endsAtMs)
      ? endsAtMs + (BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000)
      : NaN;

    if (Number.isFinite(finalAcceptEndsAtMs) && Date.now() >= finalAcceptEndsAtMs) {
      try {
        await forceFinishBattleNow(battle._id);
        continue;
      } catch (error) {
        console.error('getCurrentBattle: stale active battle finish failed', error);
      }
    }

    scheduleBattleFinalize(battle);
    return battle;
  }

  return null;
}

async function getUpcomingBattle() {
  return resolveBattleByPointer({
    kind: UPCOMING_BATTLE_POINTER_KIND,
    expectedStatus: 'scheduled',
    fallbackSortMode: 'asc',
  });
}

async function clearUpcomingScheduledBattle({
  battleId = null,
  reason = 'Cancelled by admin',
  includeAuto = true,
} = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (safeBattleId) {
    const battle = await getModelDocById('Battle', safeBattleId);
    if (!battle || String(battle.status || '') !== 'scheduled') {
      throw new Error('Scheduled battle not found');
    }
    return cancelBattle(safeBattleId, reason);
  }

  const upcoming = await getUpcomingBattle();
  if (upcoming && String(upcoming.status || '') === 'scheduled') {
    if (includeAuto || String(upcoming.scheduleSource || '') !== 'auto') {
      return cancelBattle(upcoming._id, reason);
    }
  }

  const scheduledBattles = await listScheduledBattles({ includeAuto });
  if (scheduledBattles.length > 0) {
    return cancelBattle(scheduledBattles[0]._id, reason);
  }

  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND).catch(() => {});
  return null;
}

module.exports = {
  getBattleById,
  scheduleBattle,
  updateScheduledBattle,
  startBattle,
  finishBattle,
  cancelBattle,
  recordDamage,
  registerAttendance,
  incrementAttendance,
  getCurrentBattle,
  getUpcomingBattle,
  listScheduledBattles,
  clearUpcomingScheduledBattle,
  processActiveBattleTick,
  TICK_SECONDS,
  getWeakZoneState,
  getVoiceCommandState,
  buildVoiceResolutionUpdate,
  ensureAttendanceInitForUser,
  applyVoiceResolutionsForUser,
  markVoiceShotDetected,
  markFirstPlayerJoinIfNeeded,
  recomputeEndsAtForAttendance,
  ensureAttendanceSyncState,
  getBattlePolicy,
  getBattleSyncConfig,
  getBattleFinalWindowConfig,
  getBattleScenario,
  computeBattleMaxLimits,
  finalizeBattleWithReports,
  tryFinalizeBattleIfReady,
  refreshBattleFinalizeSchedule,
  processDueBattleSettlements,
  forceFinishBattleNow,
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_MIN_DURATION_SECONDS,
  BATTLE_NO_ENTRY_DURATION_SECONDS,
  BATTLE_FINAL_WINDOW_SECONDS,
  getActiveUsersCountSnapshot,
  clearBattleTransientState,
  clearAllBattleTransientState,
};
