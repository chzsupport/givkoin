const { getSupabaseClient } = require('../lib/supabaseClient');
const {
  REFERRAL_WINDOW_DAYS,
  getLastDaysRangeUtc,
  getPreviousMonthRangeUtc,
  buildQualificationSummaries,
  buildEntityPresenceMap,
  buildReferralThirtyDayDecision,
  listDailyActivityReports,
  combineDailyReports,
} = require('./activityQualificationService');

const MONTHLY_TARGET = 300;
const MONTHLY_BONUS_K = 2000;
const MONTHLY_TOP_BONUS_K = 5000;

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

async function getUserForReferral(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,status,email_confirmed,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error || !data) return null;
  const json = getUserData(data);
  return {
    id: data.id,
    email: data.email,
    nickname: data.nickname,
    status: String(json.status || data.status || ''),
    emailConfirmed: Boolean(json.emailConfirmed ?? data.email_confirmed),
    entity: json.entity || json.entityId || null,
  };
}

async function getUsersForReferral(userIds) {
  const ids = Array.from(new Set((Array.isArray(userIds) ? userIds : [])
    .map(normalizeId)
    .filter(Boolean)));
  if (!ids.length) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,status,email_confirmed,data')
    .in('id', ids);
  if (error || !Array.isArray(data)) return [];

  return data.map((row) => {
    const json = getUserData(row);
    return {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      status: String(json.status || row.status || ''),
      emailConfirmed: Boolean(json.emailConfirmed ?? row.email_confirmed),
      entity: json.entity || json.entityId || null,
    };
  });
}

