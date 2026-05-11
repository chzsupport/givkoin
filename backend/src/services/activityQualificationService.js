const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const DAY_ACTIVE_MINUTES = 5;
const DAY_ACTIVE_K_ACTIONS = 5;
const DAY_ACTIVE_PAGES = 3;

const REFERRAL_WINDOW_DAYS = 30;
const REFERRAL_MIN_VISIT_DAYS = 15;
const REFERRAL_MIN_K_DEBITS = 30;
const REFERRAL_MIN_K_CREDITS = 60;
const REFERRAL_MIN_BATTLES = 3;
const REFERRAL_MIN_BIG_BATTLE_REWARDS = 1;
const REFERRAL_MIN_NEWS_VIEWS = 15;

const PAGE_SIZE = 1000;
const USER_CHUNK_SIZE = 100;

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function uniqueIds(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(normalizeId).filter(Boolean)));
}

function toDate(value, fallback = new Date()) {
  const d = value instanceof Date ? value : new Date(value || fallback);
  return Number.isNaN(d.getTime()) ? new Date(fallback) : d;
}

function getUtcDayKey(value = new Date()) {
  return toDate(value).toISOString().slice(0, 10);
}

function getDayRangeUtc(value = new Date()) {
  const d = toDate(value);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, key: getUtcDayKey(start) };
}

function getPreviousDayRangeUtc(now = new Date()) {
  const today = getDayRangeUtc(now).start;
  const start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const end = today;
  return { start, end, key: getUtcDayKey(start) };
}

function getLastDaysRangeUtc(days = REFERRAL_WINDOW_DAYS, now = new Date()) {
  const end = toDate(now);
  const start = new Date(end.getTime() - Math.max(1, Number(days) || REFERRAL_WINDOW_DAYS) * 24 * 60 * 60 * 1000);
  return { start, end };
}

function getPreviousMonthRangeUtc(now = new Date()) {
  const d = toDate(now);
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1, 0, 0, 0, 0));
  return { start, end, key: getUtcDayKey(start).slice(0, 7) };
}

function createAccumulator() {
  return {
    daySet: new Set(),
    pageSet: new Set(),
    minutesTotal: 0,
    kDebitActions: 0,
    kCreditActions: 0,
    battleSet: new Set(),
    battleRows: 0,
    bigBattleRewards: 0,
    newsViewSet: new Set(),
    newsViewRows: 0,
    radianceActions: 0,
  };
}

function getAccumulator(map, userId) {
  const id = normalizeId(userId);
  if (!id) return null;
  if (!map.has(id)) map.set(id, createAccumulator());
  return map.get(id);
}

function addVisitDay(acc, createdAt) {
  const key = getUtcDayKey(createdAt);
  if (key) acc.daySet.add(key);
}

function addMinutes(acc, value) {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) {
    acc.minutesTotal += n;
  }
}

function appendActivity(acc, row) {
  if (!acc || !row) return;
  const createdAt = row.created_at || row.createdAt || new Date();
  addVisitDay(acc, createdAt);
  addMinutes(acc, Number(row.minutes) || 0);

  const type = String(row.type || '').trim();
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};

  if (type === 'page_view') {
    const path = normalizeId(meta.path);
    if (path) acc.pageSet.add(path);
  }

  if (type === 'news_view') {
    const postId = normalizeId(meta.postId || meta.post || meta.id);
    if (postId) acc.newsViewSet.add(postId);
    else acc.newsViewRows += 1;
  }

  if (type === 'battle_participation') {
    const battleId = normalizeId(meta.battleId || meta.battle || meta.id);
    if (battleId) acc.battleSet.add(battleId);
    else acc.battleRows += 1;
  }
}

function isDirectUserKTransaction(row) {
  const type = String(row?.type || '').toLowerCase();
  if (!type) return false;

  // Эти записи не являются действием самого юзера: они приходят как служебный бонус или откат.
  if (type.startsWith('referral')) return false;
  if (type.includes('compensation')) return false;
  if (type.includes('refund')) return false;
  if (type.includes('rollback')) return false;
  if (type.includes('admin')) return false;
  if (type.includes('security')) return false;

  return true;
}

