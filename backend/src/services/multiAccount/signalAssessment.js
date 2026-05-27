const {
  findSignalHistoryMatches,
  summarizeHistoryMatches,
} = require('../signalHistoryService');
const {
  buildAssessmentReasons,
} = require('./assessmentReasons');
const {
  buildSignals,
  normalizeSignalValue,
} = require('./signals');
const {
  findUsersBySignals,
  getUsersByIdsDetailed,
} = require('./userQueries');

function cleanText(value) {
  return String(value || '').trim();
}

function createSignalAssessment({
  buildAssessmentReasons: buildAssessmentReasonsDep = buildAssessmentReasons,
  buildSignals: buildSignalsDep = buildSignals,
  findSignalHistoryMatches: findSignalHistoryMatchesDep = findSignalHistoryMatches,
  findUsersBySignals: findUsersBySignalsDep = findUsersBySignals,
  getUsersByIdsDetailed: getUsersByIdsDetailedDep = getUsersByIdsDetailed,
  summarizeHistoryMatches: summarizeHistoryMatchesDep = summarizeHistoryMatches,
} = {}) {
  async function evaluateMultiAccountSignals({
    user,
    signals,
  }) {
    const prepared = buildSignalsDep(signals);
    const directMatches = await findUsersBySignalsDep(prepared, {
      excludeUserId: user?._id,
      limit: 100,
    });
    const historyRows = await findSignalHistoryMatchesDep(prepared, {
      excludeUserId: user?._id,
      limit: 300,
    });

    const directMap = new Map();
    directMatches.forEach((row) => directMap.set(String(row._id), row));
    const historyUserIds = Array.from(new Set(historyRows.map((row) => cleanText(row.userId)).filter(Boolean)));
    const missingIds = historyUserIds.filter((id) => !directMap.has(id));
    const extraUsers = await getUsersByIdsDetailedDep(missingIds);
    extraUsers.forEach((row) => directMap.set(String(row._id), row));

    const out = [];
    for (const [userId, matchedUser] of directMap.entries()) {
      const rowsForUser = historyRows.filter((row) => cleanText(row.userId) === userId);
      const matchSummary = summarizeHistoryMatchesDep(rowsForUser, prepared);

      if (prepared.fingerprint && normalizeSignalValue(matchedUser?.lastFingerprint) === prepared.fingerprint) {
        matchSummary.fingerprint.push({
          id: `latest_fp:${userId}`,
          userId,
          fingerprint: prepared.fingerprint,
          ipIntel: null,
        });
      }
      if (prepared.deviceId && normalizeSignalValue(matchedUser?.lastDeviceId) === prepared.deviceId) {
        matchSummary.deviceId.push({
          id: `latest_device:${userId}`,
          userId,
          deviceId: prepared.deviceId,
        });
      }
      if (prepared.weakFingerprint && normalizeSignalValue(matchedUser?.lastWeakFingerprint) === prepared.weakFingerprint) {
        matchSummary.weakFingerprint.push({
          id: `latest_weak:${userId}`,
          userId,
          weakFingerprint: prepared.weakFingerprint,
          ipIntel: matchedUser?.lastIpIntel || null,
        });
      }
      if (prepared.ip && normalizeSignalValue(matchedUser?.lastIp) === prepared.ip) {
        matchSummary.ip.push({
          id: `latest_ip:${userId}`,
          userId,
          ip: prepared.ip,
        });
      }

      const assessment = buildAssessmentReasonsDep(prepared, matchSummary, prepared.ipIntel, matchedUser);
      if (!assessment.needsReview) continue;
      out.push({
        user: matchedUser,
        history: rowsForUser,
        ...assessment,
      });
    }

    out.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    return {
      currentSignals: prepared,
      matches: out,
      shouldFreeze: out.some((row) => row.shouldFreeze),
    };
  }

  return {
    evaluateMultiAccountSignals,
  };
}

const defaultAssessment = createSignalAssessment();

module.exports = {
  createSignalAssessment,
  evaluateMultiAccountSignals: defaultAssessment.evaluateMultiAccountSignals,
};