async function updateReferralById(referralId, patch) {
  if (!referralId || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('referrals')
    .update({
      ...patch,
      updated_at: nowIso,
    })
    .eq('id', Number(referralId))
    .select('*')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getReferralById(referralId) {
  if (!referralId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('id', Number(referralId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function transactionExists({ userId, type, direction, currency, description, occurredSince = null }) {
  const supabase = getSupabaseClient();
  let q = supabase
    .from('transactions')
    .select('id', { head: true, count: 'exact' })
    .eq('type', String(type))
    .eq('direction', String(direction))
    .eq('currency', String(currency || 'K'))
    .eq('description', String(description));
  if (userId) q = q.eq('user_id', String(userId));
  if (occurredSince) q = q.gte('occurred_at', new Date(occurredSince).toISOString());
  const { count, error } = await q;
  if (error) return false;
  return (Number(count) || 0) > 0;
}

function inactiveDecision(reason, summary = {}) {
  return {
    status: 'inactive',
    checkReason: reason,
    checkedAt: new Date(),
    activitySummary: summary || {},
    shouldActivate: false,
  };
}

function buildReferralDecision({ invitee, summary, hasEntity }) {
  if (!invitee) return inactiveDecision('реферал не найден');
  if (invitee.status !== 'active' || !invitee.emailConfirmed) {
    return inactiveDecision('аккаунт реферала не активен', summary);
  }

  const decision = buildReferralThirtyDayDecision(summary || {}, { hasEntity });
  return {
    status: decision.status,
    checkReason: decision.reason,
    checkedAt: new Date(),
    activitySummary: decision.summary,
    shouldActivate: decision.passed,
  };
}

async function buildReferralSummaries(inviteeIds, range) {
  const ids = Array.from(new Set((Array.isArray(inviteeIds) ? inviteeIds : [])
    .map(normalizeId)
    .filter(Boolean)));
  if (!ids.length) return new Map();

  const [reports, rawSummaries] = await Promise.all([
    listDailyActivityReports(ids, range).catch(() => []),
    buildQualificationSummaries(ids, range).catch(() => new Map()),
  ]);
  const reportSummaries = combineDailyReports(ids, reports);
  const out = new Map();

  ids.forEach((id) => {
    const fromReports = reportSummaries.get(id) || {};
    const fromRaw = rawSummaries.get(id) || {};
    out.set(id, {
      ...fromRaw,
      ...fromReports,
      visitDays: Math.max(Number(fromReports.visitDays) || 0, Number(fromRaw.visitDays) || 0),
      minutesTotal: Math.max(Number(fromReports.minutesTotal) || 0, Number(fromRaw.minutesTotal) || 0),
      pagesVisited: Math.max(Number(fromReports.pagesVisited) || 0, Number(fromRaw.pagesVisited) || 0),
      kDebitActions: Math.max(Number(fromReports.kDebitActions) || 0, Number(fromRaw.kDebitActions) || 0),
      kCreditActions: Math.max(Number(fromReports.kCreditActions) || 0, Number(fromRaw.kCreditActions) || 0),
      kActionCount: Math.max(Number(fromReports.kActionCount) || 0, Number(fromRaw.kActionCount) || 0),
      battleParticipations: Math.max(Number(fromReports.battleParticipations) || 0, Number(fromRaw.battleParticipations) || 0),
      bigBattleRewards: Math.max(Number(fromReports.bigBattleRewards) || 0, Number(fromRaw.bigBattleRewards) || 0),
      newsViews: Math.max(Number(fromReports.newsViews) || 0, Number(fromRaw.newsViews) || 0),
      radianceActions: Math.max(Number(fromReports.radianceActions) || 0, Number(fromRaw.radianceActions) || 0),
    });
  });

  return out;
}

async function applyReferralActivationSideEffects(referral, prevStatus) {
  if (prevStatus === 'active') return;

  try {
    const { grantAchievement } = require('./achievementService');
    const { creditK } = require('./kService');

    const supabase = getSupabaseClient();
    const inviterId = normalizeId(referral.inviter);
    if (!inviterId) return;

    const { count: activeCountRaw } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', inviterId)
      .eq('status', 'active');
    const activeCount = Math.max(0, Number(activeCountRaw) || 0);
    if (activeCount >= 50) {
      await grantAchievement({ userId: inviterId, achievementId: 97 });
    }

    const since30d = new Date(Date.now() - REFERRAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const { count: last30ActiveCountRaw } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', inviterId)
      .eq('status', 'active')
      .gte('checked_at', since30d.toISOString());
    const last30ActiveCount = Math.max(0, Number(last30ActiveCountRaw) || 0);
    if (last30ActiveCount === MONTHLY_TARGET) {
      const alreadyMonthlyBonus = await transactionExists({
        userId: inviterId,
        type: 'referral',
        direction: 'credit',
        currency: 'K',
        description: 'Бонус за 300 активных рефералов за 30 дней',
        occurredSince: since30d,
      });
      if (!alreadyMonthlyBonus) {
        await creditK({
          userId: inviterId,
          amount: MONTHLY_BONUS_K,
          type: 'referral',
          description: 'Бонус за 300 активных рефералов за 30 дней',
          relatedEntity: String(referral.id || ''),
        });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Referral achievements error', err);
  }
}

async function evaluateReferral(referral) {
  const referralId = typeof referral === 'string' || typeof referral === 'number'
    ? referral
    : (referral?.id ?? referral?._id);
  const referralRow = referral && typeof referral === 'object' && referral.inviter_id
    ? referral
    : await getReferralById(referralId);
  if (!referralRow) return null;

  const prevStatus = referralRow?.status;
  const invitee = await getUserForReferral(referralRow.invitee_id);
  const range = getLastDaysRangeUtc(REFERRAL_WINDOW_DAYS, new Date());
  const inviteeId = normalizeId(referralRow.invitee_id);
  const [summaries, entityPresence] = await Promise.all([
    buildReferralSummaries([inviteeId], range),
    buildEntityPresenceMap([inviteeId]),
  ]);

  const decision = buildReferralDecision({
    invitee,
    summary: summaries.get(inviteeId) || {},
    hasEntity: Boolean(entityPresence.get(inviteeId) || invitee?.entity),
  });

  const patch = {
    activity_summary: decision.activitySummary,
    checked_at: decision.checkedAt.toISOString(),
    status: decision.status,
    check_reason: decision.checkReason,
  };
  if (decision.shouldActivate && !referralRow.active_since) {
    patch.active_since = new Date().toISOString();
  }

  const updated = await updateReferralById(referralRow.id, patch);
  if (decision.shouldActivate) {
    await applyReferralActivationSideEffects({
      id: referralRow.id,
      inviter: referralRow.inviter_id,
      invitee: referralRow.invitee_id,
    }, prevStatus);
  }
  return updated;
}

async function runQuietWatch({ limit = 5000, range = null, shouldStop = null } = {}) {
  const safeLimit = Math.max(1, Number(limit) || 5000);
  const safeRange = range || getLastDaysRangeUtc(REFERRAL_WINDOW_DAYS, new Date());
  const checkedThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
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
      .from('referrals')
      .select('id,inviter_id,invitee_id,status,active_since,created_at,confirmed_at,checked_at,bonus_granted')
      .not('confirmed_at', 'is', null)
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    for (const row of data) {
      if (picked.length >= safeLimit) break;
      if (row?.checked_at) {
        const checkedAt = new Date(row.checked_at);
        if (!Number.isNaN(checkedAt.getTime()) && checkedAt > checkedThreshold) continue;
      }
      picked.push(row);
    }

    if (data.length < pageSize) break;
    from += data.length;
  }

  if (!picked.length) return 0;

  const inviteeIds = Array.from(new Set(picked.map((row) => normalizeId(row.invitee_id)).filter(Boolean)));
  const [invitees, summaries, entityPresence] = await Promise.all([
    getUsersForReferral(inviteeIds),
    buildReferralSummaries(inviteeIds, safeRange),
    buildEntityPresenceMap(inviteeIds),
  ]);

  const inviteesById = new Map(invitees.map((row) => [normalizeId(row.id), row]));
  let updatedCount = 0;

  for (const ref of picked) {
    if (typeof shouldStop === 'function') {
      // eslint-disable-next-line no-await-in-loop
      const stop = await shouldStop();
      if (stop) break;
    }

    const inviteeId = normalizeId(ref.invitee_id);
    const invitee = inviteesById.get(inviteeId) || null;
    const decision = buildReferralDecision({
      invitee,
      summary: summaries.get(inviteeId) || {},
      hasEntity: Boolean(entityPresence.get(inviteeId) || invitee?.entity),
    });

    if (decision.shouldActivate) {
      // eslint-disable-next-line no-await-in-loop
      await applyReferralActivationSideEffects({
        id: ref.id,
        inviter: ref.inviter_id,
        invitee: ref.invitee_id,
      }, ref.status);
    }

    // eslint-disable-next-line no-await-in-loop
    await updateReferralById(ref.id, {
      activity_summary: decision.activitySummary,
      checked_at: decision.checkedAt.toISOString(),
      status: decision.status,
      check_reason: decision.checkReason,
      ...(decision.shouldActivate && !ref.active_since
        ? { active_since: new Date().toISOString() }
        : {}),
    });
    updatedCount += 1;
  }

  return updatedCount;
}

async function awardMonthlyTopReferrer() {
  const { start, end, key } = getPreviousMonthRangeUtc(new Date());
  const supabase = getSupabaseClient();
  const pageSize = 500;
  let from = 0;
  const referrals = [];

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('referrals')
      .select('id,inviter_id,invitee_id,confirmed_at')
      .not('confirmed_at', 'is', null)
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;
    referrals.push(...data);
    if (data.length < pageSize) break;
    from += data.length;
  }

  if (!referrals.length) return null;

  const inviteeIds = Array.from(new Set(referrals.map((row) => normalizeId(row.invitee_id)).filter(Boolean)));
  const [invitees, summaries, entityPresence] = await Promise.all([
    getUsersForReferral(inviteeIds),
    buildReferralSummaries(inviteeIds, { start, end }),
    buildEntityPresenceMap(inviteeIds),
  ]);
  const inviteesById = new Map(invitees.map((row) => [normalizeId(row.id), row]));

  const inviterCounts = new Map();
  referrals.forEach((ref) => {
    const inviteeId = normalizeId(ref.invitee_id);
    const invitee = inviteesById.get(inviteeId) || null;
    const decision = buildReferralDecision({
      invitee,
      summary: summaries.get(inviteeId) || {},
      hasEntity: Boolean(entityPresence.get(inviteeId) || invitee?.entity),
    });
    if (!decision.shouldActivate) return;
    const inviterId = normalizeId(ref.inviter_id);
    if (!inviterId) return;
    inviterCounts.set(inviterId, (inviterCounts.get(inviterId) || 0) + 1);
  });

  let winnerUserId = null;
  let winnerActive = 0;
  Array.from(inviterCounts.entries()).forEach(([inviterId, count]) => {
    const c = Number(count) || 0;
    if (c > winnerActive) {
      winnerUserId = inviterId;
      winnerActive = c;
    } else if (c === winnerActive && winnerUserId && inviterId < winnerUserId) {
      winnerUserId = inviterId;
    }
  });

  if (!winnerUserId || !winnerActive) return null;

  const description = `Бонус: самые активные рефералы месяца (${key})`;
  const alreadyAwarded = await transactionExists({
    type: 'referral',
    direction: 'credit',
    currency: 'K',
    description,
  });

  if (alreadyAwarded) return { awarded: false, key, userId: winnerUserId, activeReferrals: winnerActive };

  const { creditK } = require('./kService');
  await creditK({
    userId: winnerUserId,
    amount: MONTHLY_TOP_BONUS_K,
    type: 'referral',
    description,
  });

  return { awarded: true, key, userId: winnerUserId, activeReferrals: winnerActive };
}

module.exports = { runQuietWatch, evaluateReferral, awardMonthlyTopReferrer };
