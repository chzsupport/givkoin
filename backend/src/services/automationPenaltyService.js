const { RISK_WINDOW_DAYS } = require('./automationRiskService');
const { listActivities } = require('./activityService');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function toId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    if (value._id) return String(value._id);
    if (value.id) return String(value.id);
  }
  return String(value);
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,status,created_at,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(userId);
  if (!row) return null;
  const existing = row.data && typeof row.data === 'object' ? row.data : {};
  const next = { ...existing, ...patch };
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round3(value) {
  return Math.round(safeNumber(value) * 1000) / 1000;
}

function extractActivityEarnings(row) {
  const type = String(row?.type || '').trim();
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  if (!type) return { sc: 0, lm: 0, stars: 0 };

  if (type === 'solar_collect') {
    return {
      sc: Math.max(0, safeNumber(meta.earnedSc, 10)),
      lm: Math.max(0, safeNumber(meta.earnedLm, 100)),
      stars: 0,
    };
  }

  if (type === 'night_shift') {
    return {
      sc: Math.max(0, safeNumber(meta.earnedSc)),
      lm: Math.max(0, safeNumber(meta.earnedLm)),
      stars: Math.max(0, safeNumber(meta.earnedStars)),
    };
  }

  if (type === 'battle_spark') {
    return {
      sc: Math.max(0, safeNumber(meta.rewardSc)),
      lm: Math.max(0, safeNumber(meta.rewardLumens)),
      stars: 0,
    };
  }

  if (type === 'fruit_collect') {
    const reward = Math.max(0, safeNumber(meta.reward));
    const rewardType = String(meta.rewardType || '').trim();
    return {
      sc: rewardType === 'sc' ? reward : 0,
      lm: rewardType === 'lumens' ? reward : 0,
      stars: rewardType === 'stars' ? reward : 0,
    };
  }

  if (type === 'solar_share') {
    return {
      sc: Math.max(0, safeNumber(meta.scAward, 5)),
      lm: 0,
      stars: Math.max(0, safeNumber(meta.starsAward)),
    };
  }

  return { sc: 0, lm: 0, stars: 0 };
}

async function buildPenaltyBase({ userId, relatedUserIds = [], since, until }) {
  const relatedSet = new Set(
    (Array.isArray(relatedUserIds) ? relatedUserIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  );

  const supabase = getSupabaseClient();
  const sinceIso = new Date(since).toISOString();
  const untilIso = new Date(until).toISOString();

  const [transactionRows, activities, inboundTransfers] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at')
        .eq('model', 'Transaction')
        .eq('data->>user', String(userId))
        .eq('data->>direction', 'credit')
        .eq('data->>status', 'completed')
        .gte('created_at', sinceIso)
        .lte('created_at', untilIso)
        .limit(5000);
      if (error) return [];
      return (data || []).map((row) => ({ _id: row.id, ...row.data, occurredAt: row.created_at }));
    })(),
    listActivities({
      userIds: [userId],
      types: ['solar_collect', 'night_shift', 'battle_spark', 'fruit_collect', 'solar_share'],
      since,
      until,
      limit: 10000,
    }).then((rows) => (Array.isArray(rows) ? rows : []).map((row) => ({
      type: row?.type,
      meta: row?.meta,
      createdAt: row?.created_at ? new Date(row.created_at) : null,
    }))),
    (async () => {
      let q = supabase
        .from('activity_logs')
        .select('user_id,meta,created_at')
        .eq('type', 'solar_share')
        .filter('meta->>recipientId', 'eq', String(userId));

      if (since) q = q.gte('created_at', sinceIso);
      if (until) q = q.lt('created_at', untilIso);

      const { data, error } = await q;
      if (error) throw error;
      return (Array.isArray(data) ? data : []).map((row) => ({
        user: row?.user_id,
        meta: row?.meta,
        createdAt: row?.created_at ? new Date(row.created_at) : null,
      }));
    })(),
  ]);

  let scFromTransactions = 0;
  let lumensFromTransactions = 0;
  for (const row of transactionRows) {
    const amount = Math.max(0, safeNumber(row?.amount));
    if (!amount) continue;
    if (String(row?.currency || 'K') === 'LM') lumensFromTransactions += amount;
    else if (String(row?.currency || 'K') === 'K') scFromTransactions += amount;
  }

  let scFromActivities = 0;
  let lumensFromActivities = 0;
  for (const row of activities) {
    const earnings = extractActivityEarnings(row);
    scFromActivities += earnings.sc;
    lumensFromActivities += earnings.lm;
  }

  let lumensFromRelatedTransfers = 0;
  if (relatedSet.size) {
    for (const row of inboundTransfers) {
      const senderId = String(row?.user || '').trim();
      if (!relatedSet.has(senderId)) continue;
      lumensFromRelatedTransfers += Math.max(0, safeNumber(row?.meta?.amountLm));
    }
  }

  return {
    scFromTransactions: round3(scFromTransactions),
    scFromActivities: round3(scFromActivities),
    lumensFromTransactions: round3(lumensFromTransactions),
    lumensFromActivities: round3(lumensFromActivities),
    lumensFromRelatedTransfers: round3(lumensFromRelatedTransfers),
    totalSc: round3(scFromTransactions + scFromActivities),
    totalLumens: round3(lumensFromTransactions + lumensFromActivities + lumensFromRelatedTransfers),
  };
}

