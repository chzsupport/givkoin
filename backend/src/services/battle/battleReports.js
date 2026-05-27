const { computeBattleRewardK } = require('../../utils/battleReward');

function normalizeUniqueIds(list, { limit = 5000 } = {}) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(list) ? list : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeWeakZoneHitsMap(value, { limit = 2000 } = {}) {
  if (!value || typeof value !== 'object') return {};
  const out = {};
  let used = 0;
  for (const [rawId, rawCount] of Object.entries(value)) {
    if (used >= limit) break;
    const id = String(rawId || '').trim();
    if (!id) continue;
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if (!count) continue;
    out[id] = count;
    used += 1;
  }
  return out;
}

function normalizeVoiceResults(value, { limit = 2000 } = {}) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(value) ? value : []) {
    if (out.length >= limit) break;
    const id = String(row?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      text: String(row?.text || '').trim() === 'СТОЙ' ? 'СТОЙ' : 'СТРЕЛЯЙ',
      acted: Boolean(row?.acted),
      success: Boolean(row?.success),
    });
  }
  return out;
}

function createEmptyReportedState(intervalSeconds = 60) {
  const safeIntervalSeconds = Math.max(1, Math.floor(Number(intervalSeconds) || 60));
  return {
    intervalSeconds: safeIntervalSeconds,
    shotsByWeapon: { 1: 0, 2: 0, 3: 0 },
    hitsByWeapon: { 1: 0, 2: 0, 3: 0 },
    hits: 0,
    damage: 0,
    damageDelta: 0,
    totalShots: 0,
    totalHits: 0,
    lumensSpent: 0,
    lumensGained: 0,
    crystalsCollected: 0,
    sparkIds: [],
    weakZoneHitsById: {},
    voiceResults: [],
    baddieDestroyedIds: [],
    baddieDamage: 0,
    maxComboHits: 0,
    maxComboMultiplier: 1,
    heldComboX2MaxDuration: 0,
    reachedX1_5InFirst30s: false,
    phoenixStage: 0,
    lumensSpentWeapon3First2Min: 0,
    lumensSpentOtherFirst2Min: 0,
    damageAfterZeroLumens: 0,
  };
}

function normalizeReportedState(value, intervalSeconds = 60) {
  const safeValue = value && typeof value === 'object' ? value : {};
  const shotsByWeapon = safeValue.shotsByWeapon && typeof safeValue.shotsByWeapon === 'object'
    ? safeValue.shotsByWeapon
    : {};
  const hitsByWeapon = safeValue.hitsByWeapon && typeof safeValue.hitsByWeapon === 'object'
    ? safeValue.hitsByWeapon
    : {};
  const normalized = createEmptyReportedState(Number(safeValue.intervalSeconds) || intervalSeconds || 60);

  normalized.shotsByWeapon = {
    1: Math.max(0, Math.floor(Number(shotsByWeapon[1] ?? shotsByWeapon.weapon1) || 0)),
    2: Math.max(0, Math.floor(Number(shotsByWeapon[2] ?? shotsByWeapon.weapon2) || 0)),
    3: Math.max(0, Math.floor(Number(shotsByWeapon[3] ?? shotsByWeapon.weapon3) || 0)),
  };
  normalized.hitsByWeapon = {
    1: Math.max(0, Math.floor(Number(hitsByWeapon[1] ?? hitsByWeapon.weapon1) || 0)),
    2: Math.max(0, Math.floor(Number(hitsByWeapon[2] ?? hitsByWeapon.weapon2) || 0)),
    3: Math.max(0, Math.floor(Number(hitsByWeapon[3] ?? hitsByWeapon.weapon3) || 0)),
  };
  normalized.hits = Math.max(0, Math.floor(Number(safeValue.hits) || 0));
  normalized.damageDelta = Math.max(0, Math.floor(Number(safeValue.damageDelta ?? safeValue.damage) || 0));
  normalized.damage = normalized.damageDelta;
  normalized.totalShots = normalized.shotsByWeapon[1] + normalized.shotsByWeapon[2] + normalized.shotsByWeapon[3];
  normalized.totalHits = normalized.hits;
  normalized.lumensSpent = Math.max(0, Math.floor(Number(safeValue.lumensSpent) || 0));
  normalized.lumensGained = Math.max(0, Math.floor(Number(safeValue.lumensGained) || 0));
  normalized.crystalsCollected = Math.max(0, Math.floor(Number(safeValue.crystalsCollected) || 0));
  normalized.sparkIds = normalizeUniqueIds(safeValue.sparkIds, { limit: 1000 });
  normalized.weakZoneHitsById = normalizeWeakZoneHitsMap(safeValue.weakZoneHitsById, { limit: 1000 });
  normalized.voiceResults = normalizeVoiceResults(safeValue.voiceResults, { limit: 1000 });
  normalized.baddieDestroyedIds = normalizeUniqueIds(safeValue.baddieDestroyedIds, { limit: 2000 });
  normalized.baddieDamage = Math.max(0, Math.floor(Number(safeValue.baddieDamage) || 0));
  normalized.maxComboHits = Math.max(0, Math.floor(Number(safeValue.maxComboHits) || 0));
  normalized.maxComboMultiplier = Math.max(1, Number(safeValue.maxComboMultiplier) || 1);
  normalized.heldComboX2MaxDuration = Math.max(0, Math.floor(Number(safeValue.heldComboX2MaxDuration) || 0));
  normalized.reachedX1_5InFirst30s = Boolean(safeValue.reachedX1_5InFirst30s);
  normalized.phoenixStage = Math.max(0, Math.floor(Number(safeValue.phoenixStage) || 0));
  normalized.lumensSpentWeapon3First2Min = Math.max(0, Math.floor(Number(safeValue.lumensSpentWeapon3First2Min) || 0));
  normalized.lumensSpentOtherFirst2Min = Math.max(0, Math.floor(Number(safeValue.lumensSpentOtherFirst2Min) || 0));
  normalized.damageAfterZeroLumens = Math.max(0, Math.floor(Number(safeValue.damageAfterZeroLumens) || 0));

  return normalized;
}