function appendKTransaction(acc, row) {
  if (!acc || !row) return;
  if (String(row.currency || '').toUpperCase() !== 'K') return;
  if (String(row.status || 'completed') !== 'completed') return;
  if (!isDirectUserKTransaction(row)) return;

  const amount = Number(row.amount) || 0;
  if (!(amount > 0)) return;

  addVisitDay(acc, row.occurred_at || row.created_at || new Date());

  const direction = String(row.direction || '').toLowerCase();
  if (direction === 'debit') acc.kDebitActions += 1;
  if (direction === 'credit') acc.kCreditActions += 1;

  const type = String(row.type || '').toLowerCase();
  if (type === 'battle' && direction === 'credit') {
    const battleId = normalizeId(row.related_entity);
    if (battleId) acc.battleSet.add(battleId);
    else acc.battleRows += 1;
    if (amount > 100) acc.bigBattleRewards += 1;
  }
}

function appendAdSession(acc, row) {
  if (!acc || !row) return;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  if (String(data.eventType || '') !== 'session') return;
  const seconds = Number(data.durationSeconds) || 0;
  if (!(seconds > 0)) return;
  addVisitDay(acc, row.created_at || row.createdAt || new Date());
  addMinutes(acc, seconds / 60);
}

function appendRadiance(acc, row) {
  if (!acc || !row) return;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  const activityType = String(data.activityType || '').trim();
  if (!activityType || activityType.startsWith('referral_')) return;
  acc.radianceActions += 1;
}

function finalizeSummary(acc) {
  const target = acc || createAccumulator();
  const battleParticipations = target.battleSet.size || target.battleRows;
  const newsViews = target.newsViewSet.size || target.newsViewRows;
  const kDebitActions = Math.max(0, Number(target.kDebitActions) || 0);
  const kCreditActions = Math.max(0, Number(target.kCreditActions) || 0);
  return {
    visitDays: target.daySet.size,
    dayKeys: Array.from(target.daySet).sort(),
    minutesTotal: Math.round((Number(target.minutesTotal) || 0) * 100) / 100,
    pagesVisited: target.pageSet.size,
    pages: Array.from(target.pageSet).sort().slice(0, 100),
    kDebitActions,
    kCreditActions,
    kActionCount: kDebitActions + kCreditActions,
    battleParticipations,
    bigBattleRewards: Math.max(0, Number(target.bigBattleRewards) || 0),
    newsViews,
    radianceActions: Math.max(0, Number(target.radianceActions) || 0),
  };
}

async function readPaged(buildQuery, onRows) {
  let from = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error || !Array.isArray(data) || !data.length) break;
    onRows(data);
    if (data.length < PAGE_SIZE) break;
    from += data.length;
  }
}

async function appendActivityRows({ userIds, since, until, accumulators }) {
  const supabase = getSupabaseClient();
  const sinceIso = toDate(since).toISOString();
  const untilIso = toDate(until).toISOString();

  for (let i = 0; i < userIds.length; i += USER_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + USER_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await readPaged(
      (from, to) => supabase
        .from('activity_logs')
        .select('user_id,type,minutes,meta,created_at')
        .in('user_id', chunk)
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso)
        .range(from, to),
      (rows) => {
        rows.forEach((row) => appendActivity(getAccumulator(accumulators, row.user_id), row));
      }
    );
  }
}

async function appendTransactionRows({ userIds, since, until, accumulators }) {
  const supabase = getSupabaseClient();
  const sinceIso = toDate(since).toISOString();
  const untilIso = toDate(until).toISOString();

  for (let i = 0; i < userIds.length; i += USER_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + USER_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await readPaged(
      (from, to) => supabase
        .from('transactions')
        .select('user_id,type,direction,amount,currency,status,related_entity,occurred_at,created_at')
        .in('user_id', chunk)
        .eq('currency', 'K')
        .gte('occurred_at', sinceIso)
        .lt('occurred_at', untilIso)
        .range(from, to),
      (rows) => {
        rows.forEach((row) => appendKTransaction(getAccumulator(accumulators, row.user_id), row));
      }
    );
  }
}

async function appendAdSessionRows({ userIds, since, until, accumulators }) {
  const supabase = getSupabaseClient();
  const sinceIso = toDate(since).toISOString();
  const untilIso = toDate(until).toISOString();

  for (let i = 0; i < userIds.length; i += USER_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + USER_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await readPaged(
      (from, to) => supabase
        .from(DOC_TABLE)
        .select('id,data,created_at')
        .eq('model', 'AdImpression')
        .in('data->>userId', chunk)
        .eq('data->>eventType', 'session')
        .gte('created_at', sinceIso)
        .lt('created_at', untilIso)
        .range(from, to),
      (rows) => {
        rows.forEach((row) => {
          const userId = normalizeId(row?.data?.userId);
          appendAdSession(getAccumulator(accumulators, userId), row);
        });
      }
    );
  }
}

