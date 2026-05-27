const {
  listSignalHistoryByUserIds: defaultListSignalHistoryByUserIds,
} = require('../signalHistoryService');
const {
  buildRewardRollbackEntries,
} = require('./rewardRollback');
const {
  buildClusterRiskSignals,
} = require('./riskSignals');
const {
  buildCategoryScores,
  buildRiskScoreDetailed,
} = require('./evidenceScoring');
const {
  appendAssessmentEvidence,
} = require('./assessmentEvidence');
const {
  appendProfileNetworkEvidence,
} = require('./profileNetworkEvidence');
const {
  appendSessionBehaviorEvidence,
} = require('./sessionBehaviorEvidence');
const {
  appendBattleEvidence,
} = require('./battleEvidence');
const {
  appendEconomyEvidence,
} = require('./economyEvidence');
const {
  HIGH_RISK_SCORE_THRESHOLD,
  qualifiesAutomaticFreeze,
  resolveClusterStatus,
} = require('./riskDecision');
const {
  listBattleDocsSince: defaultListBattleDocsSince,
  listBattleRewardTransactionsByUserIds: defaultListBattleRewardTransactionsByUserIds,
  listSignalHistoryByIps: defaultListSignalHistoryByIps,
  listSolarShareActivitiesByUserIds: defaultListSolarShareActivitiesByUserIds,
  listUserSessionsByUserIds: defaultListUserSessionsByUserIds,
} = require('./dataQueries');
const {
  uniqueUsers,
} = require('./userRows');

function cleanText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const n = safeNumber(value);
  const power = 10 ** digits;
  return Math.round(n * power) / power;
}

function uniq(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function resolveNowMs(now) {
  const value = typeof now === 'function' ? now() : Date.now();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : Date.now();
}

function getWindowSince({ days = 30, now = Date.now } = {}) {
  const safeDays = Math.max(1, Number(days) || 30);
  return new Date(resolveNowMs(now) - safeDays * 24 * 60 * 60 * 1000);
}

function createClusterAssessmentBuilder({
  listSignalHistoryByUserIds = defaultListSignalHistoryByUserIds,
  listUserSessionsByUserIds = defaultListUserSessionsByUserIds,
  listBattleDocsSince = defaultListBattleDocsSince,
  listSolarShareActivitiesByUserIds = defaultListSolarShareActivitiesByUserIds,
  listBattleRewardTransactionsByUserIds = defaultListBattleRewardTransactionsByUserIds,
  listSignalHistoryByIps = defaultListSignalHistoryByIps,
  windowDays = 30,
  maxDevicesPerIp = 4,
  watchStatus = 'watch',
  highRiskStatus = 'high_risk',
  frozenStatus = 'frozen',
  now = Date.now,
} = {}) {
  async function buildClusterAssessment({
    primaryUser = null,
    clusterUsers = [],
    assessments = [],
    currentSignals = {},
  }) {
    const safeUsers = uniqueUsers(clusterUsers).filter(Boolean);
    const userIds = safeUsers.map((row) => cleanText(row?._id)).filter(Boolean);
    if (userIds.length < 2) {
      return {
        riskScore: 0,
        categoryScores: buildCategoryScores([]),
        riskScoreDetailed: [],
        evidence: [],
        status: watchStatus,
        freezeStatus: 'watch',
        shouldFreeze: false,
        signals: buildClusterRiskSignals({ currentSignals, evidence: [], clusterSize: safeUsers.length }),
        rewardRollback: [],
      };
    }

    const since = getWindowSince({ days: windowDays, now });
    const currentUserId = cleanText(primaryUser?._id || primaryUser?.id);
    const [
      signalHistory,
      sessions,
      battleDocs,
      solarShareRows,
      battleRewardRows,
      crowdedIpRows,
    ] = await Promise.all([
      listSignalHistoryByUserIds(userIds, { limit: 1000 }),
      listUserSessionsByUserIds(userIds, { since }),
      listBattleDocsSince(since),
      listSolarShareActivitiesByUserIds(userIds, { since }),
      listBattleRewardTransactionsByUserIds(userIds, { since }),
      listSignalHistoryByIps(uniq([
        cleanText(currentSignals.ip),
        ...safeUsers.map((row) => cleanText(row?.lastIp)),
      ].filter(Boolean)), { since }),
    ]);

    const userMap = new Map(safeUsers.map((row) => [cleanText(row?._id), row]));
    const evidence = [];

    appendAssessmentEvidence(evidence, assessments);
    appendProfileNetworkEvidence(evidence, {
      userIds,
      safeUsers,
      currentUserId,
      currentSignals,
      signalHistory,
      sessions,
    });

    const {
      switchTransitions,
      parallelSessionRows,
    } = appendSessionBehaviorEvidence(evidence, {
      signalHistory,
      sessions,
      crowdedIpRows,
      userIds,
      maxDevicesPerIp,
    });

    const {
      parallelBattleDetails,
    } = appendBattleEvidence(evidence, {
      battleDocs,
      userIds,
      parallelSessionRows,
    });

    appendEconomyEvidence(evidence, {
      solarShareRows,
      battleRewardRows,
      userIds,
      parallelBattleDetails,
      switchTransitions,
    });

    const riskScore = round(
      (Array.isArray(evidence) ? evidence : [])
        .reduce((sum, entry) => sum + safeNumber(entry?.score), 0),
      3
    );
    const shouldFreeze = qualifiesAutomaticFreeze({ riskScore, evidence });
    const freezeStatus = shouldFreeze
      ? frozenStatus
      : (riskScore >= HIGH_RISK_SCORE_THRESHOLD ? highRiskStatus : 'watch');
    const status = resolveClusterStatus({
      riskScore,
      shouldFreeze,
      freezeStatus: shouldFreeze ? frozenStatus : '',
    });
    const riskScoreDetailed = buildRiskScoreDetailed(evidence);

    return {
      riskScore,
      categoryScores: buildCategoryScores(evidence),
      riskScoreDetailed,
      evidence: riskScoreDetailed,
      status,
      freezeStatus,
      shouldFreeze,
      signals: buildClusterRiskSignals({
        currentSignals,
        evidence,
        clusterSize: safeUsers.length,
      }),
      rewardRollback: buildRewardRollbackEntries(battleRewardRows, userMap, evidence),
    };
  }

  return {
    buildClusterAssessment,
  };
}

const {
  buildClusterAssessment,
} = createClusterAssessmentBuilder();

module.exports = {
  buildClusterAssessment,
  createClusterAssessmentBuilder,
  getWindowSince,
};