function mergeWeakZoneHitsMaps(base = {}, chunk = {}, { limit = 1000 } = {}) {
  const merged = { ...normalizeWeakZoneHitsMap(base, { limit }) };
  for (const [key, value] of Object.entries(normalizeWeakZoneHitsMap(chunk, { limit }))) {
    merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
  }
  return normalizeWeakZoneHitsMap(merged, { limit });
}

function mergeVoiceResults(base = [], chunk = [], { limit = 1000 } = {}) {
  const map = new Map();
  for (const row of normalizeVoiceResults(base, { limit })) {
    map.set(row.id, row);
  }
  for (const row of normalizeVoiceResults(chunk, { limit })) {
    map.set(row.id, row);
  }
  return Array.from(map.values()).slice(0, limit);
}

function mergeReportedState(current, chunk, intervalSeconds = 60) {
  const base = normalizeReportedState(current, intervalSeconds);
  const incoming = normalizeReportedState(chunk, base.intervalSeconds || intervalSeconds || 60);
  const merged = createEmptyReportedState(base.intervalSeconds || incoming.intervalSeconds || 60);

  merged.shotsByWeapon = {
    1: (Number(base.shotsByWeapon?.[1]) || 0) + (Number(incoming.shotsByWeapon?.[1]) || 0),
    2: (Number(base.shotsByWeapon?.[2]) || 0) + (Number(incoming.shotsByWeapon?.[2]) || 0),
    3: (Number(base.shotsByWeapon?.[3]) || 0) + (Number(incoming.shotsByWeapon?.[3]) || 0),
  };
  merged.hitsByWeapon = {
    1: (Number(base.hitsByWeapon?.[1]) || 0) + (Number(incoming.hitsByWeapon?.[1]) || 0),
    2: (Number(base.hitsByWeapon?.[2]) || 0) + (Number(incoming.hitsByWeapon?.[2]) || 0),
    3: (Number(base.hitsByWeapon?.[3]) || 0) + (Number(incoming.hitsByWeapon?.[3]) || 0),
  };
  merged.hits = (Number(base.hits) || 0) + (Number(incoming.hits) || 0);
  merged.damageDelta = (Number(base.damageDelta) || 0) + (Number(incoming.damageDelta) || 0);
  merged.damage = merged.damageDelta;
  merged.totalShots = merged.shotsByWeapon[1] + merged.shotsByWeapon[2] + merged.shotsByWeapon[3];
  merged.totalHits = merged.hits;
  merged.lumensSpent = (Number(base.lumensSpent) || 0) + (Number(incoming.lumensSpent) || 0);
  merged.lumensGained = (Number(base.lumensGained) || 0) + (Number(incoming.lumensGained) || 0);
  merged.crystalsCollected = (Number(base.crystalsCollected) || 0) + (Number(incoming.crystalsCollected) || 0);
  merged.sparkIds = normalizeUniqueIds([...(base.sparkIds || []), ...(incoming.sparkIds || [])], { limit: 1000 });
  merged.weakZoneHitsById = mergeWeakZoneHitsMaps(base.weakZoneHitsById, incoming.weakZoneHitsById, { limit: 1000 });
  merged.voiceResults = mergeVoiceResults(base.voiceResults, incoming.voiceResults, { limit: 1000 });
  merged.baddieDestroyedIds = normalizeUniqueIds([...(base.baddieDestroyedIds || []), ...(incoming.baddieDestroyedIds || [])], { limit: 2000 });
  merged.baddieDamage = (Number(base.baddieDamage) || 0) + (Number(incoming.baddieDamage) || 0);
  merged.maxComboHits = Math.max(Number(base.maxComboHits) || 0, Number(incoming.maxComboHits) || 0);
  merged.maxComboMultiplier = Math.max(Number(base.maxComboMultiplier) || 1, Number(incoming.maxComboMultiplier) || 1);
  merged.heldComboX2MaxDuration = Math.max(Number(base.heldComboX2MaxDuration) || 0, Number(incoming.heldComboX2MaxDuration) || 0);
  merged.reachedX1_5InFirst30s = Boolean(base.reachedX1_5InFirst30s || incoming.reachedX1_5InFirst30s);
  merged.phoenixStage = Math.max(Number(base.phoenixStage) || 0, Number(incoming.phoenixStage) || 0);
  merged.lumensSpentWeapon3First2Min = (Number(base.lumensSpentWeapon3First2Min) || 0) + (Number(incoming.lumensSpentWeapon3First2Min) || 0);
  merged.lumensSpentOtherFirst2Min = (Number(base.lumensSpentOtherFirst2Min) || 0) + (Number(incoming.lumensSpentOtherFirst2Min) || 0);
  merged.damageAfterZeroLumens = (Number(base.damageAfterZeroLumens) || 0) + (Number(incoming.damageAfterZeroLumens) || 0);

  return merged;
}

