const { writeAuthEvent } = require('./authTrackingService');
const { evaluateAccessRestriction } = require('./securityService');
const { lookupIpIntel } = require('./networkIntelService');
const {
  getDocByModelAndId,
  listDocsByModel,
} = require('./documentStore');
const {
  listSignalHistoryByUserIds,
} = require('./signalHistoryService');
const {
  sanitizeRewardRollbackEntries,
} = require('./multiAccount/rewardRollback');
const {
  createRiskCaseUpsert,
} = require('./multiAccount/riskCaseUpsert');
const {
  createRiskCaseRepair,
} = require('./multiAccount/riskCaseRepair');
const {
  buildSignals,
} = require('./multiAccount/signals');
const {
  evaluateMultiAccountSignals,
} = require('./multiAccount/signalAssessment');
const {
  buildFreezeGroupId,
  getSecurityFreeze,
} = require('./multiAccount/freezeState');
const {
  createRiskCase,
  getRiskCaseByUserId,
  isMultiAccountRiskCaseRecord,
  listModelRiskCases,
  updateRiskCaseById,
} = require('./multiAccount/riskCaseDocuments');
const {
  updateUsersForFreeze,
} = require('./multiAccount/freezeActions');
const {
  recordSignalHistory,
} = require('./multiAccount/signalRecorder');
const {
  createRewardRollbackActions,
} = require('./multiAccount/rewardRollbackActions');
const {
  getUserData,
  uniqueUsers,
} = require('./multiAccount/userRows');
const {
  findUsersBySignals,
  getUserMapByIds,
  getUsersByIdsDetailed,
} = require('./multiAccount/userQueries');
const {
  buildClusterAssessment,
} = require('./multiAccount/clusterAssessment');

const MULTI_ACCOUNT_RESTRICTION_HOURS = Math.max(
  1,
  Number(process.env.MULTI_ACCOUNT_RESTRICTION_HOURS) || 24
);
const MULTI_ACCOUNT_MAX_ACCOUNTS = Math.max(
  2,
  Number(process.env.MULTI_ACCOUNT_MAX_ACCOUNTS) || 3
);
const MULTI_ACCOUNT_LOCK_REASON = 'multi_account_review';
const MULTI_ACCOUNT_FROZEN_REASON = 'multi_account_group_frozen';
const MULTI_ACCOUNT_FROZEN_STATUS = 'frozen';
const MULTI_ACCOUNT_RISK_SOURCE = 'multi_account';
const MULTI_ACCOUNT_STATUS_WATCH = 'watch';
const MULTI_ACCOUNT_STATUS_HIGH_RISK = 'high_risk';
const MULTI_ACCOUNT_STATUS_FROZEN = 'frozen';
const MULTI_ACCOUNT_STATUS_RESOLVED = 'resolved';

const {
  upsertRiskCasesForAssessment,
} = createRiskCaseUpsert({
  createRiskCase,
  getRiskCaseByUserId,
  updateRiskCaseById,
  riskSource: MULTI_ACCOUNT_RISK_SOURCE,
  watchStatus: MULTI_ACCOUNT_STATUS_WATCH,
  frozenStatus: MULTI_ACCOUNT_STATUS_FROZEN,
});

const {
  repairPendingMultiAccountRiskCases,
} = createRiskCaseRepair({
  createRiskCase,
  listModelRiskCases,
  updateRiskCaseById,
  riskSource: MULTI_ACCOUNT_RISK_SOURCE,
  frozenUserStatus: MULTI_ACCOUNT_FROZEN_STATUS,
  frozenRiskStatus: MULTI_ACCOUNT_STATUS_FROZEN,
});

function cleanText(value) {
  return String(value || '').trim();
}

function toPlainDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function isActiveRestriction(until) {
  const date = toPlainDate(until);
  if (!date) return false;
  return date.getTime() > Date.now();
}

const {
  applyPendingBattleRewardRollback,
} = createRewardRollbackActions({
  getUsersByIdsDetailed,
});