async function appendRadianceRows({ userIds, since, until, accumulators }) {
  const supabase = getSupabaseClient();
  const sinceIso = toDate(since).toISOString();
  const untilIso = toDate(until).toISOString();

  for (let i = 0; i < userIds.length; i += USER_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + USER_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await readPaged(
      (from, to) => supabase
        .from(DOC_TABLE)
        .select('id,data,created_at')
        .eq('model', 'RadianceEarning')
        .in('data->>user', chunk)
        .gte('data->>occurredAt', sinceIso)
        .lt('data->>occurredAt', untilIso)
        .range(from, to),
      (rows) => {
        rows.forEach((row) => {
          const userId = normalizeId(row?.data?.user);
          appendRadiance(getAccumulator(accumulators, userId), row);
        });
      }
    );
  }
}

async function buildQualificationSummaries(userIds, { since, until, start, end } = {}) {
  const ids = uniqueIds(userIds);
  const accumulators = new Map();
  ids.forEach((id) => accumulators.set(id, createAccumulator()));
  if (!ids.length) return new Map();

  const safeSince = since || start ? toDate(since || start) : getLastDaysRangeUtc().start;
  const safeUntil = until || end ? toDate(until || end) : new Date();

  await appendActivityRows({ userIds: ids, since: safeSince, until: safeUntil, accumulators });
  await appendTransactionRows({ userIds: ids, since: safeSince, until: safeUntil, accumulators });
  await appendAdSessionRows({ userIds: ids, since: safeSince, until: safeUntil, accumulators });
  await appendRadianceRows({ userIds: ids, since: safeSince, until: safeUntil, accumulators });

  const out = new Map();
  ids.forEach((id) => out.set(id, finalizeSummary(accumulators.get(id))));
  return out;
}

async function buildEntityPresenceMap(userIds) {
  const ids = uniqueIds(userIds);
  const out = new Map(ids.map((id) => [id, false]));
  if (!ids.length) return out;

  const supabase = getSupabaseClient();
  for (let i = 0; i < ids.length; i += USER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + USER_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('entities')
      .select('user_id')
      .in('user_id', chunk);
    if (error || !Array.isArray(data)) continue;
    data.forEach((row) => {
      const userId = normalizeId(row?.user_id);
      if (userId) out.set(userId, true);
    });
  }
  return out;
}

function buildDailyActiveDecision(summary = {}) {
  const failures = [];
  if ((Number(summary.minutesTotal) || 0) < DAY_ACTIVE_MINUTES) failures.push('меньше 5 минут на сайте');
  if ((Number(summary.kActionCount) || 0) < DAY_ACTIVE_K_ACTIONS) failures.push('меньше 5 действий с K');
  if ((Number(summary.pagesVisited) || 0) < DAY_ACTIVE_PAGES) failures.push('меньше 3 страниц');

  const passed = failures.length === 0;
  return {
    passed,
    reason: passed ? 'Активен за день' : failures.join('; '),
    summary,
  };
}

function buildReferralThirtyDayDecision(summary = {}, { hasEntity = false } = {}) {
  const failures = [];
  if ((Number(summary.visitDays) || 0) < REFERRAL_MIN_VISIT_DAYS) failures.push('меньше 15 дней посещений');
  if ((Number(summary.kDebitActions) || 0) < REFERRAL_MIN_K_DEBITS) failures.push('меньше 30 трат K');
  if ((Number(summary.kCreditActions) || 0) < REFERRAL_MIN_K_CREDITS) failures.push('меньше 60 заработков K');
  if (!hasEntity) failures.push('сущность не создана');
  if ((Number(summary.battleParticipations) || 0) < REFERRAL_MIN_BATTLES) failures.push('меньше 3 боёв');
  if ((Number(summary.bigBattleRewards) || 0) < REFERRAL_MIN_BIG_BATTLE_REWARDS) failures.push('нет боя с наградой больше 100 K');
  if ((Number(summary.newsViews) || 0) < REFERRAL_MIN_NEWS_VIEWS) failures.push('меньше 15 просмотренных постов');

  const passed = failures.length === 0;
  return {
    passed,
    status: passed ? 'active' : 'inactive',
    reason: passed ? 'Реферал активен за 30 дней' : failures.join('; '),
    summary: {
      ...summary,
      hasEntity: Boolean(hasEntity),
    },
  };
}