function buildLatestFinalReportsMap(rows = []) {
  const finalReportsByUserId = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const userId = String(row?.userId || row?.user || '').trim();
    if (!userId) continue;
    const current = finalReportsByUserId.get(userId);
    const currentSequence = Math.max(0, Math.floor(Number(current?.reportSequence) || 0));
    const nextSequence = Math.max(0, Math.floor(Number(row?.reportSequence) || 0));
    if (!current || nextSequence >= currentSequence) {
      finalReportsByUserId.set(userId, row);
    }
  }
  return finalReportsByUserId;
}

function buildFinalizedAttendanceEntry(row, finalReportState = null) {
  const userId = String(row?.user || '').trim();
  if (!userId) return row;

  const finalReportSequence = Math.max(0, Math.floor(Number(finalReportState?.reportSequence) || 0));
  const currentAcceptedSequence = Math.max(0, Math.floor(Number(row?.lastAcceptedReportSequence) || 0));
  const shouldMergeFinalReport = Boolean(finalReportState?.report) && finalReportSequence > currentAcceptedSequence;
  const hasAcceptedFinalReport = Boolean(finalReportState) || Boolean(row?.finalReportAt);
  const reported = shouldMergeFinalReport
    ? mergeReportedState(row?.reported, finalReportState.report, row?.syncIntervalSeconds || 60)
    : (row?.reported && typeof row.reported === 'object' ? row.reported : null);

  const sparkIds = normalizeUniqueIds(reported?.sparkIds, { limit: 1000 });
  const weakZoneHitsById = normalizeWeakZoneHitsMap(reported?.weakZoneHitsById, { limit: 1000 });
  const voiceResults = normalizeVoiceResults(reported?.voiceResults, { limit: 1000 });
  const baddieDestroyedIds = normalizeUniqueIds(reported?.baddieDestroyedIds, { limit: 2000 });
  const reportedBaddieDamage = Math.max(0, Math.floor(Number(reported?.baddieDamage) || 0));
  const hitsByWeaponRaw = reported?.hitsByWeapon && typeof reported.hitsByWeapon === 'object'
    ? reported.hitsByWeapon
    : {};
  const hitsByWeapon = {
    1: Math.max(0, Math.floor(Number(hitsByWeaponRaw[1] ?? hitsByWeaponRaw.weapon1) || 0)),
    2: Math.max(0, Math.floor(Number(hitsByWeaponRaw[2] ?? hitsByWeaponRaw.weapon2) || 0)),
    3: Math.max(0, Math.floor(Number(hitsByWeaponRaw[3] ?? hitsByWeaponRaw.weapon3) || 0)),
  };
  const maxComboHits = Math.max(0, Math.floor(Number(reported?.maxComboHits) || 0));
  const maxComboMultiplier = Math.max(1, Number(reported?.maxComboMultiplier) || 1);
  const heldComboX2MaxDuration = Math.max(0, Math.floor(Number(reported?.heldComboX2MaxDuration) || 0));
  const reachedX1_5InFirst30s = Boolean(reported?.reachedX1_5InFirst30s);
  const phoenixStage = Math.max(0, Math.floor(Number(reported?.phoenixStage) || 0));
  const lumensSpentWeapon3First2Min = Math.max(0, Math.floor(Number(reported?.lumensSpentWeapon3First2Min) || 0));
  const lumensSpentOtherFirst2Min = Math.max(0, Math.floor(Number(reported?.lumensSpentOtherFirst2Min) || 0));
  const damageAfterZeroLumens = Math.max(0, Math.floor(Number(reported?.damageAfterZeroLumens) || 0));

  const weakZoneHits = Object.values(weakZoneHitsById).reduce((sum, value) => sum + value, 0);
  const totalHitsByWeapon = hitsByWeapon[1] + hitsByWeapon[2] + hitsByWeapon[3];
  const reportedTotalHits = Math.max(0, Math.floor(Number(reported?.totalHits ?? reported?.hits) || totalHitsByWeapon));
  const safeWeakZoneHits = Math.min(weakZoneHits, reportedTotalHits);
  const safeNonWeakZoneHits = Math.max(0, reportedTotalHits - safeWeakZoneHits);

  let voiceCommandsSuccess = 0;
  let voiceCommandsSilenceSuccess = 0;
  let voiceCommandsAttackSuccess = 0;
  let voiceCommandsConsecutive = 0;
  let voiceCommandsTotalAttempts = 0;
  let bestVoiceConsecutive = 0;
  const voiceCommandsHistory = [];
  voiceResults.forEach((voiceRow) => {
    const safeSuccess = Boolean(voiceRow.success);
    voiceCommandsHistory.push(safeSuccess);
    voiceCommandsTotalAttempts += 1;
    if (safeSuccess) {
      voiceCommandsSuccess += 1;
      voiceCommandsConsecutive += 1;
      if (voiceRow.text === 'СТРЕЛЯЙ') voiceCommandsSilenceSuccess += 1;
      if (voiceRow.text === 'СТОЙ') voiceCommandsAttackSuccess += 1;
    } else {
      voiceCommandsConsecutive = 0;
    }
    bestVoiceConsecutive = Math.max(bestVoiceConsecutive, voiceCommandsConsecutive);
  });

  const next = { ...(row || {}) };
  if (reported) {
    next.reported = reported;
    next.damage = Math.max(0, Math.floor(Number(reported?.damageDelta ?? reported?.damage) || 0));
    next.totalShots = Math.max(0, Math.floor(Number(reported?.totalShots) || 0));
    next.totalHits = reportedTotalHits;
    next.lumensSpentTotal = Math.max(0, Math.floor(Number(reported?.lumensSpent) || 0));
    next.crystalsCollected = Math.max(0, Math.floor(Number(reported?.crystalsCollected) || sparkIds.length || 0));
    next.lumensGainedTotal = Math.max(0, Math.floor(Number(reported?.lumensGained) || 0));
    next.sparkIds = sparkIds;
    next.weakZoneHits = safeWeakZoneHits;
    next.nonWeakZoneHits = safeNonWeakZoneHits;
    next.weapon2Hits = hitsByWeapon[2];
    next.weapon3Hits = hitsByWeapon[3];
    next.nonBaseWeaponHits = hitsByWeapon[2] + hitsByWeapon[3];
    next.voiceCommandsSuccess = voiceCommandsSuccess;
    next.voiceCommandsSilenceSuccess = voiceCommandsSilenceSuccess;
    next.voiceCommandsAttackSuccess = voiceCommandsAttackSuccess;
    next.voiceCommandsConsecutive = bestVoiceConsecutive;
    next.voiceCommandsTotalAttempts = voiceCommandsTotalAttempts;
    next.voiceCommandsHistory = voiceCommandsHistory;
    next.baddieDestroyedIds = baddieDestroyedIds;
    next.darknessDamageFromBaddies = reportedBaddieDamage;
    next.comboHits = maxComboHits;
    next.comboMultiplier = maxComboMultiplier;
    next.heldComboX2MaxDuration = heldComboX2MaxDuration;
    next.reachedX1_5InFirst30s = reachedX1_5InFirst30s;
    next.phoenixStage = phoenixStage;
    next.lumensSpentWeapon3First2Min = lumensSpentWeapon3First2Min;
    next.lumensSpentOtherFirst2Min = lumensSpentOtherFirst2Min;
    next.damageAfterZeroLumens = damageAfterZeroLumens;
    next.finalReportAt = shouldMergeFinalReport
      ? (finalReportState.acceptedAt || row?.finalReportAt || row?.lastClientSyncAt || new Date().toISOString())
      : (finalReportState?.acceptedAt || row?.finalReportAt || row?.lastClientSyncAt || null);
    next.lastAcceptedReportSequence = shouldMergeFinalReport
      ? Math.max(currentAcceptedSequence, finalReportSequence)
      : currentAcceptedSequence;
    next.finalReportLate = !hasAcceptedFinalReport;
    next.finalReportVerificationPending = false;
    next.finalReportHasPayload = shouldMergeFinalReport;
    next.personalDataSource = shouldMergeFinalReport ? 'final_report' : 'last_heartbeat';
  } else {
    next.damage = 0;
    next.totalShots = 0;
    next.totalHits = 0;
    next.lumensSpentTotal = 0;
    next.crystalsCollected = 0;
    next.lumensGainedTotal = 0;
    next.sparkIds = [];
    next.weakZoneHits = 0;
    next.nonWeakZoneHits = 0;
    next.weapon2Hits = 0;
    next.weapon3Hits = 0;
    next.nonBaseWeaponHits = 0;
    next.voiceCommandsSuccess = 0;
    next.voiceCommandsSilenceSuccess = 0;
    next.voiceCommandsAttackSuccess = 0;
    next.voiceCommandsConsecutive = 0;
    next.voiceCommandsTotalAttempts = 0;
    next.voiceCommandsHistory = [];
    next.baddieDestroyedIds = [];
    next.darknessDamageFromBaddies = 0;
    next.finalReportAt = finalReportState?.acceptedAt || null;
    next.finalReportLate = !hasAcceptedFinalReport;
    next.finalReportVerificationPending = false;
    next.finalReportHasPayload = false;
    next.personalDataSource = 'none';
  }

  next.suspicious = false;
  next.suspiciousAt = null;
  next.suspiciousReasons = [];
  next.suspiciousEvidence = null;

  next.rewardK = computeBattleRewardK({
    damage: next.damage,
  });

  return next;
}

module.exports = {
  buildLatestFinalReportsMap,
  buildFinalizedAttendanceEntry,
  createEmptyReportedState,
  mergeReportedState,
  mergeVoiceResults,
  mergeWeakZoneHitsMaps,
  normalizeReportedState,
  normalizeUniqueIds,
  normalizeVoiceResults,
  normalizeWeakZoneHitsMap,
};
