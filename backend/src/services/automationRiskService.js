const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { listAllDocsByModel, upsertDoc } = require('./documentStore');
const {
  addSignal,
  createRiskContext,
  riskLevelByScore,
  round,
  sanitizeEvidence,
  sanitizeTimeline,
  sortByDate,
} = require('./automationRisk/automationRiskScoring');
const {
  addUserToSignalMaps,
  appendRowByUser,
  buildSignalMaps,
  groupRowsByUser,
} = require('./automationRisk/automationRiskSignalMaps');
const {
  evaluateIdentitySignals,
} = require('./automationRisk/automationRiskIdentitySignals');
const {
  evaluateNavigationSignals,
} = require('./automationRisk/automationRiskNavigationSignals');
const {
  evaluateTimingSignals,
} = require('./automationRisk/automationRiskTimingSignals');
const {
  evaluateHttpSignals,
  evaluateSessionRestrictionSignals,
} = require('./automationRisk/automationRiskHttpSignals');
const {
  evaluateBattleSignals,
} = require('./automationRisk/automationRiskBattleSignals');
const {
  evaluateEconomicSignals,
} = require('./automationRisk/automationRiskEconomicSignals');
const {
  evaluateBehaviorClusterSignals,
  evaluateStructuralClusterSignals,
} = require('./automationRisk/automationRiskClusterSignals');
const {
  PROFIT_ACTIVITY_TYPES,
  buildProgressProfileForUser,
} = require('./automationRisk/automationRiskProgressProfiles');
const {
  appendBattleAttendanceByUser,
  buildBattleAttendanceByUser,
} = require('./automationRisk/automationRiskBattleAttendance');
const {
  buildBattleProfiles,
} = require('./automationRisk/automationRiskBattleProfiles');
const {
  appendTransferGraphActivity,
  buildTransferGraph,
} = require('./automationRisk/automationRiskTransferGraph');

const AUTOMATION_RISK_SOURCE = 'automation_risk_v3';

function getRiskCaseSource(row) {
  if (!row || typeof row !== 'object') return '';
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  return String(meta.source || '').trim();
}

function isAutomationRiskCase(row) {
  const source = getRiskCaseSource(row);
  const freezeStatus = String(row?.freezeStatus || '').trim();
  const groupId = String(row?.groupId || '').trim();
  if (!source && (groupId || freezeStatus)) return false;
  return !source || source === AUTOMATION_RISK_SOURCE;
}

async function listModelDocs(model, { pageSize = 1000 } = {}) {
  return listAllDocsByModel(model, { pageSize });
}

async function upsertModelDocs(model, docs = []) {
  const safeDocs = Array.isArray(docs) ? docs.filter(Boolean) : [];
  if (!safeDocs.length) return;

  const nowIso = new Date().toISOString();
  for (const doc of safeDocs) {
    const id = String(doc.id);
    const data = doc.data && typeof doc.data === 'object' ? doc.data : {};
    // eslint-disable-next-line no-await-in-loop
    await upsertDoc({
      model: String(model),
      id,
      data,
      createdAt: doc.created_at || doc.createdAt || nowIso,
      updatedAt: nowIso,
    });
  }
}

const RISK_WINDOW_DAYS = 30;
const REVIEW_DELAY_DAYS = 30;

