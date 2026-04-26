const { getSupabaseClient } = require('../lib/supabaseClient');

const TREE_BLESSING_PERCENT = 10;
const TREE_BLESSING_MULTIPLIER = 1 + TREE_BLESSING_PERCENT / 100;
const TREE_BLESSING_DURATION_HOURS = 3;
const TREE_BLESSING_DURATION_MS = TREE_BLESSING_DURATION_HOURS * 60 * 60 * 1000;
const TREE_BLESSING_DAILY_LIMIT = 3;

const TREE_BLESSING_CACHE_TTL_MS = Math.max(1000, Number(process.env.TREE_BLESSING_CACHE_TTL_MS) || 5 * 1000);

const treeBlessingMultiplierCache = new Map();
const treeBlessingMultiplierInflight = new Map();

function round3(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000) / 1000;
}

function getDayKeyLocal(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCacheKey(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : String(value);
}

function cleanupExpiredRuntimeEntries(map, nowMs = Date.now()) {
  if (!map || map.size < 500) return;
  for (const [key, entry] of map.entries()) {
    if (!entry || entry.expiresAt <= nowMs) {
      map.delete(key);
    }
  }
}

function getCachedRuntimeValue(map, key, nowMs = Date.now()) {
  if (!key) return null;
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedRuntimeValue(map, key, value, expiresAt) {
  if (!key) return value;
  map.set(key, { value, expiresAt });
  return value;
}

function clearTreeBlessingCacheForUser(userId) {
  const cacheKey = getCacheKey(userId);
  if (!cacheKey) return;
  treeBlessingMultiplierCache.delete(cacheKey);
  treeBlessingMultiplierInflight.delete(cacheKey);
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const currentRow = await getUserRowById(userId);
  if (!currentRow) return null;

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const nextData = { ...getUserData(currentRow), ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: nextData, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,email,nickname,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getTreeBlessingStateFromData(data, now = new Date()) {
  const safeData = data && typeof data === 'object' ? data : {};
  const shopBoosts = safeData.shopBoosts && typeof safeData.shopBoosts === 'object' ? safeData.shopBoosts : {};
  const practiceBlessings = safeData.practiceBlessings && typeof safeData.practiceBlessings === 'object'
    ? safeData.practiceBlessings
    : {};

  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const dayKey = getDayKeyLocal(nowDate);
  const storedDayKey = String(practiceBlessings.treeBlessingDayKey || '').trim();
  const usesToday = storedDayKey === dayKey
    ? Math.max(0, Math.floor(Number(practiceBlessings.treeBlessingUsesToday) || 0))
    : 0;

  const activeUntilRaw = String(shopBoosts.practiceTreeBlessingUntil || '').trim();
  const activeUntilMs = activeUntilRaw ? new Date(activeUntilRaw).getTime() : 0;
  const isActive = Number.isFinite(activeUntilMs) && activeUntilMs > nowMs;
  const activeUntil = isActive ? new Date(activeUntilMs).toISOString() : null;
  const remainingUses = Math.max(0, TREE_BLESSING_DAILY_LIMIT - usesToday);
  const canClaim = !isActive && remainingUses > 0;
  const reason = isActive ? 'active' : (remainingUses <= 0 ? 'daily_limit' : 'available');

  return {
    dayKey,
    shopBoosts,
    practiceBlessings,
    usesToday,
    remainingUses,
    isActive,
    activeUntil,
    nextAvailableAt: activeUntil,
    canClaim,
    reason,
  };
}

function buildTreeBlessingStatusPayload(state, now = new Date()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  return {
    serverNow: nowDate.getTime(),
    rewardPercent: TREE_BLESSING_PERCENT,
    durationHours: TREE_BLESSING_DURATION_HOURS,
    waitSeconds: 30,
    dailyLimit: TREE_BLESSING_DAILY_LIMIT,
    usesToday: state.usesToday,
    remainingUses: state.remainingUses,
    active: state.isActive,
    activeUntil: state.activeUntil,
    nextAvailableAt: state.nextAvailableAt,
    canClaim: state.canClaim,
    reason: state.reason,
  };
}

async function getTreeBlessingStatusForUser(userId, { now = new Date() } = {}) {
  const row = await getUserRowById(userId);
  if (!row) return null;
  const state = getTreeBlessingStateFromData(getUserData(row), now);
  return {
    row,
    state,
    status: buildTreeBlessingStatusPayload(state, now),
  };
}

async function claimTreeBlessingForUser(userId, { now = new Date() } = {}) {
  const row = await getUserRowById(userId);
  if (!row) {
    return { ok: false, code: 'user_not_found', status: null };
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = nowDate.toISOString();
  const data = getUserData(row);
  const state = getTreeBlessingStateFromData(data, nowDate);

  if (state.isActive) {
    return {
      ok: false,
      code: 'active',
      status: buildTreeBlessingStatusPayload(state, nowDate),
    };
  }

  if (state.remainingUses <= 0) {
    return {
      ok: false,
      code: 'daily_limit',
      status: buildTreeBlessingStatusPayload(state, nowDate),
    };
  }

  const nextUsesToday = state.usesToday + 1;
  const nextActiveUntil = new Date(nowDate.getTime() + TREE_BLESSING_DURATION_MS).toISOString();
  const nextShopBoosts = {
    ...state.shopBoosts,
    practiceTreeBlessingUntil: nextActiveUntil,
  };
  const nextPracticeBlessings = {
    ...state.practiceBlessings,
    treeBlessingDayKey: state.dayKey,
    treeBlessingUsesToday: nextUsesToday,
    treeBlessingLastClaimAt: nowIso,
  };

  const updatedRow = await updateUserDataById(userId, {
    shopBoosts: nextShopBoosts,
    practiceBlessings: nextPracticeBlessings,
  });
  if (!updatedRow) {
    return { ok: false, code: 'update_failed', status: null };
  }

  clearTreeBlessingCacheForUser(userId);
  const nextState = getTreeBlessingStateFromData(getUserData(updatedRow), nowDate);
  return {
    ok: true,
    code: 'claimed',
    row: updatedRow,
    state: nextState,
    status: buildTreeBlessingStatusPayload(nextState, nowDate),
  };
}

async function getTreeBlessingRewardMultiplierForUser(userId, { now = new Date() } = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();
  const cacheKey = getCacheKey(userId);
  const cached = getCachedRuntimeValue(treeBlessingMultiplierCache, cacheKey, nowMs);
  if (cached !== null) return cached;

  const inflight = cacheKey ? treeBlessingMultiplierInflight.get(cacheKey) : null;
  if (inflight) return inflight;

  const promise = (async () => {
    cleanupExpiredRuntimeEntries(treeBlessingMultiplierCache, nowMs);

    const row = await getUserRowById(userId);
    const state = getTreeBlessingStateFromData(getUserData(row), nowDate);
    const multiplier = state.isActive ? TREE_BLESSING_MULTIPLIER : 1;
    const expiresAt = state.isActive && state.activeUntil
      ? Math.min(new Date(state.activeUntil).getTime(), nowMs + TREE_BLESSING_CACHE_TTL_MS)
      : nowMs + TREE_BLESSING_CACHE_TTL_MS;
    return setCachedRuntimeValue(treeBlessingMultiplierCache, cacheKey, multiplier, expiresAt > nowMs ? expiresAt : nowMs + 1);
  })().finally(() => {
    if (cacheKey) {
      treeBlessingMultiplierInflight.delete(cacheKey);
    }
  });

  if (cacheKey) {
    treeBlessingMultiplierInflight.set(cacheKey, promise);
  }

  return promise;
}

async function applyTreeBlessingToReward({ userId, sc = 0, lumens = 0, now = new Date() }) {
  const multiplier = await getTreeBlessingRewardMultiplierForUser(userId, { now });
  const safeSc = Math.max(0, Number(sc) || 0);
  const safeLumens = Math.max(0, Number(lumens) || 0);

  return {
    multiplier,
    sc: multiplier > 1 ? round3(safeSc * multiplier) : round3(safeSc),
    lumens: multiplier > 1 ? Math.max(0, Math.floor(safeLumens * multiplier)) : Math.max(0, Math.floor(safeLumens)),
  };
}

function __resetTreeBlessingRuntimeState() {
  treeBlessingMultiplierCache.clear();
  treeBlessingMultiplierInflight.clear();
}

module.exports = {
  TREE_BLESSING_DAILY_LIMIT,
  TREE_BLESSING_DURATION_HOURS,
  TREE_BLESSING_DURATION_MS,
  TREE_BLESSING_MULTIPLIER,
  TREE_BLESSING_PERCENT,
  applyTreeBlessingToReward,
  buildTreeBlessingStatusPayload,
  claimTreeBlessingForUser,
  getTreeBlessingRewardMultiplierForUser,
  getTreeBlessingStateFromData,
  getTreeBlessingStatusForUser,
  __resetTreeBlessingRuntimeState,
};

