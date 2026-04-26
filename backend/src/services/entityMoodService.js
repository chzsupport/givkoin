const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const RADIANCE_MODEL = 'RadianceEarning';
const HOUR_MODEL = 'EntityMoodHour';
const SNAPSHOT_MODEL = 'EntityMoodSnapshot';

const ENTITY_MOOD_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.ENTITY_MOOD_CACHE_TTL_MS) || 10 * 1000
);
const ENTITY_MOOD_REFRESH_MAX_AGE_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.ENTITY_MOOD_REFRESH_MAX_AGE_MS) || 55 * 60 * 1000
);
const ENTITY_MOOD_ONLINE_LOOKBACK_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.ENTITY_MOOD_ONLINE_LOOKBACK_MS) || 65 * 60 * 1000
);

const entityMoodCache = new Map();
const entityMoodInflight = new Map();

const LIGHT_TYPES = [
  'solar_collect',
  'solar_share',
  'fruit_collect',
  'entity_create',
  'attendance_day',
  'personal_luck',
];

const SOCIAL_TYPES = [
  'chat_1h',
  'chat_rate',
  'friend_add',
  'wish_create',
  'wish_support',
  'feedback_letter',
  'referral_active',
];

const PRACTICE_TYPES = [
  'meditation_individual',
  'meditation_group',
  'night_shift',
  'night_shift_hour',
  'night_shift_anomaly',
  'shard_collect',
  'evil_root_confession',
  'fortune_spin',
  'lottery_ticket_buy',
  'bridge_create',
  'bridge_contribute',
  'gratitude_write',
  'tree_heal_button',
  'shop_buy_item',
  'shop_use_item',
  'achievement_any',
];

function round3(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableSortObject(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  return Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      acc[key] = stableSortObject(value[key]);
      return acc;
    }, {});
}

function buildPayloadHash(value) {
  const normalized = JSON.stringify(stableSortObject(value));
  return crypto.createHash('sha1').update(normalized).digest('hex');
}

function getMoodCacheKey(userId) {
  if (!userId) return '';
  return typeof userId === 'string' ? userId : String(userId);
}

function cleanupExpiredEntityMoodCache(nowMs = Date.now()) {
  if (entityMoodCache.size < 500) return;
  for (const [key, entry] of entityMoodCache.entries()) {
    if (!entry || entry.expiresAt <= nowMs) {
      entityMoodCache.delete(key);
    }
  }
}

