const { addRadiance } = require('./radianceService');
const { countDocsByModel, insertDoc, listDocsByModel } = require('./documentStore');
const { RADIANCE_RULES, resolveRadianceAmount } = require('../config/radianceRules');

const INJURY_ACTIVE_CACHE_TTL_MS = Math.max(1000, Number(process.env.ACTIVITY_RADIANCE_INJURY_CACHE_TTL_MS) || 10000);
const DAILY_STATS_CACHE_TTL_MS = Math.max(1000, Number(process.env.ACTIVITY_RADIANCE_DAILY_LIMIT_CACHE_TTL_MS) || 10000);

let injuryActiveCache = { expiresAt: 0, value: false };
let injuryActiveInflight = null;
const dailyStatsCache = new Map();
const dailyStatsInflight = new Map();

function normalizeDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
  };
}

function getDayStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayEnd(date = new Date()) {
  const d = getDayStart(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function round3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function getDailyStatsCacheKey(userId, activityType, dayStart) {
  return `${String(userId)}:${String(activityType)}:${dayStart.toISOString()}`;
}

function getDailyStatsCacheExpiry(dayStart, nowMs = Date.now()) {
  return Math.min(getDayEnd(dayStart).getTime(), nowMs + DAILY_STATS_CACHE_TTL_MS);
}

function getCachedDailyStats(cacheKey, nowMs = Date.now()) {
  const cached = dailyStatsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= nowMs) {
    dailyStatsCache.delete(cacheKey);
    return null;
  }
  return cached.value;
}

function setCachedDailyStats(cacheKey, stats, dayStart, nowMs = Date.now()) {
  const safeValue = {
    count: Math.max(0, Number(stats?.count) || 0),
    amount: round3(Math.max(0, Number(stats?.amount) || 0)),
  };
  dailyStatsCache.set(cacheKey, {
    value: safeValue,
    expiresAt: getDailyStatsCacheExpiry(dayStart, nowMs),
  });
  return safeValue;
}

function incrementCachedDailyStats({ userId, activityType, grantedAmount, now = new Date() }) {
  const dayStart = getDayStart(now);
  const cacheKey = getDailyStatsCacheKey(userId, activityType, dayStart);
  const current = getCachedDailyStats(cacheKey, now.getTime()) || { count: 0, amount: 0 };
  return setCachedDailyStats(cacheKey, {
    count: current.count + 1,
    amount: round3(current.amount + Math.max(0, Number(grantedAmount) || 0)),
  }, dayStart, now.getTime());
}

async function getTreeDoc() {
  const rows = await listDocsByModel('Tree', {
    limit: 1,
    orderBy: 'created_at',
    ascending: false,
  });
  return normalizeDoc(rows[0] || null);
}

async function hasActiveInjury({ nowMs = Date.now(), useCache = true } = {}) {
  if (useCache && injuryActiveCache.expiresAt > nowMs) {
    return injuryActiveCache.value;
  }
  if (useCache && injuryActiveInflight) {
    return injuryActiveInflight;
  }

  const promise = getTreeDoc()
    .then((tree) => {
      const injuries = Array.isArray(tree?.injuries) ? tree.injuries : [];
      const value = injuries.some((inj) => (Number(inj?.healedPercent) || 0) < 100);
      if (useCache) {
        injuryActiveCache = {
          value,
          expiresAt: nowMs + INJURY_ACTIVE_CACHE_TTL_MS,
        };
      }
      return value;
    })
    .finally(() => {
      if (useCache) {
        injuryActiveInflight = null;
      }
    });

  if (useCache) {
    injuryActiveInflight = promise;
  }

  return promise;
}

async function alreadyAwarded({ userId, activityType, dedupeKey }) {
  if (!dedupeKey) return false;
  const count = await countDocsByModel('RadianceEarning', {
    dataEq: {
      user: String(userId),
      activityType: String(activityType),
      dedupeKey: String(dedupeKey),
    },
  });
  return count > 0;
}

async function getDailyStats({ userId, activityType, now = new Date(), useCache = true } = {}) {
  const dayStart = getDayStart(now);
  const dayEnd = getDayEnd(now);
  const cacheKey = getDailyStatsCacheKey(userId, activityType, dayStart);
  const nowMs = now.getTime();

  if (useCache) {
    const cached = getCachedDailyStats(cacheKey, nowMs);
    if (cached) return cached;

    const inflight = dailyStatsInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const promise = (async () => {
    const data = await listDocsByModel('RadianceEarning', {
      limit: 5000,
      dataEq: {
        user: String(userId),
        activityType: String(activityType),
      },
      dataGte: { occurredAt: dayStart.toISOString() },
      dataLt: { occurredAt: dayEnd.toISOString() },
    });

    const stats = data.reduce((acc, row) => {
      const amount = Number(row?.amount) || 0;
      return {
        count: acc.count + 1,
        amount: round3(acc.amount + Math.max(0, amount)),
      };
    }, { count: 0, amount: 0 });

    return useCache
      ? setCachedDailyStats(cacheKey, stats, dayStart, nowMs)
      : stats;
  })().finally(() => {
    if (useCache) {
      dailyStatsInflight.delete(cacheKey);
    }
  });

  if (useCache) {
    dailyStatsInflight.set(cacheKey, promise);
  }

  return promise;
}

function normalizeRuleLimits(rule, overrides = {}) {
  const dailyLimitEntries = Number.isFinite(Number(overrides.dailyLimitEntries))
    ? Number(overrides.dailyLimitEntries)
    : Number.isFinite(Number(overrides.dailyLimit))
      ? Number(overrides.dailyLimit)
      : Number(rule?.dailyLimitEntries) || 0;

  const dailyLimitAmount = Number.isFinite(Number(overrides.dailyLimitAmount))
    ? Number(overrides.dailyLimitAmount)
    : Number(rule?.dailyLimitAmount) || 0;

  const awardStep = Number.isFinite(Number(overrides.awardStep))
    ? Number(overrides.awardStep)
    : Number(rule?.awardStep) || 0;

  return {
    dailyLimitEntries: dailyLimitEntries > 0 ? dailyLimitEntries : 0,
    dailyLimitAmount: dailyLimitAmount > 0 ? dailyLimitAmount : 0,
    awardStep: awardStep > 0 ? awardStep : 0,
  };
}

function clampAwardAmount({ requestedAmount, alreadyAwardedAmount, dailyLimitAmount, awardStep }) {
  if (!(requestedAmount > 0)) return 0;
  if (!(dailyLimitAmount > 0)) return round3(requestedAmount);

  const remaining = round3(dailyLimitAmount - Math.max(0, Number(alreadyAwardedAmount) || 0));
  if (!(remaining > 0)) return 0;

  const raw = Math.min(requestedAmount, remaining);
  if (!(awardStep > 0)) return round3(raw);
  if (raw < awardStep) return 0;
  return round3(Math.floor(raw / awardStep) * awardStep);
}

async function insertRadianceEarning({ userId, amount, activityType, meta = {}, dedupeKey = null, occurredAt = new Date() }) {
  const safeOccurredAt = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const earningId = `re_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const safeMeta = meta && typeof meta === 'object' ? { ...meta } : {};
  if (dedupeKey) {
    safeMeta.dedupeKey = String(dedupeKey);
  }
  const payload = {
    user: String(userId),
    amount: round3(amount),
    activityType: String(activityType),
    meta: safeMeta,
    dedupeKey: dedupeKey ? String(dedupeKey) : null,
    occurredAt: safeOccurredAt.toISOString(),
  };

  await insertDoc({
    model: 'RadianceEarning',
    id: earningId,
    data: payload,
    createdAt: safeOccurredAt,
    updatedAt: safeOccurredAt,
  });
  return payload;
}

async function awardRadianceForActivity({
  userId,
  amount = null,
  units = null,
  activityType,
  meta = {},
  context = {},
  dedupeKey = null,
  dailyLimit = null,
  dailyLimitEntries = null,
  dailyLimitAmount = null,
  awardStep = null,
}) {
  if (!userId) return { ok: false, skipped: true, reason: 'no_user', amount: 0, granted: 0 };

  const activityKey = String(activityType || '').trim();
  const rule = RADIANCE_RULES[activityKey] || null;
  const resolved = resolveRadianceAmount({
    activityType: activityKey,
    amount,
    units,
    meta,
    context,
  });
  const requestedAmount = round3(Number(resolved.amount) || 0);
  if (!(requestedAmount > 0)) {
    return { ok: false, skipped: true, reason: 'no_amount', amount: 0, granted: 0, activityType: activityKey };
  }

  const limits = normalizeRuleLimits(rule || resolved.rule, {
    dailyLimit,
    dailyLimitEntries,
    dailyLimitAmount,
    awardStep: awardStep || resolved.awardStep,
  });

  const now = new Date();
  const dedupe = dedupeKey != null ? String(dedupeKey) : null;

  if (dedupe && (await alreadyAwarded({ userId, activityType: activityKey, dedupeKey: dedupe }))) {
    return { ok: false, skipped: true, reason: 'duplicate', amount: 0, granted: 0, activityType: activityKey };
  }

  const stats = (limits.dailyLimitEntries > 0 || limits.dailyLimitAmount > 0)
    ? await getDailyStats({ userId, activityType: activityKey, now, useCache: true })
    : { count: 0, amount: 0 };

  if (limits.dailyLimitEntries > 0 && stats.count >= limits.dailyLimitEntries) {
    return { ok: false, skipped: true, reason: 'daily_limit_entries', amount: 0, granted: 0, activityType: activityKey };
  }

  const grantedAmount = clampAwardAmount({
    requestedAmount,
    alreadyAwardedAmount: stats.amount,
    dailyLimitAmount: limits.dailyLimitAmount,
    awardStep: limits.awardStep,
  });
  if (!(grantedAmount > 0)) {
    return { ok: false, skipped: true, reason: 'daily_limit_amount', amount: 0, granted: 0, activityType: activityKey };
  }

  const metaWithContext = {
    ...(meta && typeof meta === 'object' ? meta : {}),
  };
  if (units != null && metaWithContext.units == null) {
    metaWithContext.units = Number(units);
  }

  await insertRadianceEarning({
    userId,
    amount: grantedAmount,
    activityType: activityKey,
    meta: metaWithContext,
    dedupeKey: dedupe,
    occurredAt: now,
  });

  if (limits.dailyLimitEntries > 0 || limits.dailyLimitAmount > 0) {
    incrementCachedDailyStats({
      userId,
      activityType: activityKey,
      grantedAmount,
      now,
    });
  }

  const radianceResult = await addRadiance(grantedAmount, {
    source: activityKey,
    meta: { ...metaWithContext, userId: String(userId) },
  });

  return {
    ok: true,
    skipped: false,
    amount: grantedAmount,
    granted: grantedAmount,
    requestedAmount,
    activityType: activityKey,
    radiance: radianceResult,
  };
}

module.exports = {
  RADIANCE_RULES,
  awardRadianceForActivity,
  hasActiveInjury,
  __resetActivityRadianceRuntimeState: () => {
    injuryActiveCache = { expiresAt: 0, value: false };
    injuryActiveInflight = null;
    dailyStatsCache.clear();
    dailyStatsInflight.clear();
  },
};