async function upsertDailyActivityReport({ userId, dayKey, range, decision }) {
  const safeUserId = normalizeId(userId);
  const safeDayKey = normalizeId(dayKey);
  if (!safeUserId || !safeDayKey || !decision) return null;

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const id = `daily_activity:${safeUserId}:${safeDayKey}`;
  const payload = {
    userId: safeUserId,
    dayKey: safeDayKey,
    passed: Boolean(decision.passed),
    reason: String(decision.reason || ''),
    summary: decision.summary || {},
    rangeStart: range?.start ? toDate(range.start).toISOString() : null,
    rangeEnd: range?.end ? toDate(range.end).toISOString() : null,
    updatedAt: nowIso,
  };

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .upsert({
      model: 'UserDailyActivityReport',
      id,
      data: payload,
      created_at: nowIso,
      updated_at: nowIso,
    }, {
      onConflict: 'model,id',
      ignoreDuplicates: false,
    })
    .select('id,data')
    .maybeSingle();

  if (error) return null;
  return data || null;
}

async function listDailyActivityReports(userIds, { since, until, start, end } = {}) {
  const ids = uniqueIds(userIds);
  if (!ids.length) return [];

  const sinceKey = getUtcDayKey(since || start || getLastDaysRangeUtc().start);
  const untilKey = getUtcDayKey(until || end || new Date());
  const supabase = getSupabaseClient();
  const out = [];

  for (let i = 0; i < ids.length; i += USER_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + USER_CHUNK_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await readPaged(
      (from, to) => supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', 'UserDailyActivityReport')
        .in('data->>userId', chunk)
        .gte('data->>dayKey', sinceKey)
        .lt('data->>dayKey', untilKey)
        .range(from, to),
      (rows) => out.push(...rows)
    );
  }

  return out.map((row) => row?.data || null).filter(Boolean);
}

function combineDailyReports(userIds, reports = []) {
  const ids = uniqueIds(userIds);
  const out = new Map(ids.map((id) => [id, createAccumulator()]));

  reports.forEach((report) => {
    const userId = normalizeId(report?.userId);
    const acc = out.get(userId);
    if (!acc) return;
    const summary = report?.summary && typeof report.summary === 'object' ? report.summary : {};
    if ((Number(summary.visitDays) || 0) > 0 && report.dayKey) acc.daySet.add(String(report.dayKey));
    addMinutes(acc, Number(summary.minutesTotal) || 0);
    acc.kDebitActions += Math.max(0, Number(summary.kDebitActions) || 0);
    acc.kCreditActions += Math.max(0, Number(summary.kCreditActions) || 0);
    acc.battleRows += Math.max(0, Number(summary.battleParticipations) || 0);
    acc.bigBattleRewards += Math.max(0, Number(summary.bigBattleRewards) || 0);
    acc.newsViewRows += Math.max(0, Number(summary.newsViews) || 0);
    acc.radianceActions += Math.max(0, Number(summary.radianceActions) || 0);
    if (Array.isArray(summary.pages)) {
      summary.pages.forEach((path) => {
        const safePath = normalizeId(path);
        if (safePath) acc.pageSet.add(safePath);
      });
    } else {
      for (let i = 0; i < Math.max(0, Number(summary.pagesVisited) || 0); i += 1) {
        acc.pageSet.add(`${report.dayKey || 'day'}:${i}`);
      }
    }
  });

  const finalized = new Map();
  ids.forEach((id) => finalized.set(id, finalizeSummary(out.get(id))));
  return finalized;
}

module.exports = {
  DAY_ACTIVE_MINUTES,
  DAY_ACTIVE_K_ACTIONS,
  DAY_ACTIVE_PAGES,
  REFERRAL_WINDOW_DAYS,
  REFERRAL_MIN_VISIT_DAYS,
  REFERRAL_MIN_K_DEBITS,
  REFERRAL_MIN_K_CREDITS,
  REFERRAL_MIN_BATTLES,
  REFERRAL_MIN_BIG_BATTLE_REWARDS,
  REFERRAL_MIN_NEWS_VIEWS,
  getDayRangeUtc,
  getPreviousDayRangeUtc,
  getLastDaysRangeUtc,
  getPreviousMonthRangeUtc,
  buildQualificationSummaries,
  buildEntityPresenceMap,
  buildDailyActiveDecision,
  buildReferralThirtyDayDecision,
  upsertDailyActivityReport,
  listDailyActivityReports,
  combineDailyReports,
  finalizeSummary,
};
