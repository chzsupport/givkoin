const { listActivities } = require('./activityService');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DAYS_WINDOW = 30;
const MIN_ACTIVE_DAYS = 10;
const MIN_MINUTES = 50;
const MIN_SOLAR = 10;
const MIN_BATTLES = 1;
const MIN_SEARCH = 1;
const MIN_BRIDGE_STONES = 10;
const LOW_ACTIVITY_MINUTES = 15;

function createActivityAccumulator() {
  return {
    daySet: new Set(),
    pageSet: new Set(),
    minutesTotal: 0,
    solarCollects: 0,
    battleCount: 0,
    searchCount: 0,
    bridgeStones: 0,
  };
}

function appendActivityToAccumulator(acc, log) {
  const target = acc || createActivityAccumulator();
  const dayKey = log?.createdAt?.toISOString?.().slice(0, 10);
  if (dayKey) target.daySet.add(dayKey);
  target.minutesTotal += Number(log?.minutes || 0);
  if (log?.type === 'solar_collect') target.solarCollects += 1;
  if (log?.type === 'battle_participation') target.battleCount += 1;
  if (log?.type === 'match_search') target.searchCount += 1;
  if (log?.type === 'bridge_contribute') target.bridgeStones += Number(log?.meta?.stones || 0);
  if (log?.type === 'page_view') {
    const path = log?.meta?.path;
    if (path) target.pageSet.add(String(path));
  }
  return target;
}

function finalizeActivityAccumulator(acc) {
  const target = acc || createActivityAccumulator();
  return {
    daysActive: target.daySet.size,
    minutesTotal: target.minutesTotal,
    solarCollects: target.solarCollects,
    battleCount: target.battleCount,
    searchCount: target.searchCount,
    bridgeStones: target.bridgeStones,
    pagesVisited: target.pageSet.size,
  };
}

