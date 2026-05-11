const { getSupabaseClient } = require('../lib/supabaseClient');
const {
  getPreviousDayRangeUtc,
  buildQualificationSummaries,
  buildDailyActiveDecision,
  upsertDailyActivityReport,
} = require('./activityQualificationService');

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,status,email_confirmed,data')
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

function normalizeUser(row) {
  const data = getUserData(row);
  return {
    id: String(row?.id || '').trim(),
    status: String(data.status || row?.status || ''),
    emailConfirmed: Boolean(data.emailConfirmed ?? row?.email_confirmed),
    data,
  };
}

async function writeDailyDecision({ userId, range, decision }) {
  const checkedAt = new Date();
  await updateUserDataById(userId, {
    quietWatchPassed: Boolean(decision.passed),
    quietWatchCheckedAt: checkedAt.toISOString(),
    quietWatchDayKey: range.key,
    quietWatchReason: decision.reason,
    quietWatchSummary: decision.summary || {},
  });
  await upsertDailyActivityReport({
    userId,
    dayKey: range.key,
    range,
    decision,
  }).catch(() => null);
}

async function evaluateUserQuietWatch(userId, { range = null } = {}) {
  const row = await getUserRowById(userId);
  if (!row) return { ok: false, passed: false, reason: 'user missing' };

  const user = normalizeUser(row);
  if (user.status !== 'active' || !user.emailConfirmed) {
    const decision = {
      passed: false,
      reason: 'аккаунт не активен',
      summary: {},
    };
    return { ok: true, ...decision };
  }

  const safeRange = range || getPreviousDayRangeUtc(new Date());
  const summaries = await buildQualificationSummaries([user.id], safeRange);
  const decision = buildDailyActiveDecision(summaries.get(user.id) || {});
  await writeDailyDecision({ userId: user.id, range: safeRange, decision });
  return { ok: true, ...decision };
}

async function runUsersQuietWatch({ limit = 5000, range = null, shouldStop = null } = {}) {
  const safeRange = range || getPreviousDayRangeUtc(new Date());
  const safeLimit = Math.max(1, Number(limit) || 5000);
  const supabase = getSupabaseClient();
  const pageSize = 500;
  let from = 0;
  const picked = [];

  while (picked.length < safeLimit) {
    if (typeof shouldStop === 'function') {
      // eslint-disable-next-line no-await-in-loop
      const stop = await shouldStop();
      if (stop) break;
    }

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('users')
      .select('id,status,email_confirmed,data')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    for (const row of data) {
      if (picked.length >= safeLimit) break;
      const user = normalizeUser(row);
      if (!user.id) continue;
      if (user.status !== 'active') continue;
      if (!user.emailConfirmed) continue;
      if (user.data.quietWatchDayKey === safeRange.key) continue;
      picked.push(user);
    }

    if (data.length < pageSize) break;
    from += data.length;
  }

  if (!picked.length) return 0;

  const userIds = picked.map((user) => user.id);
  const summaries = await buildQualificationSummaries(userIds, safeRange);

  let updated = 0;
  for (const user of picked) {
    if (typeof shouldStop === 'function') {
      // eslint-disable-next-line no-await-in-loop
      const stop = await shouldStop();
      if (stop) break;
    }

    const decision = buildDailyActiveDecision(summaries.get(user.id) || {});
    // eslint-disable-next-line no-await-in-loop
    await writeDailyDecision({ userId: user.id, range: safeRange, decision });
    updated += 1;
  }

  return updated;
}

module.exports = {
  evaluateUserQuietWatch,
  runUsersQuietWatch,
};