async function analyzeAndMaybeFreeze({
  user,
  signals,
  req,
  eventType = 'login',
}) {
  if (!user?._id) return { detected: false, frozen: false, groupUsers: [user], riskCases: [] };
  const ipIntel = signals?.ipIntel && typeof signals.ipIntel === 'object'
    ? signals.ipIntel
    : await lookupIpIntel(signals?.ip || user?.lastIp || '');
  const prepared = buildSignals({
    ...signals,
    ipIntel,
  });

  const assessmentResult = await evaluateMultiAccountSignals({
    user,
    signals: prepared,
  });

  const reviewedUsers = uniqueUsers([
    user,
    ...assessmentResult.matches.map((row) => row.user),
  ]);

  if (!assessmentResult.matches.length) {
    return {
      detected: false,
      frozen: false,
      currentSignals: prepared,
      groupUsers: reviewedUsers,
      riskCases: [],
      matches: [],
    };
  }

  const clusterAssessment = await buildClusterAssessment({
    primaryUser: user,
    clusterUsers: reviewedUsers,
    assessments: assessmentResult.matches,
    currentSignals: prepared,
  });

  const noteBase = eventType === 'register'
    ? 'automatic_multi_account_check_after_registration'
    : eventType === 'session'
      ? 'automatic_multi_account_check_during_session'
      : 'automatic_multi_account_check_after_login';

  if (!clusterAssessment.shouldFreeze) {
    const riskCases = await upsertRiskCasesForAssessment({
      clusterUsers: reviewedUsers,
      assessments: assessmentResult.matches,
      clusterAssessment,
      currentSignals: prepared,
      eventType,
      frozen: false,
      note: `${noteBase}:review_only`,
      action: 'watch',
    });

    await writeAuthEvent({
      user: user._id,
      email: user.email,
      eventType: 'multi_account_detected',
      result: 'success',
      reason: 'review_only',
      req,
      meta: {
        eventType,
        groupUsers: reviewedUsers.map((row) => ({
          id: row._id,
          email: row.email,
          nickname: row.nickname,
          status: row.status,
        })),
        currentSignals: {
          ip: prepared.ip,
          fingerprint: prepared.fingerprint,
          weakFingerprint: prepared.weakFingerprint,
          profileKey: prepared.profileKey,
        },
        categoryScores: clusterAssessment.categoryScores,
        riskScore: clusterAssessment.riskScore,
        status: clusterAssessment.status,
      },
    });

    return {
      detected: true,
      frozen: false,
      currentSignals: prepared,
      groupUsers: reviewedUsers,
      riskCases,
      matches: assessmentResult.matches,
    };
  }

  const groupId = await updateUsersForFreeze(reviewedUsers, {
    groupId: buildFreezeGroupId(reviewedUsers),
    reason: MULTI_ACCOUNT_FROZEN_REASON,
    note: `${noteBase}:group_frozen`,
    action: 'freeze',
  });

  const riskCases = await upsertRiskCasesForAssessment({
    clusterUsers: reviewedUsers,
    assessments: assessmentResult.matches,
    clusterAssessment: {
      ...clusterAssessment,
      status: MULTI_ACCOUNT_STATUS_FROZEN,
      freezeStatus: 'frozen',
      shouldFreeze: true,
    },
    currentSignals: prepared,
    eventType,
    frozen: true,
    groupId,
    note: `${noteBase}:group_frozen`,
    action: 'freeze',
  });

  await writeAuthEvent({
    user: user._id,
    email: user.email,
    eventType: 'multi_account_group_frozen',
    result: 'failed',
    reason: `group:${groupId}`,
    req,
    meta: {
      eventType,
      groupId,
      groupUsers: reviewedUsers.map((row) => ({
        id: row._id,
        email: row.email,
        nickname: row.nickname,
        status: row.status,
      })),
      currentSignals: {
        ip: prepared.ip,
        fingerprint: prepared.fingerprint,
        weakFingerprint: prepared.weakFingerprint,
        profileKey: prepared.profileKey,
      },
      categoryScores: clusterAssessment.categoryScores,
      riskScore: clusterAssessment.riskScore,
    },
  });

  return {
    detected: true,
    frozen: true,
    groupId,
    currentSignals: prepared,
    groupUsers: reviewedUsers,
    riskCases,
    matches: assessmentResult.matches,
  };
}

async function checkRegistrationAllowance({ signals }) {
  const prepared = buildSignals(signals);
  return {
    allowed: true,
    maxAllowed: MULTI_ACCOUNT_MAX_ACCOUNTS,
    clusterSize: 0,
    matchedUsers: await findUsersBySignals(prepared, { limit: 20 }),
  };
}

async function handlePostRegistrationMultiAccount({ user, req, signals }) {
  const result = await analyzeAndMaybeFreeze({
    user,
    req,
    signals,
    eventType: 'register',
  });
  return {
    detected: Boolean(result.detected),
    frozen: Boolean(result.frozen),
    groupId: result.groupId || '',
    clusterSize: Array.isArray(result.groupUsers) ? result.groupUsers.length : 1,
    relatedUsers: Array.isArray(result.groupUsers)
      ? result.groupUsers.filter((row) => String(row._id) !== String(user?._id || ''))
      : [],
    riskCases: result.riskCases || [],
  };
}

async function handlePostLoginMultiAccount({ user, req, signals }) {
  return analyzeAndMaybeFreeze({
    user,
    req,
    signals,
    eventType: 'login',
  });
}

async function handleAuthenticatedSessionMultiAccount({ user, req, signals }) {
  return analyzeAndMaybeFreeze({
    user,
    req,
    signals,
    eventType: 'session',
  });
}

function isUserFrozen(user) {
  const safeUser = user && typeof user === 'object' ? user : {};
  const data = getUserData(safeUser);
  const freeze = getSecurityFreeze(data);
  return String(safeUser.status || '') === MULTI_ACCOUNT_FROZEN_STATUS
    || String(freeze.status || '') === 'frozen';
}