function normalizeIdentityString(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

function summarizeActivity(logs = []) {
  const acc = createActivityAccumulator();
  logs.forEach((log) => appendActivityToAccumulator(acc, log));
  return finalizeActivityAccumulator(acc);
}

function createDuplicateCounterMaps() {
  return {
    lastIp: new Map(),
    lastDeviceId: new Map(),
    lastFingerprint: new Map(),
    emailNormalized: new Map(),
    nicknameNormalized: new Map(),
  };
}

function incrementDuplicateCounter(map, value) {
  const key = String(value || '').trim();
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

async function buildDuplicateCounterMaps() {
  const counters = createDuplicateCounterMaps();
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('users')
      .select('id,last_ip,last_device_id,last_fingerprint,email,nickname')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    data.forEach((row) => {
      incrementDuplicateCounter(counters.lastIp, row?.last_ip);
      incrementDuplicateCounter(counters.lastDeviceId, row?.last_device_id);
      incrementDuplicateCounter(counters.lastFingerprint, row?.last_fingerprint);
      incrementDuplicateCounter(counters.emailNormalized, row?.email);
      incrementDuplicateCounter(counters.nicknameNormalized, row?.nickname);
    });

    if (data.length < pageSize) break;
    from += pageSize;
  }
  return counters;
}

function getDuplicateCount(counter, value) {
  const key = String(value || '').trim();
  if (!key) return 0;
  return Math.max(0, Number(counter?.get(key) || 0) - 1);
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,status,role,email_confirmed,last_ip,last_device_id,last_fingerprint,email,nickname,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function buildActivitySummariesByUser(userIds, since) {
  const safeUserIds = (Array.isArray(userIds) ? userIds : []).map((value) => String(value || '').trim()).filter(Boolean);
  const allowedIds = new Set(safeUserIds);
  const accumulators = new Map();

  const rows = await listActivities({
    userIds: safeUserIds,
    types: [],
    since,
    until: new Date(),
    limit: 10000,
  });

  for (const row of (Array.isArray(rows) ? rows : [])) {
    const userId = String(row?.user_id || '').trim();
    if (!allowedIds.has(userId)) continue;
    if (!accumulators.has(userId)) accumulators.set(userId, createActivityAccumulator());
    appendActivityToAccumulator(accumulators.get(userId), {
      ...row,
      user: userId,
      createdAt: row?.created_at ? new Date(row.created_at) : null,
    });
  }

  const summaries = new Map();
  safeUserIds.forEach((userId) => {
    summaries.set(userId, finalizeActivityAccumulator(accumulators.get(userId)));
  });
  return summaries;
}

function buildQuietWatchResult(user, duplicateCounts, summary, checkedAt = new Date()) {
  const failures = [];

  if (user.status !== 'active' || !user.emailConfirmed) failures.push('Не подтверждён email');

  const hasIp = Boolean(user.lastIp);
  const hasDeviceId = Boolean(user.lastDeviceId);
  const hasFingerprint = Boolean(user.lastFingerprint);

  if (!hasIp || !hasDeviceId || !hasFingerprint) {
    return {
      ok: false,
      passed: false,
      reason: 'Недостаточно данных для проверки',
      summary: { ...(summary || {}) },
      checkedAt,
    };
  }

  if (Number(duplicateCounts?.dupIp || 0) > 0) failures.push('IP не уникален');
  if (Number(duplicateCounts?.dupDevice || 0) > 0) failures.push('Устройство не уникально');
  if (Number(duplicateCounts?.dupFp || 0) > 0) failures.push('Fingerprint не уникален');
  if (Number(duplicateCounts?.dupEmailNorm || 0) > 0) failures.push('Почта не уникальна');
  if (Number(duplicateCounts?.dupNickNorm || 0) > 0) failures.push('Ник не уникален');

  const enrichedSummary = {
    ...(summary || finalizeActivityAccumulator()),
  };

  if (enrichedSummary.minutesTotal < LOW_ACTIVITY_MINUTES && (enrichedSummary.pagesVisited || 0) < 5) {
    failures.push('Низкая активность (<15 минут, <5 страниц)');
  }

  if (enrichedSummary.daysActive < MIN_ACTIVE_DAYS) failures.push('Мало активных дней (<10)');
  if (enrichedSummary.minutesTotal < MIN_MINUTES) failures.push('Мало минут онлайн (<50)');
  if (enrichedSummary.solarCollects < MIN_SOLAR) failures.push('Мало сборов заряда (<10)');
  if (enrichedSummary.battleCount < MIN_BATTLES) failures.push('Нет участия в боях');
  if (enrichedSummary.searchCount < MIN_SEARCH) failures.push('Нет поиска собеседника');
  if (enrichedSummary.bridgeStones < MIN_BRIDGE_STONES) failures.push('Недостаточно камней в мост (<10)');

  const passed = failures.length === 0;
  return {
    ok: true,
    passed,
    reason: passed ? 'Пройден Тихий ночной дозор' : failures.join('; '),
    summary: enrichedSummary,
    checkedAt,
  };
}

async function evaluateUserQuietWatch(userId) {
  const row = await getUserRowById(userId);
  if (!row) return { ok: false, passed: false, reason: 'user missing' };

  const data = getUserData(row);
  const user = {
    _id: String(row.id),
    status: data.status || row.status,
    emailConfirmed: Boolean(data.emailConfirmed ?? row.email_confirmed),
    lastIp: data.lastIp || row.last_ip,
    lastDeviceId: data.lastDeviceId || row.last_device_id,
    lastFingerprint: data.lastFingerprint || row.last_fingerprint,
    entity: data.entity || null,
    email: row.email || data.email,
    nickname: row.nickname || data.nickname,
  };

  const duplicateCounters = await buildDuplicateCounterMaps();
  const dupIp = getDuplicateCount(duplicateCounters.lastIp, user.lastIp);
  const dupDevice = getDuplicateCount(duplicateCounters.lastDeviceId, user.lastDeviceId);
  const dupFp = getDuplicateCount(duplicateCounters.lastFingerprint, user.lastFingerprint);
  const dupEmailNorm = getDuplicateCount(duplicateCounters.emailNormalized, user.email);
  const dupNickNorm = getDuplicateCount(duplicateCounters.nicknameNormalized, user.nickname);

  const since = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000);
  const rows = await listActivities({
    userIds: [String(user._id)],
    types: [],
    since,
    until: new Date(),
    limit: 10000,
  });
  const logs = (Array.isArray(rows) ? rows : []).map((row) => ({
    user: row?.user_id,
    type: row?.type,
    minutes: row?.minutes,
    meta: row?.meta,
    createdAt: row?.created_at ? new Date(row.created_at) : null,
  }));
  const summary = summarizeActivity(logs);
  const result = buildQuietWatchResult(user, {
    dupIp,
    dupDevice,
    dupFp,
    dupEmailNorm,
    dupNickNorm,
  }, summary);

  await updateUserDataById(user._id, {
    quietWatchPassed: result.passed,
    quietWatchCheckedAt: result.checkedAt ? new Date(result.checkedAt).toISOString() : new Date().toISOString(),
    quietWatchReason: result.reason,
  });

  return result;
}

async function runUsersQuietWatch({ limit = 5000, staleHours = 24 } = {}) {
  const threshold = new Date(Date.now() - Math.max(1, Number(staleHours) || 24) * 60 * 60 * 1000);

  const safeLimit = Math.max(1, Number(limit) || 5000);
  const supabase = getSupabaseClient();
  const pageSize = 500;
  let from = 0;
  const picked = [];

  while (picked.length < safeLimit) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('users')
      .select('id,status,email_confirmed,last_ip,last_device_id,last_fingerprint,data')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    for (const row of data) {
      if (picked.length >= safeLimit) break;
      const id = String(row?.id || '').trim();
      if (!id) continue;
      const u = getUserData(row);
      const status = String(u.status || row.status || '');
      if (status !== 'active') continue;
      const emailConfirmed = Boolean(u.emailConfirmed ?? row.email_confirmed);
      if (!emailConfirmed) continue;
      const lastIp = String(u.lastIp || row.last_ip || '').trim();
      const lastDeviceId = String(u.lastDeviceId || row.last_device_id || '').trim();
      const lastFingerprint = String(u.lastFingerprint || row.last_fingerprint || '').trim();
      if (!lastIp || !lastDeviceId || !lastFingerprint) continue;

      const checkedAtRaw = u.quietWatchCheckedAt;
      const checkedAt = checkedAtRaw ? new Date(checkedAtRaw) : null;
      const stale = !checkedAt || Number.isNaN(checkedAt.getTime()) || checkedAt < threshold;
      if (!stale) continue;

      picked.push({
        _id: id,
        status,
        emailConfirmed,
        lastIp,
        lastDeviceId,
        lastFingerprint,
        entity: u.entity || null,
        quietWatchCheckedAt: checkedAtRaw || null,
        quietWatchPassed: Boolean(u.quietWatchPassed),
        quietWatchReason: u.quietWatchReason || '',
        email: u.email,
        nickname: u.nickname,
      });
    }

    if (data.length < pageSize) break;
    from += data.length;
  }

  const safeUsers = Array.isArray(picked) ? picked : [];
  if (!safeUsers.length) return 0;

  const userIds = safeUsers.map((user) => String(user?._id || '')).filter(Boolean);
  const since = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000);
  const [duplicateCounters, activitySummaries] = await Promise.all([
    buildDuplicateCounterMaps(),
    buildActivitySummariesByUser(userIds, since),
  ]);

  const checkedAt = new Date();
  let updated = 0;
  for (const user of safeUsers) {
    const userId = String(user?._id || '').trim();
    const result = buildQuietWatchResult(user, {
      dupIp: getDuplicateCount(duplicateCounters.lastIp, user?.lastIp),
      dupDevice: getDuplicateCount(duplicateCounters.lastDeviceId, user?.lastDeviceId),
      dupFp: getDuplicateCount(duplicateCounters.lastFingerprint, user?.lastFingerprint),
      dupEmailNorm: getDuplicateCount(duplicateCounters.emailNormalized, user?.email),
      dupNickNorm: getDuplicateCount(duplicateCounters.nicknameNormalized, user?.nickname),
    }, activitySummaries.get(userId), checkedAt);
    // eslint-disable-next-line no-await-in-loop
    await updateUserDataById(userId, {
      quietWatchPassed: result.passed,
      quietWatchCheckedAt: result.checkedAt ? new Date(result.checkedAt).toISOString() : new Date().toISOString(),
      quietWatchReason: result.reason,
    });
    updated += 1;
  }
  return updated;
}

module.exports = {
  normalizeIdentityString,
  summarizeActivity,
  evaluateUserQuietWatch,
  runUsersQuietWatch,
};
