const {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildEvidenceEntry,
} = require('./evidenceScoring');

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

function appendEconomyEvidence(evidence, {
  solarShareRows = [],
  battleRewardRows = [],
  userIds = [],
  parallelBattleDetails = [],
  switchTransitions = [],
} = {}) {
  const economyByRecipient = new Map();
  (Array.isArray(solarShareRows) ? solarShareRows : []).forEach((row) => {
    const recipientId = cleanText(row?.recipientId);
    const senderId = cleanText(row?.userId);
    if (!recipientId || !senderId || senderId === recipientId) return;
    if (!userIds.includes(recipientId)) return;
    if (!economyByRecipient.has(recipientId)) economyByRecipient.set(recipientId, []);
    economyByRecipient.get(recipientId).push(row);
  });

  const funnelingTargets = [];
  economyByRecipient.forEach((rows, recipientId) => {
    const totalLm = rows.reduce((sum, row) => sum + safeNumber(row?.amountLm), 0);
    const uniqueSenders = uniq(rows.map((row) => cleanText(row?.userId)).filter(Boolean));
    if (uniqueSenders.length < 2 || totalLm < 80) return;
    funnelingTargets.push({
      recipientId,
      totalLm: round(totalLm, 3),
      senderCount: uniqueSenders.length,
      transfers: rows.length,
      latestAt: sortByDate(rows, 'createdAt').slice(-1)[0]?.createdAt || null,
    });
  });
  if (funnelingTargets.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'economy_funneling',
      category: 'economy',
      score: Math.min(32, DETAIL_SCORES.economy_funneling + funnelingTargets.length * 3),
      summary: 'Выгода стекается на один связанный аккаунт',
      count: funnelingTargets.length,
      matchedUserIds: uniq(funnelingTargets.map((row) => row.recipientId)),
      firstSeenAt: sortByDate(solarShareRows, 'createdAt')[0]?.createdAt || null,
      lastSeenAt: sortByDate(solarShareRows, 'createdAt').slice(-1)[0]?.createdAt || null,
      details: { targets: funnelingTargets.slice(0, 10) },
    }));
  }

  const rewardByBattle = new Map();
  (Array.isArray(battleRewardRows) ? battleRewardRows : []).forEach((row) => {
    const battleId = cleanText(row?.battleId);
    if (!battleId) return;
    if (!rewardByBattle.has(battleId)) rewardByBattle.set(battleId, new Set());
    rewardByBattle.get(battleId).add(cleanText(row?.userId));
  });
  const serialBattleFarming = Array.from(rewardByBattle.entries())
    .filter(([, ids]) => ids.size >= 2)
    .map(([battleId, ids]) => ({ battleId, userIds: Array.from(ids) }));
  const hasBattleContext = (Array.isArray(parallelBattleDetails) ? parallelBattleDetails : []).length
    || (Array.isArray(switchTransitions) ? switchTransitions : []).length;
  if (serialBattleFarming.length >= 3 && hasBattleContext) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'serial_battle_farming',
      category: 'economy',
      score: Math.min(24, DETAIL_SCORES.serial_battle_farming + serialBattleFarming.length),
      summary: 'Группа неоднократно фармила награду боя на нескольких аккаунтах',
      count: serialBattleFarming.length,
      matchedUserIds: uniq(serialBattleFarming.flatMap((row) => row.userIds)),
      details: { battles: serialBattleFarming.slice(0, 20) },
    }));
  }

  return evidence;
}

module.exports = {
  appendEconomyEvidence,
};