function getCachedEntityMood(userId, nowMs = Date.now()) {
  const key = getMoodCacheKey(userId);
  if (!key) return null;
  const entry = entityMoodCache.get(key);
  if (!entry || entry.expiresAt <= nowMs) {
    entityMoodCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedEntityMood(userId, value, nowMs = Date.now()) {
  const key = getMoodCacheKey(userId);
  if (!key) return value;
  cleanupExpiredEntityMoodCache(nowMs);
  entityMoodCache.set(key, {
    value,
    expiresAt: nowMs + ENTITY_MOOD_CACHE_TTL_MS,
  });
  return value;
}

function invalidateEntityMoodCache(userId = null) {
  if (!userId) {
    entityMoodCache.clear();
    entityMoodInflight.clear();
    return;
  }
  const key = getMoodCacheKey(userId);
  if (!key) return;
  entityMoodCache.delete(key);
  entityMoodInflight.delete(key);
}

function getSevenDaysAgo(base = new Date()) {
  return new Date(base.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function getHourStart(date = new Date()) {
  const value = new Date(date);
  value.setMinutes(0, 0, 0);
  return value;
}

function getHourEnd(date = new Date()) {
  return new Date(getHourStart(date).getTime() + (60 * 60 * 1000));
}

function getSnapshotDocId(userId) {
  return `entity_mood_snapshot:${String(userId)}`;
}

function getHourDocId(userId, hourStartIso) {
  return `entity_mood_hour:${String(userId)}:${String(hourStartIso)}`;
}

function isSated(entity, now = new Date()) {
  if (!entity?.satietyUntil) return false;
  return new Date(entity.satietyUntil).getTime() > now.getTime();
}

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

async function getEntityRowByUserId(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('entities')
    .select('id,user_id,mood,satiety_until')
    .eq('user_id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateEntityMoodById(entityId, mood) {
  if (!entityId) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('entities')
    .update({ mood: String(mood), updated_at: nowIso })
    .eq('id', Number(entityId))
    .select('id,user_id,mood,satiety_until')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getUserDebuffRow(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error || !data) return null;
  const json = data.data && typeof data.data === 'object' ? data.data : {};
  return {
    debuffActiveUntil: json.debuffActiveUntil || null,
    debuffPercent: json.debuffPercent || 0,
  };
}

async function countAppealsByUser(userId, since) {
  const supabase = getSupabaseClient();
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();
  const { count, error } = await supabase
    .from(DOC_TABLE)
    .select('id', { head: true, count: 'exact' })
    .eq('model', 'Appeal')
    .eq('data->>againstUser', String(userId))
    .eq('data->>status', 'resolved')
    .eq('data->>penaltyApplied', 'true')
    .gte('data->>resolvedAt', sinceIso);
  if (error) return 0;
  return Math.max(0, Number(count) || 0);
}

function resolveMoodUnits(activityType, rowData = {}) {
  const meta = rowData.meta && typeof rowData.meta === 'object' ? rowData.meta : {};
  switch (String(activityType || '').trim()) {
    case 'tree_heal_button':
      return Math.max(0, Number(meta.lumens) || 0);
    case 'bridge_contribute':
      return Math.max(0, Number(meta.stones) || 0);
    case 'meditation_individual':
      return Math.max(0, Number(meta.completedBreaths) || 0);
    case 'meditation_group':
      return Math.max(0, Number(meta.meditations) || 0);
    case 'night_shift_anomaly':
      return Math.max(0, Number(meta.acceptedAnomalies) || 0);
    case 'night_shift_hour':
      return Math.max(0, Number(meta.payableHours) || 0);
    case 'night_shift':
      return Math.max(0, Number(meta.payableHours) || 0) || Math.max(0, Number(meta.acceptedAnomalies) || 0);
    default:
      return 1;
  }
}

async function listRadianceEarningsForUser({ userId, since, until = new Date(), pageSize = 1000 } = {}) {
  if (!userId) return [];
  const supabase = getSupabaseClient();
  const out = [];
  const safePageSize = Math.max(1, Math.min(5000, Number(pageSize) || 1000));
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();
  const untilIso = until instanceof Date ? until.toISOString() : new Date(until).toISOString();
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', RADIANCE_MODEL)
      .eq('data->>user', String(userId))
      .gte('created_at', sinceIso)
      .lt('created_at', untilIso)
      .order('created_at', { ascending: true })
      .range(from, from + safePageSize - 1);

    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < safePageSize) break;
    from += data.length;
  }

  return out;
}

async function listMoodHourDocsForUser({ userId, since, pageSize = 250 } = {}) {
  if (!userId) return [];
  const supabase = getSupabaseClient();
  const out = [];
  const safePageSize = Math.max(1, Math.min(500, Number(pageSize) || 250));
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', HOUR_MODEL)
      .eq('data->>user', String(userId))
      .gte('data->>hourStart', sinceIso)
      .order('data->>hourStart', { ascending: true })
      .range(from, from + safePageSize - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < safePageSize) break;
    from += data.length;
  }

  return out;
}

async function getSnapshotDocByUserId(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', SNAPSHOT_MODEL)
    .eq('id', getSnapshotDocId(userId))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

function buildHourStatsPayload(byType = {}) {
  const out = {};
  const keys = Object.keys(byType).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const item = byType[key] || {};
    out[key] = {
      count: Math.max(0, Number(item.count) || 0),
      amount: round3(Math.max(0, Number(item.amount) || 0)),
      units: round3(Math.max(0, Number(item.units) || 0)),
    };
  }
  return out;
}

function buildHourBucketsFromRadiance(rows = []) {
  const buckets = new Map();

  for (const row of rows) {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    const activityType = String(data.activityType || '').trim();
    if (!activityType) continue;

    const occurredAt = data.occurredAt || row?.created_at || null;
    const occurredDate = occurredAt ? new Date(occurredAt) : null;
    if (!occurredDate || Number.isNaN(occurredDate.getTime())) continue;

    const hourStart = getHourStart(occurredDate);
    const hourKey = hourStart.toISOString();
    const entry = buckets.get(hourKey) || {
      hourStart: hourKey,
      hourEnd: getHourEnd(hourStart).toISOString(),
      totalCount: 0,
      totalRadiance: 0,
      byType: {},
    };

    const amount = Math.max(0, Number(data.amount) || 0);
    const units = resolveMoodUnits(activityType, data);
    const typeEntry = entry.byType[activityType] || { count: 0, amount: 0, units: 0 };

    typeEntry.count += 1;
    typeEntry.amount = round3(typeEntry.amount + amount);
    typeEntry.units = round3(typeEntry.units + units);
    entry.byType[activityType] = typeEntry;
    entry.totalCount += 1;
    entry.totalRadiance = round3(entry.totalRadiance + amount);

    buckets.set(hourKey, entry);
  }

  return buckets;
}

async function upsertMoodHourDocs(userId, buckets, since) {
  const existingRows = await listMoodHourDocsForUser({ userId, since });
  const existingByHour = new Map(
    existingRows.map((row) => [String(row.hourStart || ''), row])
  );

  const nowIso = new Date().toISOString();
  const payloads = [];

  for (const [hourStart, bucket] of buckets.entries()) {
    const byType = buildHourStatsPayload(bucket.byType);
    const payload = {
      user: String(userId),
      hourStart,
      hourEnd: bucket.hourEnd,
      totalCount: Math.max(0, Number(bucket.totalCount) || 0),
      totalRadiance: round3(Math.max(0, Number(bucket.totalRadiance) || 0)),
      byType,
    };
    payload.payloadHash = buildPayloadHash(payload);

    const existing = existingByHour.get(hourStart);
    if (existing?.payloadHash === payload.payloadHash) continue;

    payloads.push({
      id: getHourDocId(userId, hourStart),
      model: HOUR_MODEL,
      data: payload,
      created_at: hourStart,
      updated_at: nowIso,
    });
  }

  if (!payloads.length) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(DOC_TABLE)
    .upsert(payloads, { onConflict: 'id' });

  if (error) {
    throw error;
  }
}

function sumMetric(byType, types, metric = 'count') {
  return (Array.isArray(types) ? types : []).reduce((acc, type) => {
    return acc + (Number(byType?.[type]?.[metric]) || 0);
  }, 0);
}

function buildBehaviorSummaryFromHourBuckets(buckets) {
  const byType = {};
  let totalRadiance = 0;
  let totalActions = 0;

  for (const bucket of buckets.values()) {
    totalRadiance = round3(totalRadiance + (Number(bucket.totalRadiance) || 0));
    totalActions += Number(bucket.totalCount) || 0;

    const stats = bucket.byType && typeof bucket.byType === 'object' ? bucket.byType : {};
    for (const [type, payload] of Object.entries(stats)) {
      const current = byType[type] || { count: 0, amount: 0, units: 0 };
      current.count += Number(payload?.count) || 0;
      current.amount = round3(current.amount + (Number(payload?.amount) || 0));
      current.units = round3(current.units + (Number(payload?.units) || 0));
      byType[type] = current;
    }
  }

  return {
    totalRadiance,
    totalActions,
    lightActions: sumMetric(byType, LIGHT_TYPES, 'count'),
    socialActions: sumMetric(byType, SOCIAL_TYPES, 'count'),
    practiceActions: sumMetric(byType, PRACTICE_TYPES, 'count'),
    newsLikes: Number(byType.news_like?.count) || 0,
    newsComments: Number(byType.news_comment?.count) || 0,
    newsReposts: Number(byType.news_repost?.count) || 0,
    treeHealLumens: Number(byType.tree_heal_button?.units) || 0,
    bridgeContribute: (Number(byType.bridge_contribute?.count) || 0) + (Number(byType.bridge_create?.count) || 0),
    evilRootSessions: Number(byType.evil_root_confession?.count) || 0,
    meditationEntries: (Number(byType.meditation_group?.count) || 0) + (Number(byType.meditation_individual?.count) || 0),
    nightShiftHours: (Number(byType.night_shift_hour?.units) || 0) + (Number(byType.night_shift?.count) || 0),
    shardCollect: Number(byType.shard_collect?.count) || 0,
    gratitudeWrites: Number(byType.gratitude_write?.count) || 0,
    feedbackLetters: Number(byType.feedback_letter?.count) || 0,
    friendAdds: Number(byType.friend_add?.count) || 0,
    chatRatings: Number(byType.chat_rate?.count) || 0,
    wishSupports: Number(byType.wish_support?.count) || 0,
    shopUses: Number(byType.shop_use_item?.count) || 0,
    byType: buildHourStatsPayload(byType),
  };
}

function computeCorePercent(summary) {
  const fLight = clamp01((summary.lightActions || 0) / 5);
  const fSocial = clamp01((summary.socialActions || 0) / 2);
  const newsEngagementScore = ((summary.newsLikes || 0) * 2) + ((summary.newsComments || 0) * 3) + ((summary.newsReposts || 0) * 5);
  const fNews = clamp01(newsEngagementScore / 8);
  const fPractice = clamp01((summary.practiceActions || 0) / 2);

  const avg = (fLight + fSocial + fNews + fPractice) / 4;
  return Math.round(avg * 100);
}

function countAdditionalMet(summary) {
  const metCare = (summary.treeHealLumens || 0) >= 50
    || (summary.bridgeContribute || 0) >= 1
    || (summary.gratitudeWrites || 0) >= 1
    || (summary.shopUses || 0) >= 1;
  const metExpression = (summary.newsComments || 0) >= 1
    || (summary.newsReposts || 0) >= 1
    || (summary.feedbackLetters || 0) >= 1;
  const metPractice = (summary.meditationEntries || 0) >= 1
    || (summary.nightShiftHours || 0) >= 1
    || (summary.shardCollect || 0) >= 1;
  const metShadow = (summary.evilRootSessions || 0) >= 1;
  const metBond = (summary.chatRatings || 0) >= 1
    || (summary.friendAdds || 0) >= 1
    || (summary.wishSupports || 0) >= 1;

  return [metCare, metExpression, metPractice, metShadow, metBond].filter(Boolean).length;
}

function computeMoodByRules({ corePercent, additionalMet, confirmedCount, activeDebuff }) {
  if (activeDebuff) return 'sad';
  if ((Number(confirmedCount) || 0) >= 5) return 'sad';
  if ((Number(corePercent) || 0) < 40) return 'sad';

  const noNegForHappy = (Number(confirmedCount) || 0) < 3 && !activeDebuff;
  if ((Number(corePercent) || 0) >= 100 && (Number(additionalMet) || 0) >= 2 && noNegForHappy) return 'happy';

  if ((Number(corePercent) || 0) >= 60) return 'neutral';
  return 'sad';
}

async function saveMoodSnapshot({ userId, snapshot }) {
  const supabase = getSupabaseClient();
  const id = getSnapshotDocId(userId);
  const nowIso = new Date().toISOString();
  const payload = {
    user: String(userId),
    mood: String(snapshot.mood || 'neutral'),
    rawMood: String(snapshot.rawMood || snapshot.mood || 'neutral'),
    corePercent: Math.max(0, Number(snapshot.corePercent) || 0),
    additionalMet: Math.max(0, Number(snapshot.additionalMet) || 0),
    confirmedCount: Math.max(0, Number(snapshot.confirmedCount) || 0),
    activeDebuff: Boolean(snapshot.activeDebuff),
    isSated: Boolean(snapshot.isSated),
    summary: stableSortObject(snapshot.summary || {}),
    refreshedAt: String(snapshot.refreshedAt || nowIso),
  };
  payload.payloadHash = buildPayloadHash(payload);

  const { error } = await supabase
    .from(DOC_TABLE)
    .upsert([{
      id,
      model: SNAPSHOT_MODEL,
      data: payload,
      created_at: nowIso,
      updated_at: nowIso,
    }], { onConflict: 'id' });
  if (error) {
    throw error;
  }
  return payload;
}

function isSnapshotFresh(snapshot, nowMs = Date.now(), maxAgeMs = ENTITY_MOOD_REFRESH_MAX_AGE_MS) {
  const refreshedAt = snapshot?.refreshedAt ? new Date(snapshot.refreshedAt).getTime() : 0;
  if (!refreshedAt) return false;
  return (nowMs - refreshedAt) < maxAgeMs;
}

async function rebuildMoodSnapshotForUser(userId) {
  const entityRow = await getEntityRowByUserId(userId);
  if (!entityRow) {
    return null;
  }

  const now = new Date();
  const since = getSevenDaysAgo(now);

  const [radianceRows, userDebuff, confirmedCount] = await Promise.all([
    listRadianceEarningsForUser({ userId, since, until: now }),
    getUserDebuffRow(userId),
    countAppealsByUser(userId, since),
  ]);

  const buckets = buildHourBucketsFromRadiance(radianceRows);
  await upsertMoodHourDocs(userId, buckets, since);

  const summary = buildBehaviorSummaryFromHourBuckets(buckets);
  const activeDebuff = Boolean(
    userDebuff?.debuffActiveUntil
    && new Date(userDebuff.debuffActiveUntil).getTime() > now.getTime()
    && (Number(userDebuff?.debuffPercent) || 0) > 0
  );
  const corePercent = computeCorePercent(summary);
  const additionalMet = countAdditionalMet(summary);
  const rawMood = computeMoodByRules({ corePercent, additionalMet, confirmedCount, activeDebuff });
  const sated = isSated({ satietyUntil: entityRow.satiety_until }, now);
  const mood = rawMood === 'happy' && !sated ? 'neutral' : rawMood;

  if (entityRow.mood !== mood) {
    await updateEntityMoodById(entityRow.id, mood).catch(() => null);
  }

  const snapshot = {
    mood,
    rawMood,
    corePercent,
    additionalMet,
    confirmedCount,
    activeDebuff,
    isSated: sated,
    summary,
    refreshedAt: now.toISOString(),
  };

  await saveMoodSnapshot({ userId, snapshot });
  return snapshot;
}

async function ensureFreshMoodSnapshotForUser(userId, options = {}) {
  if (!userId) return null;

  const allowCached = Boolean(options.allowCached);
  const force = Boolean(options.force);
  const cacheKey = getMoodCacheKey(userId);
  if (!cacheKey) return null;

  if (allowCached && !force) {
    const cached = getCachedEntityMood(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  if (!force) {
    const existing = await getSnapshotDocByUserId(userId).catch(() => null);
    if (existing && isSnapshotFresh(existing)) {
      return setCachedEntityMood(cacheKey, existing);
    }
  }

  const inflight = entityMoodInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const promise = rebuildMoodSnapshotForUser(userId)
    .then((snapshot) => setCachedEntityMood(cacheKey, snapshot))
    .finally(() => {
      entityMoodInflight.delete(cacheKey);
    });

  entityMoodInflight.set(cacheKey, promise);
  return promise;
}

async function updateEntityMoodForUser(userId, options = {}) {
  const snapshot = await ensureFreshMoodSnapshotForUser(userId, {
    allowCached: Boolean(options.allowCached),
    force: !Boolean(options.allowCached),
  });
  if (!snapshot) return null;
  return {
    mood: snapshot.mood,
    confirmedCount: snapshot.confirmedCount,
    corePercent: snapshot.corePercent,
    additionalMet: snapshot.additionalMet,
    activeDebuff: snapshot.activeDebuff,
    isSated: snapshot.isSated,
  };
}

async function getMoodDiagnosticsForUser(userId) {
  const snapshot = await ensureFreshMoodSnapshotForUser(userId, { allowCached: true });
  if (!snapshot) return null;
  return {
    mood: snapshot.mood,
    rawMood: snapshot.rawMood,
    corePercent: snapshot.corePercent,
    additionalMet: snapshot.additionalMet,
    confirmedCount: snapshot.confirmedCount,
    activeDebuff: snapshot.activeDebuff,
    isSated: snapshot.isSated,
  };
}

async function listOnlineUserIds() {
  const supabase = getSupabaseClient();
  const out = new Set();
  const cutoffIso = new Date(Date.now() - ENTITY_MOOD_ONLINE_LOOKBACK_MS).toISOString();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('user_sessions')
      .select('user_id,last_seen_at')
      .eq('is_active', true)
      .gte('last_seen_at', cutoffIso)
      .order('last_seen_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error || !Array.isArray(data) || data.length === 0) break;
    for (const row of data) {
      const userId = String(row?.user_id || '').trim();
      if (userId) out.add(userId);
    }
    if (data.length < pageSize) break;
    from += data.length;
  }

  return Array.from(out);
}

async function processOnlineEntityMoodRefresh() {
  const userIds = await listOnlineUserIds();
  let processed = 0;
  let failed = 0;

  for (const userId of userIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await ensureFreshMoodSnapshotForUser(userId, { force: true });
      processed += 1;
    } catch (_error) {
      failed += 1;
    }
  }

  return {
    total: userIds.length,
    processed,
    failed,
  };
}

module.exports = {
  updateEntityMoodForUser,
  invalidateEntityMoodCache,
  getMoodDiagnosticsForUser,
  ensureFreshMoodSnapshotForUser,
  processOnlineEntityMoodRefresh,
  computeCorePercent,
  countAdditionalMet,
  computeMoodByRules,
};
