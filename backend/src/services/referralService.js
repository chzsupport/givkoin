const { getSupabaseClient } = require('../lib/supabaseClient');

const HOURS_TO_CHECK = 72;
const TND_ACTIVITY_WINDOW_HOURS = 72;
const DAYS_WINDOW = 30;
const MIN_MINUTES = 15;
const MIN_SOLAR = 1;
const MIN_SEARCH = 1;
const MIN_BRIDGE_STONES = 3;
const MONTHLY_TARGET = 300;
const MONTHLY_BONUS_K = 2000;
const MONTHLY_TOP_BONUS_K = 5000;

async function getUserForReferral(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error || !data) return null;
  const json = data.data && typeof data.data === 'object' ? data.data : {};
  return {
    id: data.id,
    email: data.email,
    nickname: data.nickname,
    entity: json.entity || json.entityId || null,
  };
}

async function getUsersForReferral(userIds, { selectEntity = false } = {}) {
  const ids = (Array.isArray(userIds) ? userIds : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  if (!ids.length) return [];

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select(selectEntity ? 'id,email,nickname,data' : 'id,email,nickname')
    .in('id', ids);
  if (error || !Array.isArray(data)) return [];

  return data.map((row) => {
    const json = row.data && typeof row.data === 'object' ? row.data : {};
    return {
      id: row.id,
      email: row.email,
      nickname: row.nickname,
      entity: selectEntity ? (json.entity || json.entityId || null) : undefined,
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
  if (occurredSince) {
    const sinceIso = occurredSince instanceof Date ? occurredSince.toISOString() : new Date(occurredSince).toISOString();
    q = q.gte('occurred_at', sinceIso);
  }
  const { count, error } = await q;
  if (error) return false;
  return (Number(count) || 0) > 0;
}

function createActivityAccumulator() {
  return {
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
  const minutes = Math.max(0, Number(log?.minutes || 0));
  target.minutesTotal += minutes;
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
    minutesTotal: target.minutesTotal,
    solarCollects: target.solarCollects,
    battleCount: target.battleCount,
    searchCount: target.searchCount,
    bridgeStones: target.bridgeStones,
    pagesVisited: target.pageSet.size,
  };
}

function getMonthKey(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getPreviousMonthRangeUtc(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startOfThisMonthUtc = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const startOfPrevMonthUtc = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  return {
    start: startOfPrevMonthUtc,
    end: startOfThisMonthUtc,
    key: getMonthKey(startOfPrevMonthUtc),
  };
}

async function awardMonthlyTopReferrer() {
  const { start, end, key } = getPreviousMonthRangeUtc(new Date());

  const supabase = getSupabaseClient();
  const startIso = start.toISOString();
  const endIso = end.toISOString();

  const inviterCounts = new Map();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('referrals')
      .select('inviter_id')
      .eq('status', 'active')
      .gte('active_since', startIso)
      .lt('active_since', endIso)
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;
    data.forEach((row) => {
      const inviterId = String(row?.inviter_id || '').trim();
      if (!inviterId) return;
      inviterCounts.set(inviterId, (inviterCounts.get(inviterId) || 0) + 1);
    });
    if (data.length < pageSize) break;
    from += pageSize;
  }

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

  const description = `Бонус: самый активный пользователь месяца (${key})`;
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

function normalizeIdentityString(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

function getEmailLocalPart(email) {
  const e = String(email || '').toLowerCase();
  const at = e.indexOf('@');
  return at > 0 ? e.slice(0, at) : e;
}

function areSimilarStrings(a, b) {
  const x = normalizeIdentityString(a);
  const y = normalizeIdentityString(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const minLen = Math.min(x.length, y.length);
  const prefixLen = (() => {
    let i = 0;
    for (; i < minLen; i += 1) {
      if (x[i] !== y[i]) break;
    }
    return i;
  })();
  if (prefixLen >= 6) return true;
  if (x.length >= 8 && y.includes(x)) return true;
  if (y.length >= 8 && x.includes(y)) return true;
  return false;
}

function summarizeActivity(logs = []) {
  const acc = createActivityAccumulator();
  logs.forEach((log) => appendActivityToAccumulator(acc, log));
  return finalizeActivityAccumulator(acc);
}

async function buildReferralActivitySummaries(inviteeIds, since) {
  const safeInviteeIds = (Array.isArray(inviteeIds) ? inviteeIds : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const allowedIds = new Set(safeInviteeIds);
  const accumulators = new Map();

  const supabase = getSupabaseClient();
  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const chunkSize = 100;
  for (let i = 0; i < safeInviteeIds.length; i += chunkSize) {
    const chunk = safeInviteeIds.slice(i, i + chunkSize);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('activity_logs')
      .select('user_id,type,minutes,meta,created_at')
      .in('user_id', chunk)
      .gte('created_at', sinceIso);
    if (error || !Array.isArray(data)) continue;
    data.forEach((row) => {
      const userId = String(row?.user_id || '').trim();
      if (!allowedIds.has(userId)) return;
      if (!accumulators.has(userId)) accumulators.set(userId, createActivityAccumulator());
      appendActivityToAccumulator(accumulators.get(userId), {
        user: row.user_id,
        type: row.type,
        minutes: row.minutes,
        meta: row.meta,
        createdAt: row.created_at ? new Date(row.created_at) : undefined,
      });
    });
  }

  const summaries = new Map();
  safeInviteeIds.forEach((userId) => {
    summaries.set(userId, finalizeActivityAccumulator(accumulators.get(userId)));
  });
  return summaries;
}

async function buildReferralDuplicateCounters() {
  const counters = {
    inviteeIp: new Map(),
    inviteeFingerprint: new Map(),
  };
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  let from = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('referrals')
      .select('invitee_ip,invitee_fingerprint')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;
    data.forEach((row) => {
      const inviteeIp = String(row?.invitee_ip || '').trim();
      const inviteeFingerprint = String(row?.invitee_fingerprint || '').trim();
      if (inviteeIp) counters.inviteeIp.set(inviteeIp, (counters.inviteeIp.get(inviteeIp) || 0) + 1);
      if (inviteeFingerprint) {
        counters.inviteeFingerprint.set(
          inviteeFingerprint,
          (counters.inviteeFingerprint.get(inviteeFingerprint) || 0) + 1
        );
      }
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

function buildReferralDecision({ invitee, inviter, summary, duplicateIp = 0, duplicateFp = 0, checkedAt = new Date() }) {
  if (!invitee) {
    return {
      status: 'inactive',
      checkReason: 'invitee missing',
      checkedAt,
      activitySummary: null,
      shouldActivate: false,
    };
  }

  const enrichedSummary = {
    ...(summary || finalizeActivityAccumulator()),
  };

  const failures = [];
  if (duplicateIp > 0) failures.push('IP не уникален');
  if (duplicateFp > 0) failures.push('Fingerprint не уникален');

  if (inviter) {
    const inviterEmailLocal = getEmailLocalPart(inviter.email);
    const inviteeEmailLocal = getEmailLocalPart(invitee.email);
    const similarEmail = areSimilarStrings(inviterEmailLocal, inviteeEmailLocal);
    const similarNick = areSimilarStrings(inviter.nickname, invitee.nickname);
    if (similarEmail || similarNick) failures.push('Схожие данные');
  }

  if (enrichedSummary.minutesTotal < MIN_MINUTES) failures.push('Мало минут онлайн (<15)');
  if (enrichedSummary.solarCollects < MIN_SOLAR) failures.push('Нет сбора заряда');
  if (enrichedSummary.searchCount < MIN_SEARCH) failures.push('Нет поиска собеседника');
  if (enrichedSummary.bridgeStones < MIN_BRIDGE_STONES) failures.push('Недостаточно камней в мост (<3)');

  if (failures.length > 0) {
    return {
      status: 'inactive',
      checkReason: failures.join('; '),
      checkedAt,
      activitySummary: enrichedSummary,
      shouldActivate: false,
    };
  }

  return {
    status: 'active',
    checkReason: 'Пройден Тихий ночной дозор',
    checkedAt,
    activitySummary: enrichedSummary,
    shouldActivate: true,
  };
}

async function applyReferralActivationSideEffects(referral, prevStatus) {
  try {
    const { grantAchievement } = require('./achievementService');
    const { creditK } = require('./kService');

    const supabase = getSupabaseClient();
    const { count: activeCountRaw } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', String(referral.inviter))
      .eq('status', 'active');
    const activeCount = Math.max(0, Number(activeCountRaw) || 0);
    if (activeCount >= 50) {
      await grantAchievement({ userId: referral.inviter, achievementId: 97 });
    }

    const checkChainDepth = async (userId, depth = 0) => {
      if (depth >= 3) return true;
      const { data, error } = await supabase
        .from('referrals')
        .select('invitee_id')
        .eq('inviter_id', String(userId))
        .eq('status', 'active');
      const subReferrals = !error && Array.isArray(data) ? data : [];
      for (const sub of subReferrals) {
        if (await checkChainDepth(sub.invitee_id, depth + 1)) return true;
      }
      return false;
    };

    const findTopInviter = async (userId) => {
      const { data, error } = await supabase
        .from('referrals')
        .select('inviter_id')
        .eq('invitee_id', String(userId));
      const refs = !error && Array.isArray(data) ? data : [];
      for (const row of refs) {
        if (await checkChainDepth(row.inviter_id)) {
          await grantAchievement({ userId: row.inviter_id, achievementId: 98 });
        }
        await findTopInviter(row.inviter_id);
      }
    };
    await findTopInviter(referral.invitee);

    const since30d = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000);
    const { count: last30ActiveCountRaw } = await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('inviter_id', String(referral.inviter))
      .eq('status', 'active')
      .gte('active_since', since30d.toISOString());
    const last30ActiveCount = Math.max(0, Number(last30ActiveCountRaw) || 0);
    if (last30ActiveCount === MONTHLY_TARGET) {
      const alreadyMonthlyBonus = await transactionExists({
        userId: referral.inviter,
        type: 'referral',
        direction: 'credit',
        currency: 'K',
        description: 'Бонус за 300 рефералов за 30 дней',
        occurredSince: since30d,
      });
      if (!alreadyMonthlyBonus) {
        await creditK({
          userId: referral.inviter,
          amount: MONTHLY_BONUS_K,
          type: 'referral',
          description: 'Бонус за 300 рефералов за 30 дней',
          relatedEntity: String(referral.id),
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
  const referralRow = referral && typeof referral === 'object' && referral.inviter_id ? referral : await getReferralById(referralId);
  if (!referralRow) return null;
  const createdAt = referralRow?.created_at ? new Date(referralRow.created_at) : null;
  if (createdAt && createdAt.getTime() > Date.now() - HOURS_TO_CHECK * 60 * 60 * 1000) {
    return referralRow;
  }

  const prevStatus = referralRow?.status;
  const invitee = await getUserForReferral(referralRow.invitee_id);
  if (!invitee) {
    const patched = await updateReferralById(referralRow.id, {
      status: 'inactive',
      checked_at: new Date().toISOString(),
      check_reason: 'invitee missing',
    });
    return patched;
  }

  const inviter = await getUserForReferral(referralRow.inviter_id);

  const since = new Date(Date.now() - TND_ACTIVITY_WINDOW_HOURS * 60 * 60 * 1000);
  const summaries = await buildReferralActivitySummaries([invitee.id], since);
  const summary = summaries.get(invitee.id) || finalizeActivityAccumulator();

  const supabase = getSupabaseClient();
  const duplicateIp = referralRow.invitee_ip
    ? (await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('invitee_ip', String(referralRow.invitee_ip))
      .neq('id', Number(referralRow.id))).count
    : 0;
  const duplicateFp = referralRow.invitee_fingerprint
    ? (await supabase
      .from('referrals')
      .select('id', { head: true, count: 'exact' })
      .eq('invitee_fingerprint', String(referralRow.invitee_fingerprint))
      .neq('id', Number(referralRow.id))).count
    : 0;

  const decision = buildReferralDecision({
    invitee,
    inviter,
    summary,
    duplicateIp: Math.max(0, Number(duplicateIp) || 0),
    duplicateFp: Math.max(0, Number(duplicateFp) || 0),
  });

  const patch = {
    activity_summary: decision.activitySummary,
    checked_at: decision.checkedAt.toISOString(),
    status: decision.status,
    check_reason: decision.checkReason,
  };

  if (decision.shouldActivate) {
    patch.active_since = referralRow.active_since || new Date().toISOString();
  }

  const updated = await updateReferralById(referralRow.id, patch);
  if (decision.shouldActivate) {
    await applyReferralActivationSideEffects({
      id: referralRow.id,
      inviter: referralRow.inviter_id,
      invitee: referralRow.invitee_id,
      inviteeUser: invitee,
      status: decision.status,
    }, prevStatus);
  }
  return updated;
}

async function runQuietWatch() {
  const threshold = new Date(Date.now() - HOURS_TO_CHECK * 60 * 60 * 1000);
  const checkedThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const supabase = getSupabaseClient();
  const { data: pending, error } = await supabase
    .from('referrals')
    .select('id,inviter_id,invitee_id,status,invitee_ip,invitee_fingerprint,active_since,created_at,confirmed_at,checked_at,bonus_granted')
    .in('status', ['pending', 'inactive'])
    .not('confirmed_at', 'is', null)
    .lte('created_at', threshold.toISOString());
  const safePending = (!error && Array.isArray(pending) ? pending : []).filter((row) => {
    if (!row?.checked_at) return true;
    const checkedAt = new Date(row.checked_at);
    if (Number.isNaN(checkedAt.getTime())) return true;
    return checkedAt.getTime() <= checkedThreshold.getTime();
  });
  if (!safePending.length) return 0;

  const since = new Date(Date.now() - DAYS_WINDOW * 24 * 60 * 60 * 1000);
  const inviteeIds = Array.from(new Set(safePending.map((row) => String(row?.invitee_id || '').trim()).filter(Boolean)));
  const inviterIds = Array.from(new Set(safePending.map((row) => String(row?.inviter_id || '').trim()).filter(Boolean)));

  const [invitees, inviters, activitySummaries, duplicateCounters] = await Promise.all([
    getUsersForReferral(inviteeIds, { selectEntity: true }),
    getUsersForReferral(inviterIds, { selectEntity: false }),
    buildReferralActivitySummaries(inviteeIds, since),
    buildReferralDuplicateCounters(),
  ]);

  const inviteesById = new Map((Array.isArray(invitees) ? invitees : []).map((row) => [String(row?.id), row]));
  const invitersById = new Map((Array.isArray(inviters) ? inviters : []).map((row) => [String(row?.id), row]));

  for (const ref of safePending) {
    const invitee = inviteesById.get(String(ref?.invitee_id || '').trim()) || null;
    const inviter = invitersById.get(String(ref?.inviter_id || '').trim()) || null;
    const decision = buildReferralDecision({
      invitee,
      inviter,
      summary: activitySummaries.get(String(ref?.invitee_id || '').trim()) || finalizeActivityAccumulator(),
      duplicateIp: getDuplicateCount(duplicateCounters.inviteeIp, ref?.invitee_ip),
      duplicateFp: getDuplicateCount(duplicateCounters.inviteeFingerprint, ref?.invitee_fingerprint),
    });

    if (decision.shouldActivate) {
      const referralForSideEffects = {
        ...ref,
        invitee: ref?.invitee_id,
        inviteeUser: invitee,
        inviter: ref?.inviter_id,
        inviterUser: inviter,
        activitySummary: decision.activitySummary,
        checkedAt: decision.checkedAt,
        status: decision.status,
        checkReason: decision.checkReason,
        activeSince: ref.active_since || new Date(),
      };
      // eslint-disable-next-line no-await-in-loop
      await applyReferralActivationSideEffects(referralForSideEffects, ref.status);
    }

    // eslint-disable-next-line no-await-in-loop
    await updateReferralById(ref.id, {
      activity_summary: decision.activitySummary,
      checked_at: decision.checkedAt.toISOString(),
      status: decision.status,
      check_reason: decision.checkReason,
      ...(decision.shouldActivate
        ? {
          active_since: (ref.active_since ? new Date(ref.active_since) : new Date()).toISOString(),
        }
        : {}),
    });
  }
  return safePending.length;
}

module.exports = { runQuietWatch, evaluateReferral, awardMonthlyTopReferrer };