async function recomputeRiskCases() {
  const now = new Date();
  const since = new Date(now.getTime() - (RISK_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const referralsByInviter = new Map();
  const activitiesByUser = new Map();
  const behaviorEventsByUser = new Map();
  const sessionsByUser = new Map();
  const battleAttendancesByUser = new Map();
  const transactionsByUser = new Map();
  const achievementsByUser = new Map();
  const existingCaseByUser = new Map();
  const transferGraph = { outbound: new Map(), inbound: new Map() };

  const buildReferralsByInviter = async () => {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    let from = 0;
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('referrals')
        .select('inviter_id,invitee_id')
        .range(from, from + pageSize - 1);
      if (error || !Array.isArray(data) || !data.length) break;
      data.forEach((row) => {
        const inviter = row?.inviter_id ? String(row.inviter_id) : '';
        const invitee = row?.invitee_id ? String(row.invitee_id) : '';
        if (!inviter || !invitee) return;
        if (!referralsByInviter.has(inviter)) referralsByInviter.set(inviter, new Set());
        referralsByInviter.get(inviter).add(invitee);
      });
      if (data.length < pageSize) break;
      from += pageSize;
    }
  };

  const buildTransactions = async () => {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    let from = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('transactions')
        .select('user_id,type,direction,amount,currency,status,occurred_at')
        .gte('occurred_at', since.toISOString())
        .order('occurred_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error || !Array.isArray(data) || !data.length) break;
      data.forEach((row) => {
        appendRowByUser(transactionsByUser, {
          user: row?.user_id,
          type: row?.type,
          direction: row?.direction,
          amount: row?.amount,
          currency: row?.currency,
          status: row?.status,
          occurredAt: row?.occurred_at ? new Date(row.occurred_at) : null,
        });
      });

      if (data.length < pageSize) break;
      from += pageSize;
    }
  };

  const buildSessions = async () => {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    let from = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('user_sessions')
        .select('user_id,session_id,started_at,last_seen_at,ended_at,is_active,revoked_at,revoke_reason')
        .or([
          `started_at.gte.${since.toISOString()}`,
          `last_seen_at.gte.${since.toISOString()}`,
          `ended_at.gte.${since.toISOString()}`,
        ].join(','))
        .order('started_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error || !Array.isArray(data) || !data.length) break;
      data.forEach((row) => {
        appendRowByUser(sessionsByUser, {
          user: row?.user_id,
          sessionId: row?.session_id,
          startedAt: row?.started_at ? new Date(row.started_at) : null,
          lastSeenAt: row?.last_seen_at ? new Date(row.last_seen_at) : null,
          endedAt: row?.ended_at ? new Date(row.ended_at) : null,
          isActive: row?.is_active,
          revokedAt: row?.revoked_at ? new Date(row.revoked_at) : null,
          revokeReason: row?.revoke_reason,
        });
      });

      if (data.length < pageSize) break;
      from += pageSize;
    }
  };

  const buildUsers = async () => {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    let from = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('users')
        .select('id,status,email_confirmed,last_device_id,last_fingerprint,email,nickname,created_at,data')
        .range(from, from + pageSize - 1);
      if (error || !Array.isArray(data) || !data.length) break;

      data.forEach((row) => {
        const dataJson = row?.data && typeof row.data === 'object' ? row.data : {};
        const user = {
          _id: row?.id,
          createdAt: row?.created_at ? new Date(row.created_at) : null,
          status: row?.status,
          emailConfirmed: Boolean(row?.email_confirmed),
          lastDeviceId: row?.last_device_id,
          lastFingerprint: row?.last_fingerprint,
          emailNormalized: row?.email,
          nicknameNormalized: row?.nickname,
          referredBy: dataJson?.referredBy,
          nightShift: dataJson?.nightShift,
          achievementStats: dataJson?.achievementStats,
        };
        const userId = String(user?._id || '');
        if (!userId) return;
        usersById.set(userId, user);
        userIds.push(userId);
        addUserToSignalMaps(maps, user);
        const profile = buildProgressProfileForUser(user, {
          activitiesByUser,
          transactionsByUser,
          achievementsByUser,
        });
        if (profile) progressProfilesByUser.set(userId, profile);
      });

      if (data.length < pageSize) break;
      from += pageSize;
    }
  };

  const buildActivities = async () => {
    const supabase = getSupabaseClient();
    const pageSize = 1000;
    let from = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('activity_logs')
        .select('user_id,type,meta,created_at')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (error || !Array.isArray(data) || !data.length) break;
      data.forEach((row) => {
        const slimRow = {
          user: row?.user_id,
          type: row?.type,
          meta: row?.meta,
          createdAt: row?.created_at ? new Date(row.created_at) : null,
        };
        appendRowByUser(activitiesByUser, slimRow);
        appendTransferGraphActivity(transferGraph, slimRow);
      });

      if (data.length < pageSize) break;
      from += pageSize;
    }
  };

  await Promise.all([
    buildReferralsByInviter(),
    buildActivities(),
    buildTransactions(),
    buildSessions(),
    (async () => {
      const rows = await listModelDocs('BehaviorEvent');
      (Array.isArray(rows) ? rows : [])
        .filter((row) => {
          const at = row?.occurredAt ? new Date(row.occurredAt) : null;
          return at && !Number.isNaN(at.getTime()) && at >= since;
        })
        .forEach((row) => {
        appendRowByUser(behaviorEventsByUser, {
          user: row?.user,
          category: row?.category,
          eventType: row?.eventType,
          sessionId: row?.sessionId,
          path: row?.path,
          battleId: row?.battleId,
          meta: row?.meta,
          occurredAt: row?.occurredAt,
        });
        });
    })(),
    (async () => {
      const rows = await listModelDocs('Battle');
      (Array.isArray(rows) ? rows : [])
        .filter((row) => {
          const at = row?.updatedAt ? new Date(row.updatedAt) : null;
          return at && !Number.isNaN(at.getTime()) && at >= since;
        })
        .forEach((row) => {
        appendBattleAttendanceByUser(battleAttendancesByUser, {
          _id: row?._id,
          updatedAt: row?.updatedAt,
          createdAt: row?.createdAt,
          endsAt: row?.endsAt,
          attendance: row?.attendance,
        }, since);
        });
    })(),
    (async () => {
      const rows = await listModelDocs('UserAchievement');
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        appendRowByUser(achievementsByUser, {
          user: row?.user,
          achievementId: row?.achievementId,
          earnedAt: row?.earnedAt,
        });
      });
    })(),
    (async () => {
      const rows = await listModelDocs('RiskCase');
      (Array.isArray(rows) ? rows : []).forEach((row) => {
        if (!isAutomationRiskCase(row)) return;
        const userId = row?.user && typeof row.user === 'object'
          ? String(row.user._id || row.user)
          : String(row?.user || '');
        if (!userId) return;
        const prev = existingCaseByUser.get(userId);
        const prevTime = new Date(prev?.updatedAt || prev?.createdAt || 0).getTime();
        const nextTime = new Date(row?.updatedAt || row?.createdAt || 0).getTime();
        if (!prev || nextTime >= prevTime) {
          existingCaseByUser.set(userId, row);
        }
      });
    })(),
  ]);

  const usersById = new Map();
  const userIds = [];
  const maps = buildSignalMaps();
  const progressProfilesByUser = new Map();
  const battleProfilesByUser = buildBattleProfiles(battleAttendancesByUser);

  await buildUsers();

  const contextsByUserId = new Map();

  for (const userId of userIds) {
    const user = usersById.get(userId);
    if (!user) continue;
    const ctx = createRiskContext(user, now);
    const userActivities = sortByDate(activitiesByUser.get(userId) || [], 'createdAt');
    const pageViews = userActivities.filter((row) => row?.type === 'page_view');
    const profitableActivities = userActivities.filter((row) => PROFIT_ACTIVITY_TYPES.has(String(row?.type || '')));

    evaluateIdentitySignals(ctx, { usersById, maps, referralsByInviter, existingCaseByUser });
    evaluateNavigationSignals(ctx, pageViews, profitableActivities, now);
    evaluateTimingSignals(ctx, pageViews, profitableActivities, sessionsByUser.get(userId) || [], now);
    evaluateHttpSignals(ctx, behaviorEventsByUser.get(userId) || [], now);
    evaluateSessionRestrictionSignals(
      ctx,
      sessionsByUser.get(userId) || [],
      behaviorEventsByUser.get(userId) || [],
      now
    );
    evaluateBattleSignals(
      ctx,
      battleAttendancesByUser.get(userId) || [],
      behaviorEventsByUser.get(userId) || [],
      now
    );
    evaluateEconomicSignals(ctx, transferGraph, now);

    if (!user.emailConfirmed) {
      addSignal(ctx, {
        signal: 'email_not_confirmed',
        score: 4,
        category: 'identity',
        summary: 'Email не подтвержден',
        happenedAt: now,
      });
    }

    if (user.status === 'banned') {
      addSignal(ctx, {
        signal: 'already_banned',
        score: 8,
        category: 'identity',
        summary: 'Аккаунт уже заблокирован',
        happenedAt: now,
      });
    }

    contextsByUserId.set(userId, ctx);
  }

  evaluateBehaviorClusterSignals(contextsByUserId);
  evaluateStructuralClusterSignals(contextsByUserId, progressProfilesByUser, battleProfilesByUser);

  const operations = [];
  let flagged = 0;

  for (const userId of userIds) {
    const user = usersById.get(userId);
    if (!user) continue;
    const ctx = contextsByUserId.get(userId);
    if (!ctx) continue;

    const riskScore = round(ctx.score, 2);
    const riskLevel = riskLevelByScore(riskScore);
    if (riskScore > 0) flagged += 1;

    const existing = existingCaseByUser.get(userId);
    let status = existing?.status || (riskScore > 0 ? 'open' : 'resolved');
    if (!['ignored', 'penalized'].includes(status)) {
      if (riskScore > 0 && status === 'resolved') status = 'open';
      if (riskScore <= 0 && (!existing || ['open', 'review', 'resolved'].includes(existing.status))) {
        status = 'resolved';
      }
    }

    const reviewEligibleAt = user?.createdAt
      ? new Date(new Date(user.createdAt).getTime() + REVIEW_DELAY_DAYS * 24 * 60 * 60 * 1000)
      : null;
    const existingSanctionEvidence = Array.isArray(existing?.evidence)
      ? existing.evidence.filter((row) => String(row?.category || '') === 'sanction')
      : [];

    const scoreBreakdown = Array.from(ctx.scoreBreakdown.values())
      .sort((a, b) => b.score - a.score || b.count - a.count)
      .map((row) => ({
        signal: row.signal,
        score: round(row.score, 2),
        count: row.count,
      }));

    operations.push({
      updateOne: {
        filter: { user: user._id },
        update: {
          $set: {
            riskScore,
            riskWindowDays: RISK_WINDOW_DAYS,
            reviewEligibleAt,
            riskLevel,
            status,
            signals: Array.from(ctx.signals).sort(),
            relatedUsers: Array.from(ctx.relatedUsers),
            dailyTimeline: sanitizeTimeline(ctx.dailyTimeline),
            scoreBreakdown,
            evidence: sanitizeEvidence([...ctx.evidence, ...existingSanctionEvidence]),
            notes: existing?.notes || '',
            lastEvaluatedAt: now,
            meta: {
              ...(existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}),
              source: AUTOMATION_RISK_SOURCE,
              daysTracked: Math.min(
                RISK_WINDOW_DAYS,
                Math.max(1, Math.floor((now.getTime() - new Date(user.createdAt || now).getTime()) / (24 * 60 * 60 * 1000)) + 1)
              ),
              lastRecomputedAt: now,
            },
          },
          $setOnInsert: { user: user._id },
        },
        upsert: true,
      },
    });
  }

  if (operations.length) {
    const nowIso = new Date().toISOString();
    const docs = operations
      .map((op) => {
        const updateOne = op?.updateOne;
        const filterUser = updateOne?.filter?.user;
        const userKey = filterUser && typeof filterUser === 'object'
          ? String(filterUser._id || filterUser)
          : String(filterUser || '');
        if (!userKey) return null;

        const setPatch = updateOne?.update?.$set && typeof updateOne.update.$set === 'object'
          ? updateOne.update.$set
          : {};
        const setOnInsert = updateOne?.update?.$setOnInsert && typeof updateOne.update.$setOnInsert === 'object'
          ? updateOne.update.$setOnInsert
          : {};

        const existing = existingCaseByUser.get(userKey);
        const id = existing?._id ? String(existing._id) : crypto.randomBytes(12).toString('hex');

        const base = existing && typeof existing === 'object'
          ? { ...existing }
          : {};
        delete base._id;
        delete base.createdAt;
        delete base.updatedAt;

        const next = {
          ...base,
          ...setOnInsert,
          ...setPatch,
        };

        return {
          id,
          data: next,
          created_at: existing?.createdAt ? new Date(existing.createdAt).toISOString() : nowIso,
        };
      })
      .filter(Boolean);

    await upsertModelDocs('RiskCase', docs);
  }

  return {
    flagged,
    processed: userIds.length,
    riskWindowDays: RISK_WINDOW_DAYS,
    evaluatedAt: now,
  };
}

module.exports = {
  RISK_WINDOW_DAYS,
  REVIEW_DELAY_DAYS,
  recomputeRiskCases,
  riskLevelByScore,
};

