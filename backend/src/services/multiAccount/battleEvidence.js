const {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildEvidenceEntry,
} = require('./evidenceScoring');
const {
  buildBattleProfiles,
} = require('./battleProfiles');

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

function sortByDate(rows = [], field = 'createdAt') {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
}

function appendBattleEvidence(evidence, {
  battleDocs = [],
  userIds = [],
  parallelSessionRows = [],
} = {}) {
  const sharedBattleRows = [];
  const sharedBattleIds = new Map();

  (Array.isArray(battleDocs) ? battleDocs : []).forEach((battle) => {
    const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
    attendance.forEach((entry) => {
      const userId = cleanText(entry?.user?._id || entry?.user);
      if (!userIds.includes(userId)) return;
      const happenedAt = entry?.joinedAt || battle?.endsAt || battle?.updatedAt || battle?.createdAt || null;
      const row = {
        userId,
        battleId: cleanText(battle?._id),
        happenedAt,
        automationTelemetry: entry?.automationTelemetry || {},
      };
      sharedBattleRows.push(row);
      if (!sharedBattleIds.has(row.battleId)) sharedBattleIds.set(row.battleId, new Set());
      sharedBattleIds.get(row.battleId).add(userId);
    });
  });

  const battleProfiles = buildBattleProfiles(sharedBattleRows);
  const suspiciousBattleUsers = [];
  battleProfiles.forEach((profile, userId) => {
    if (
      (profile.shots >= 120 && profile.staticRatio >= 0.72)
      || (profile.intervalCount >= 80 && profile.intervalCv > 0 && profile.intervalCv <= 0.08)
      || profile.hiddenTabShotCount >= 5
    ) {
      suspiciousBattleUsers.push({
        userId,
        shots: profile.shots,
        staticRatio: profile.staticRatio,
        intervalCv: profile.intervalCv,
        hiddenTabShotCount: profile.hiddenTabShotCount,
        avgCursorDistancePx: profile.avgCursorDistancePx,
        battleIds: Array.isArray(profile.battleIds) ? profile.battleIds.slice(0, 50) : [],
      });
    }
  });
  if (suspiciousBattleUsers.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'battle_pattern',
      category: 'battle',
      score: Math.min(30, DETAIL_SCORES.battle_pattern + suspiciousBattleUsers.length * 3),
      summary: 'У группы есть боевые шаблоны, похожие на кликер или автоматизацию',
      count: suspiciousBattleUsers.length,
      matchedUserIds: suspiciousBattleUsers.map((row) => row.userId),
      lastSeenAt: sortByDate(sharedBattleRows, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { users: suspiciousBattleUsers.slice(0, 10) },
    }));
  }

  const parallelBattleDetails = Array.from(sharedBattleIds.entries())
    .filter(([, ids]) => ids.size >= 2)
    .map(([battleId, ids]) => ({
      battleId,
      userIds: Array.from(ids),
    }));
  if (parallelBattleDetails.length && (Array.isArray(parallelSessionRows) ? parallelSessionRows : []).length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'parallel_battle',
      category: 'battle',
      score: Math.min(24, DETAIL_SCORES.parallel_battle + parallelBattleDetails.length * 2),
      summary: 'Связанные аккаунты участвовали в боях параллельно',
      count: parallelBattleDetails.length,
      matchedUserIds: uniq(parallelBattleDetails.flatMap((row) => row.userIds)),
      details: { battles: parallelBattleDetails.slice(0, 20) },
    }));
  }

  const battleSignatureMatches = [];
  const battleProfilesList = Array.from(battleProfiles.values());
  for (let index = 0; index < battleProfilesList.length; index += 1) {
    for (let inner = index + 1; inner < battleProfilesList.length; inner += 1) {
      const left = battleProfilesList[index];
      const right = battleProfilesList[inner];
      if (left.shots < 120 || right.shots < 120) continue;
      const closeMetrics = [
        Math.abs(left.staticRatio - right.staticRatio) <= 0.08,
        Math.abs(left.intervalCv - right.intervalCv) <= 0.03,
        Math.abs(left.hiddenRatio - right.hiddenRatio) <= 0.03,
        Math.abs(left.screenWidth - right.screenWidth) <= 0.08,
        Math.abs(left.screenHeight - right.screenHeight) <= 0.08,
        Math.abs(left.avgCursorDistancePx - right.avgCursorDistancePx) <= 20,
      ].filter(Boolean).length;
      if (closeMetrics < 4) continue;
      battleSignatureMatches.push({
        leftUserId: left.userId,
        rightUserId: right.userId,
        closeMetrics,
        staticDiff: round(Math.abs(left.staticRatio - right.staticRatio), 5),
        intervalDiff: round(Math.abs(left.intervalCv - right.intervalCv), 5),
        battleIds: uniq([
          ...(Array.isArray(left.battleIds) ? left.battleIds : []),
          ...(Array.isArray(right.battleIds) ? right.battleIds : []),
        ]).slice(0, 50),
      });
    }
  }
  if (battleSignatureMatches.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'battle_signature_cluster',
      category: 'battle',
      score: Math.min(30, DETAIL_SCORES.battle_signature_cluster + battleSignatureMatches.length * 2),
      summary: 'У связанных аккаунтов слишком похожая боевая сигнатура',
      count: battleSignatureMatches.length,
      matchedUserIds: uniq(battleSignatureMatches.flatMap((row) => [row.leftUserId, row.rightUserId])),
      details: { matches: battleSignatureMatches.slice(0, 20) },
    }));
  }

  return {
    parallelBattleDetails,
  };
}

module.exports = {
  appendBattleEvidence,
};