async function getRiskCaseGroupUsers(riskCaseId) {
  const riskCase = await getDocByModelAndId('RiskCase', riskCaseId);
  if (!riskCase) return { riskCase: null, users: [] };
  if (!isMultiAccountRiskCaseRecord(riskCase)) {
    const error = new Error('Эта карточка не относится к мультиаккаунтам');
    error.status = 400;
    throw error;
  }
  const ids = Array.from(new Set([
    cleanText(riskCase.user),
    ...(Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers.map((item) => cleanText(item)) : []),
  ].filter(Boolean)));
  const users = await getUsersByIdsDetailed(ids);
  return { riskCase, users };
}

async function applyRiskCaseGroupDecision({
  riskCaseId,
  actorId = null,
  decision = 'watch',
  note = '',
}) {
  const { riskCase, users } = await getRiskCaseGroupUsers(riskCaseId);
  if (!riskCase) {
    const error = new Error('Риск-кейс не найден');
    error.status = 404;
    throw error;
  }
  if (!users.length) {
    const error = new Error('Связанные пользователи не найдены');
    error.status = 404;
    throw error;
  }

  const groupId = cleanText(riskCase.groupId || getSecurityFreeze(getUserData(users[0])).groupId || buildFreezeGroupId(users));
  const safeDecision = ['unfreeze', 'watch', 'ban'].includes(String(decision)) ? String(decision) : 'watch';
  await updateUsersForFreeze(users, {
    groupId,
    reason: MULTI_ACCOUNT_FROZEN_REASON,
    actorId,
    note,
    action: safeDecision,
  });

  const rollbackResult = safeDecision === 'ban'
    ? await applyPendingBattleRewardRollback({ riskCase, users, actorId })
    : { rewardRollback: Array.isArray(riskCase?.rewardRollback) ? riskCase.rewardRollback : [], changed: false };

  const nowIso = new Date().toISOString();
  const nextStatus = safeDecision === 'ban'
    ? MULTI_ACCOUNT_STATUS_RESOLVED
    : safeDecision === 'unfreeze'
      ? MULTI_ACCOUNT_STATUS_RESOLVED
      : MULTI_ACCOUNT_STATUS_WATCH;
  const nextFreezeStatus = safeDecision === 'ban'
    ? 'banned'
    : safeDecision === 'unfreeze'
      ? 'unfrozen'
      : 'watch';
  const baseNote = `[${nowIso}] admin_group_decision:${safeDecision}${cleanText(note) ? ` note:${cleanText(note)}` : ''}`;

  const relatedIds = Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers.map((item) => cleanText(item)).filter(Boolean) : [];
  const userIds = Array.from(new Set([cleanText(riskCase.user), ...relatedIds].filter(Boolean)));
  const relatedCases = (await listDocsByModel('RiskCase', {
    dataIn: { user: userIds },
    limit: 1000,
  })).filter((row) => {
    if (!isMultiAccountRiskCaseRecord(row)) return false;
    const id = cleanText(row?.user);
    return userIds.includes(id);
  });

  for (const row of relatedCases) {
    const prevNotes = cleanText(row?.notes);
    // eslint-disable-next-line no-await-in-loop
    await updateRiskCaseById(row._id, {
      status: nextStatus,
      freezeStatus: nextFreezeStatus,
      resolvedBy: actorId || null,
      resolvedAt: nowIso,
      resolutionNote: cleanText(note),
      groupId,
      rewardRollback: rollbackResult.changed
        ? rollbackResult.rewardRollback
        : (Array.isArray(row?.rewardRollback) ? row.rewardRollback : rollbackResult.rewardRollback),
      notes: prevNotes ? `${prevNotes}\n${baseNote}` : baseNote,
      meta: {
        ...(row?.meta && typeof row.meta === 'object' ? row.meta : {}),
        moderatorDecision: safeDecision,
        moderatorDecisionAt: nowIso,
        moderatorDecisionBy: actorId || null,
        rewardRollbackUpdatedAt: rollbackResult.changed ? nowIso : (row?.meta?.rewardRollbackUpdatedAt || null),
      },
    });
  }

  return {
    riskCaseId,
    groupId,
    users: users.map((row) => ({
      _id: row._id,
      email: row.email,
      nickname: row.nickname,
      status: row.status,
    })),
    decision: safeDecision,
    rewardRollbackChanged: Boolean(rollbackResult.changed),
  };
}

async function getSignalHistoryForUsers(userIds = [], { limit = 100 } = {}) {
  return listSignalHistoryByUserIds(userIds, { limit });
}

module.exports = {
  MULTI_ACCOUNT_RESTRICTION_HOURS,
  MULTI_ACCOUNT_MAX_ACCOUNTS,
  MULTI_ACCOUNT_LOCK_REASON,
  MULTI_ACCOUNT_FROZEN_REASON,
  MULTI_ACCOUNT_FROZEN_STATUS,
  buildSignals,
  isActiveRestriction,
  isUserFrozen,
  checkRegistrationAllowance,
  handlePostRegistrationMultiAccount,
  handlePostLoginMultiAccount,
  handleAuthenticatedSessionMultiAccount,
  evaluateAccessRestriction,
  recordSignalHistory,
  lookupIpIntel,
  applyRiskCaseGroupDecision,
  getRiskCaseGroupUsers,
  getSignalHistoryForUsers,
  sanitizeRewardRollbackEntries,
  repairPendingMultiAccountRiskCases,
};