async function createPenaltyTransactions({ userId, riskCaseId, confiscatedSc, confiscatedLumens, penaltyPercent }) {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const created = [];
  
  if (confiscatedSc > 0) {
    const id = `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const txData = {
      user: userId,
      type: 'admin',
      direction: 'debit',
      amount: round3(confiscatedSc),
      currency: 'K',
      description: `Штраф ${penaltyPercent}% за подтвержденную автоматизацию`,
      relatedEntity: riskCaseId,
    };
    await supabase.from(DOC_TABLE).insert({
      model: 'Transaction',
      id,
      data: txData,
      created_at: nowIso,
      updated_at: nowIso,
    });
    created.push({ _id: id, ...txData });
  }

  if (confiscatedLumens > 0) {
    const id = `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const txData = {
      user: userId,
      type: 'admin',
      direction: 'debit',
      amount: round3(confiscatedLumens),
      currency: 'LM',
      description: `Штраф ${penaltyPercent}% за подтвержденную автоматизацию`,
      relatedEntity: riskCaseId,
    };
    await supabase.from(DOC_TABLE).insert({
      model: 'Transaction',
      id,
      data: txData,
      created_at: nowIso,
      updated_at: nowIso,
    });
    created.push({ _id: id, ...txData });
  }

  return created;
}

async function applyRiskPenalty({
  riskCaseId,
  actorId,
  reason = '',
  force = false,
  penaltyPercent = 80,
}) {
  const safePercent = Math.min(100, Math.max(0, safeNumber(penaltyPercent, 80)));
  const now = new Date();
  const supabase = getSupabaseClient();
  
  const { data: riskCaseRow, error: findError } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'RiskCase')
    .eq('id', String(riskCaseId))
    .maybeSingle();
  
  if (!riskCaseRow) {
    const err = new Error('Риск-кейс не найден');
    err.status = 404;
    throw err;
  }
  
  const riskCase = { _id: riskCaseRow.id, ...riskCaseRow.data };

  if (riskCase.status === 'penalized' || riskCase?.penalty?.appliedAt) {
    const err = new Error('Штраф по этому риск-кейсу уже применён');
    err.status = 400;
    throw err;
  }

  const reviewEligibleAt = riskCase.reviewEligibleAt ? new Date(riskCase.reviewEligibleAt) : null;
  if (reviewEligibleAt && reviewEligibleAt > now && !force) {
    const err = new Error('Риск-кейс ещё не достиг окна штрафа. Для досрочного действия нужен force.');
    err.status = 400;
    throw err;
  }

  const userId = toId(riskCase.user);
  const userRow = await getUserRowById(userId);
  if (!userRow) {
    const err = new Error('Пользователь риск-кейса не найден');
    err.status = 404;
    throw err;
  }

  const userData = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};

  const defaultSince = new Date(now.getTime() - (RISK_WINDOW_DAYS * 24 * 60 * 60 * 1000));
  const createdAt = userRow?.created_at ? new Date(userRow.created_at) : null;
  const since = createdAt && createdAt > defaultSince ? createdAt : defaultSince;
  const penaltyBase = await buildPenaltyBase({
    userId,
    relatedUserIds: riskCase.relatedUsers || [],
    since,
    until: now,
  });

  const targetConfiscation = {
    sc: round3((penaltyBase.totalSc * safePercent) / 100),
    lumens: round3((penaltyBase.totalLumens * safePercent) / 100),
  };
  const currentBalancesBefore = {
    sc: round3(userData.sc || 0),
    lumens: round3(userData.lumens || 0),
  };
  const confiscated = {
    sc: round3(Math.min(currentBalancesBefore.sc, targetConfiscation.sc)),
    lumens: round3(Math.min(currentBalancesBefore.lumens, targetConfiscation.lumens)),
  };
  const shortfall = {
    sc: round3(Math.max(0, targetConfiscation.sc - confiscated.sc)),
    lumens: round3(Math.max(0, targetConfiscation.lumens - confiscated.lumens)),
  };

  const nextSc = round3(Math.max(0, currentBalancesBefore.sc - confiscated.sc));
  const nextLumens = round3(Math.max(0, currentBalancesBefore.lumens - confiscated.lumens));
  await updateUserDataById(userId, { sc: nextSc, lumens: nextLumens });

  await createPenaltyTransactions({
    userId,
    riskCaseId: riskCase._id,
    confiscatedSc: confiscated.sc,
    confiscatedLumens: confiscated.lumens,
    penaltyPercent: safePercent,
  });

  const penaltyId = `ap_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const penaltyData = {
    riskCase: riskCase._id,
    user: userId,
    appliedBy: actorId,
    appliedAt: now.toISOString(),
    forceApplied: Boolean(force),
    penaltyPercent: safePercent,
    reason: String(reason || '').trim(),
    windowStart: since.toISOString(),
    windowEnd: now.toISOString(),
    profitBase: penaltyBase,
    targetConfiscation,
    currentBalancesBefore,
    currentBalancesAfter: {
      sc: nextSc,
      lumens: nextLumens,
    },
    confiscated,
    shortfall,
    evidenceSnapshot: {
      riskScore: round3(riskCase.riskScore || 0),
      riskLevel: riskCase.riskLevel || 'low',
      signals: Array.isArray(riskCase.signals) ? riskCase.signals : [],
      relatedUsers: Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers : [],
      reviewEligibleAt: reviewEligibleAt ? reviewEligibleAt.toISOString() : null,
    },
    meta: {
      projectReserve: {
        sc: confiscated.sc,
        lumens: confiscated.lumens,
      },
      userStatusAtPenalty: userRow.status || 'user',
    },
  };
  
  await supabase.from(DOC_TABLE).insert({
    model: 'AutomationPenalty',
    id: penaltyId,
    data: penaltyData,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  
  const penalty = { _id: penaltyId, ...penaltyData };

  const sanctionEvidence = {
    happenedAt: now.toISOString(),
    category: 'sanction',
    signal: 'automation_penalty_applied',
    score: 0,
    summary: `Применён штраф ${safePercent}% по автоматизации`,
    meta: {
      penaltyId: penalty._id,
      forceApplied: Boolean(force),
      confiscatedSc: confiscated.sc,
      confiscatedLumens: confiscated.lumens,
      shortfallSc: shortfall.sc,
      shortfallLumens: shortfall.lumens,
    },
  };

  const evidence = Array.isArray(riskCase.evidence) ? [sanctionEvidence, ...riskCase.evidence] : [sanctionEvidence];
  const updatedRiskCaseData = {
    ...riskCaseRow.data,
    status: 'penalized',
    penalty: {
      appliedAt: now.toISOString(),
      appliedBy: actorId,
      forceApplied: Boolean(force),
      penaltyPercent: safePercent,
      confiscatedSc: confiscated.sc,
      confiscatedLumens: confiscated.lumens,
      shortfallSc: shortfall.sc,
      shortfallLumens: shortfall.lumens,
      reason: String(reason || '').trim(),
      ledgerId: penalty._id,
    },
    evidence: evidence.slice(0, 100),
    meta: {
      ...(riskCase.meta && typeof riskCase.meta === 'object' ? riskCase.meta : {}),
      lastPenaltyAt: now.toISOString(),
      penaltyBase,
    },
  };
  
  await supabase
    .from(DOC_TABLE)
    .update({ data: updatedRiskCaseData, updated_at: now.toISOString() })
    .eq('id', riskCaseRow.id);

  return {
    riskCase: { ...riskCase, status: 'penalized', penalty: updatedRiskCaseData.penalty, evidence: updatedRiskCaseData.evidence, meta: updatedRiskCaseData.meta },
    penalty,
    result: {
      penaltyPercent: safePercent,
      reviewEligibleAt,
      forceApplied: Boolean(force),
      profitBase: penaltyBase,
      targetConfiscation,
      confiscated,
      shortfall,
      currentBalancesAfter: {
        sc: nextSc,
        lumens: nextLumens,
      },
    },
  };
}

module.exports = {
  applyRiskPenalty,
  buildPenaltyBase,
};

