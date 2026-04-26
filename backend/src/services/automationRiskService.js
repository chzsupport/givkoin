const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = process.env.SUPABASE_TABLE || 'app_documents';
const AUTOMATION_RISK_SOURCE = 'automation_risk_v3';

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : data.createdAt || null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : data.updatedAt || null,
  };
}

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
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', String(model))
      .range(from, from + size - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function upsertModelDocs(model, docs = []) {
  const supabase = getSupabaseClient();
  const safeDocs = Array.isArray(docs) ? docs.filter(Boolean) : [];
  if (!safeDocs.length) return;

  const chunkSize = 200;
  const nowIso = new Date().toISOString();
  for (let i = 0; i < safeDocs.length; i += chunkSize) {
    const chunk = safeDocs.slice(i, i + chunkSize);
    const payload = chunk.map((doc) => {
      const id = String(doc.id);
      const data = doc.data && typeof doc.data === 'object' ? doc.data : {};
      return {
        model: String(model),
        id,
        data,
        updated_at: nowIso,
        ...(doc.created_at ? { created_at: doc.created_at } : {}),
      };
    });
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase
      .from(DOC_TABLE)
      .upsert(payload, { onConflict: 'model,id' });
    if (error) throw error;
  }
}

const RISK_WINDOW_DAYS = 30;
const REVIEW_DELAY_DAYS = 30;
const PROFIT_ACTIVITY_TYPES = new Set([
  'solar_collect',
  'bridge_contribute',
  'fortune_spin',
  'daily_streak_claim',
  'night_shift',
  'fruit_collect',
  'battle_spark',
]);
const NAVIGATION_TARGET_PATHS = [
  '/fortune/roulette',
  '/fortune/lottery',
  '/activity/collect',
  '/activity/night-shift',
  '/activity/attendance',
  '/activity/achievements',
  '/bridges',
  '/tree/solar',
  '/battle',
];

function normalizeSignalValue(value) {
  return String(value || '').trim().toLowerCase();
}

function riskLevelByScore(score) {
  const value = Number(score) || 0;
  if (value >= 90) return 'critical';
  if (value >= 60) return 'high';
  if (value >= 30) return 'medium';
  return 'low';
}

function toDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values = []) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function coefficientOfVariation(values = []) {
  const avg = mean(values);
  if (!avg) return 0;
  return standardDeviation(values) / avg;
}

function coefficientFromMoments(sum, sqSum, count) {
  if (!count || count < 2) return 0;
  const avg = sum / count;
  if (!avg) return 0;
  const variance = Math.max(0, (sqSum / count) - (avg ** 2));
  return Math.sqrt(variance) / avg;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniq(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortByDate(rows = [], field = 'createdAt') {
  return [...rows].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
}

function buildTimelineTemplate(now = new Date(), days = RISK_WINDOW_DAYS) {
  const rows = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    rows.push({
      dateKey: toDayKey(date),
      score: 0,
      signalCount: 0,
      evidenceCount: 0,
      signals: [],
    });
  }
  return rows;
}

function createRiskContext(user, now) {
  const dailyTimeline = buildTimelineTemplate(now, RISK_WINDOW_DAYS);
  const timelineMap = new Map(dailyTimeline.map((row) => [row.dateKey, row]));
  return {
    user,
    score: 0,
    signals: new Set(),
    relatedUsers: new Set(),
    evidence: [],
    scoreBreakdown: new Map(),
    dailyTimeline,
    timelineMap,
    summary: {
      directNavigationSignature: '',
      profitRoutineSignature: '',
      directTargetViews: 0,
      profitableActions: 0,
    },
  };
}

function addSignal(ctx, { signal, score, category, summary, happenedAt, meta = {}, relatedUsers = [] }) {
  const safeSignal = String(signal || '').trim();
  const safeScore = Number(score) || 0;
  if (!safeSignal || safeScore <= 0) return;

  ctx.score += safeScore;
  ctx.signals.add(safeSignal);
  relatedUsers.forEach((userId) => {
    const safeId = String(userId || '').trim();
    if (safeId && safeId !== String(ctx.user?._id || '')) {
      ctx.relatedUsers.add(safeId);
    }
  });

  const breakdown = ctx.scoreBreakdown.get(safeSignal) || {
    signal: safeSignal,
    score: 0,
    count: 0,
  };
  breakdown.score += safeScore;
  breakdown.count += 1;
  ctx.scoreBreakdown.set(safeSignal, breakdown);

  const at = happenedAt ? new Date(happenedAt) : new Date();
  const safeAt = Number.isNaN(at.getTime()) ? new Date() : at;
  ctx.evidence.push({
    happenedAt: safeAt,
    category: String(category || 'system').trim(),
    signal: safeSignal,
    score: safeScore,
    summary: String(summary || '').trim(),
    meta,
  });

  const bucket = ctx.timelineMap.get(toDayKey(safeAt));
  if (bucket) {
    bucket.score += safeScore;
    bucket.signalCount += 1;
    bucket.evidenceCount += 1;
    if (!bucket.signals.includes(safeSignal)) {
      bucket.signals.push(safeSignal);
    }
  }
}

function buildSignalMaps(users = []) {
  const maps = {
    device: new Map(),
    fingerprint: new Map(),
    emailNormalized: new Map(),
    nicknameNormalized: new Map(),
  };

  for (const user of users) {
    addUserToSignalMaps(maps, user);
  }

  return maps;
}

function addUserToSignalMaps(maps, user) {
  if (!maps || !user) return;
  const userId = String(user?._id || '');
  if (!userId) return;
  const values = {
    device: normalizeSignalValue(user.lastDeviceId),
    fingerprint: normalizeSignalValue(user.lastFingerprint),
    emailNormalized: normalizeSignalValue(user.emailNormalized),
    nicknameNormalized: normalizeSignalValue(user.nicknameNormalized),
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    if (!maps[key].has(value)) maps[key].set(value, []);
    maps[key].get(value).push(userId);
  }
}

function buildProgressProfileForUser(user, { activitiesByUser, transactionsByUser, achievementsByUser }) {
  const userId = String(user?._id || '');
  if (!userId) return null;

  const stats = user?.achievementStats && typeof user.achievementStats === 'object'
    ? user.achievementStats
    : {};
  const activityRows = activitiesByUser.get(userId) || [];
  const transactionRows = transactionsByUser.get(userId) || [];
  const achievementRows = achievementsByUser.get(userId) || [];
  const achievementIds = new Set(
    achievementRows
      .map((row) => Number(row?.achievementId))
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  const earnedByActivity = {
    solarCollectSc: 0,
    solarCollectLm: 0,
    nightShiftSc: 0,
    nightShiftLm: 0,
    battleSparkLm: 0,
    fruitSc: 0,
    fruitLm: 0,
    solarShareSc: 0,
  };
  let profitableActivityCount = 0;
  for (const row of activityRows) {
    if (PROFIT_ACTIVITY_TYPES.has(String(row?.type || '').trim())) profitableActivityCount += 1;
    const earnings = extractActivityEarnings(row);
    if (row.type === 'solar_collect') {
      earnedByActivity.solarCollectSc += earnings.sc;
      earnedByActivity.solarCollectLm += earnings.lm;
    } else if (row.type === 'night_shift') {
      earnedByActivity.nightShiftSc += earnings.sc;
      earnedByActivity.nightShiftLm += earnings.lm;
    } else if (row.type === 'battle_spark') {
      earnedByActivity.battleSparkLm += earnings.lm;
    } else if (row.type === 'fruit_collect') {
      earnedByActivity.fruitSc += earnings.sc;
      earnedByActivity.fruitLm += earnings.lm;
    } else if (row.type === 'solar_share') {
      earnedByActivity.solarShareSc += earnings.sc;
    }
  }

  const transactionCredits = {
    battleSc: 0,
    fortuneSc: 0,
    chatSc: 0,
    referralSc: 0,
    otherSc: 0,
    lm: 0,
  };
  for (const row of transactionRows) {
    if (String(row?.direction || '') !== 'credit' || String(row?.status || 'completed') !== 'completed') continue;
    const amount = Math.max(0, safeNumber(row?.amount));
    const currency = String(row?.currency || 'K').trim();
    const type = String(row?.type || '').trim();
    if (!amount) continue;
    if (currency === 'LM') {
      transactionCredits.lm += amount;
      continue;
    }
    if (currency !== 'K') continue;
    if (type === 'battle') transactionCredits.battleSc += amount;
    else if (type === 'fortune' || type === 'lottery') transactionCredits.fortuneSc += amount;
    else if (type === 'chat' || type === 'chat_compensation') transactionCredits.chatSc += amount;
    else if (type === 'referral' || type === 'referral_blessing') transactionCredits.referralSc += amount;
    else transactionCredits.otherSc += amount;
  }

  const structureVector = normalizeVector([
    safeNumber(stats.totalChatMinutes),
    safeNumber(stats.totalBridgeStones),
    safeNumber(stats.totalEnergyShared),
    safeNumber(stats.totalCrystalsCollected),
    safeNumber(stats.totalBattlesParticipated),
    safeNumber(stats.totalLumensToTree),
    safeNumber(stats.totalNewsLikes) + safeNumber(stats.totalNewsComments) + safeNumber(stats.totalNewsReposts),
    safeNumber(stats.totalWishesCreated) + safeNumber(stats.totalWishesSupported) + safeNumber(stats.totalWishesFulfilled),
    safeNumber(user?.nightShift?.stats?.anomaliesCleared),
  ]);

  const earningsVector = normalizeVector([
    transactionCredits.battleSc,
    transactionCredits.fortuneSc,
    transactionCredits.chatSc,
    transactionCredits.referralSc,
    transactionCredits.otherSc + earnedByActivity.solarCollectSc + earnedByActivity.nightShiftSc + earnedByActivity.fruitSc + earnedByActivity.solarShareSc,
    earnedByActivity.solarCollectLm,
    earnedByActivity.nightShiftLm,
    earnedByActivity.battleSparkLm,
    earnedByActivity.fruitLm + transactionCredits.lm,
  ]);

  const scaleVector = [
    Math.log1p(achievementIds.size),
    Math.log1p(profitableActivityCount),
    Math.log1p(
      transactionCredits.battleSc
      + transactionCredits.fortuneSc
      + transactionCredits.chatSc
      + transactionCredits.referralSc
      + transactionCredits.otherSc
      + earnedByActivity.solarCollectSc
      + earnedByActivity.nightShiftSc
      + earnedByActivity.fruitSc
      + earnedByActivity.solarShareSc
    ),
    Math.log1p(
      transactionCredits.lm
      + earnedByActivity.solarCollectLm
      + earnedByActivity.nightShiftLm
      + earnedByActivity.battleSparkLm
      + earnedByActivity.fruitLm
    ),
  ];

  return {
    achievementIds,
    structureVector,
    earningsVector,
    scaleVector,
    profitableActivityCount,
  };
}

function buildProgressProfiles(users = [], { activitiesByUser, transactionsByUser, achievementsByUser }) {
  const profiles = new Map();

  for (const user of users) {
    const userId = String(user?._id || '');
    if (!userId) continue;
    const profile = buildProgressProfileForUser(user, { activitiesByUser, transactionsByUser, achievementsByUser });
    if (profile) profiles.set(userId, profile);
  }

  return profiles;
}

function collectDuplicates(map, value, selfId) {
  if (!value) return [];
  return (map.get(value) || []).filter((id) => String(id) !== String(selfId));
}

function groupRowsByUser(rows = [], userField = 'user') {
  const map = new Map();
  for (const row of rows) {
    const userValue = row?.[userField];
    const userId = typeof userValue === 'object' && userValue !== null
      ? String(userValue._id || userValue)
      : String(userValue || '');
    if (!userId) continue;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId).push(row);
  }
  return map;
}

function appendRowByUser(map, row, userField = 'user') {
  const userValue = row?.[userField];
  const userId = typeof userValue === 'object' && userValue !== null
    ? String(userValue._id || userValue)
    : String(userValue || '');
  if (!userId) return;
  if (!map.has(userId)) map.set(userId, []);
  map.get(userId).push(row);
}

function isNavigationTargetPath(path) {
  const clean = String(path || '').split('?')[0].trim().toLowerCase();
  if (!clean) return false;
  return NAVIGATION_TARGET_PATHS.some((prefix) => clean === prefix || clean.startsWith(`${prefix}/`));
}

function getPagePath(row) {
  return String(row?.meta?.path || '').split('?')[0].trim();
}

function buildDirectNavigationSignature(rows = []) {
  const counts = new Map();
  for (const row of rows) {
    const path = getPagePath(row);
    if (!path) continue;
    counts.set(path, (counts.get(path) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([path, count]) => `${path}:${count}`)
    .join('|');
}

function buildProfitRoutineSignature(rows = []) {
  const typeCounts = new Map();
  const hourBands = [0, 0, 0, 0];
  for (const row of rows) {
    const type = String(row?.type || '').trim();
    if (!type) continue;
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    const date = new Date(row?.createdAt || 0);
    const hour = Number.isNaN(date.getTime()) ? -1 : date.getUTCHours();
    if (hour >= 0) {
      hourBands[Math.floor(hour / 6)] += 1;
    }
  }
  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([type, count]) => `${type}:${count}`)
    .join('|');
  return `${topTypes}#${hourBands.join(',')}`;
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeVector(values = []) {
  const safe = values.map((value) => Math.max(0, safeNumber(value)));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (!total) return safe.map(() => 0);
  return safe.map((value) => value / total);
}

function cosineSimilarity(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = safeNumber(left[index]);
    const b = safeNumber(right[index]);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function jaccardSimilarity(leftSet = new Set(), rightSet = new Set()) {
  if (!leftSet.size || !rightSet.size) return 0;
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

function extractActivityEarnings(row) {
  const type = String(row?.type || '').trim();
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  if (!type) return { sc: 0, lm: 0, stars: 0 };

  if (type === 'solar_collect') {
    return {
      sc: safeNumber(meta.earnedSc, 10),
      lm: safeNumber(meta.earnedLm, 100),
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

function buildTransferGraph(activities = []) {
  const outbound = new Map();
  const inbound = new Map();

  for (const row of activities) {
    if (String(row?.type || '').trim() !== 'solar_share') continue;
    const senderId = String(row?.user || '');
    const recipientId = String(row?.meta?.recipientId || '');
    const amountLm = Math.max(0, safeNumber(row?.meta?.amountLm));
    if (!senderId || !recipientId || !amountLm) continue;

    if (!outbound.has(senderId)) {
      outbound.set(senderId, { totalLm: 0, recipients: new Map() });
    }
    if (!inbound.has(recipientId)) {
      inbound.set(recipientId, { totalLm: 0, senders: new Map() });
    }

    const outRow = outbound.get(senderId);
    outRow.totalLm += amountLm;
    const recipientEntry = outRow.recipients.get(recipientId) || {
      totalLm: 0,
      count: 0,
      lastAt: row.createdAt,
    };
    recipientEntry.totalLm += amountLm;
    recipientEntry.count += 1;
    recipientEntry.lastAt = row.createdAt;
    outRow.recipients.set(recipientId, recipientEntry);

    const inRow = inbound.get(recipientId);
    inRow.totalLm += amountLm;
    const senderEntry = inRow.senders.get(senderId) || {
      totalLm: 0,
      count: 0,
      lastAt: row.createdAt,
    };
    senderEntry.totalLm += amountLm;
    senderEntry.count += 1;
    senderEntry.lastAt = row.createdAt;
    inRow.senders.set(senderId, senderEntry);
  }

  return { outbound, inbound };
}

function appendTransferGraphActivity(graph, row) {
  if (!graph || String(row?.type || '').trim() !== 'solar_share') return;
  const senderId = String(row?.user || '');
  const recipientId = String(row?.meta?.recipientId || '');
  const amountLm = Math.max(0, safeNumber(row?.meta?.amountLm));
  if (!senderId || !recipientId || !amountLm) return;

  if (!graph.outbound.has(senderId)) {
    graph.outbound.set(senderId, { totalLm: 0, recipients: new Map() });
  }
  if (!graph.inbound.has(recipientId)) {
    graph.inbound.set(recipientId, { totalLm: 0, senders: new Map() });
  }

  const outRow = graph.outbound.get(senderId);
  outRow.totalLm += amountLm;
  const recipientEntry = outRow.recipients.get(recipientId) || {
    totalLm: 0,
    count: 0,
    lastAt: row.createdAt,
  };
  recipientEntry.totalLm += amountLm;
  recipientEntry.count += 1;
  recipientEntry.lastAt = row.createdAt;
  outRow.recipients.set(recipientId, recipientEntry);

  const inRow = graph.inbound.get(recipientId);
  inRow.totalLm += amountLm;
  const senderEntry = inRow.senders.get(senderId) || {
    totalLm: 0,
    count: 0,
    lastAt: row.createdAt,
  };
  senderEntry.totalLm += amountLm;
  senderEntry.count += 1;
  senderEntry.lastAt = row.createdAt;
  inRow.senders.set(senderId, senderEntry);
}


function buildBattleProfiles(battleAttendancesByUser = new Map()) {
  const profiles = new Map();

  for (const [userId, telemetryRows] of battleAttendancesByUser.entries()) {
    const aggregate = {
      shots: 0,
      intervalCount: 0,
      intervalSumMs: 0,
      intervalSqSumMs: 0,
      staticCursorShots: 0,
      hiddenTabShotCount: 0,
      cursorDistancePxTotal: 0,
      screenMinNx: 1,
      screenMaxNx: 0,
      screenMinNy: 1,
      screenMaxNy: 0,
      voiceCommandsTotalAttempts: 0,
      voiceCommandsSuccess: 0,
    };

    for (const row of telemetryRows) {
      const telemetry = row?.automationTelemetry || {};
      aggregate.shots += safeNumber(telemetry.shotTelemetryCount);
      aggregate.intervalCount += safeNumber(telemetry.intervalCount);
      aggregate.intervalSumMs += safeNumber(telemetry.intervalSumMs);
      aggregate.intervalSqSumMs += safeNumber(telemetry.intervalSqSumMs);
      aggregate.staticCursorShots += safeNumber(telemetry.staticCursorShots);
      aggregate.hiddenTabShotCount += safeNumber(telemetry.hiddenTabShotCount);
      aggregate.cursorDistancePxTotal += safeNumber(telemetry.cursorDistancePxTotal);
      if (Number.isFinite(Number(telemetry.screenMinNx))) aggregate.screenMinNx = Math.min(aggregate.screenMinNx, Number(telemetry.screenMinNx));
      if (Number.isFinite(Number(telemetry.screenMaxNx))) aggregate.screenMaxNx = Math.max(aggregate.screenMaxNx, Number(telemetry.screenMaxNx));
      if (Number.isFinite(Number(telemetry.screenMinNy))) aggregate.screenMinNy = Math.min(aggregate.screenMinNy, Number(telemetry.screenMinNy));
      if (Number.isFinite(Number(telemetry.screenMaxNy))) aggregate.screenMaxNy = Math.max(aggregate.screenMaxNy, Number(telemetry.screenMaxNy));
      aggregate.voiceCommandsTotalAttempts += safeNumber(row?.voiceCommandsTotalAttempts);
      aggregate.voiceCommandsSuccess += safeNumber(row?.voiceCommandsSuccess);
    }

    const shots = Math.max(0, aggregate.shots);
    const intervalCv = coefficientFromMoments(
      aggregate.intervalSumMs,
      aggregate.intervalSqSumMs,
      aggregate.intervalCount
    );
    profiles.set(userId, {
      shots,
      staticRatio: shots ? aggregate.staticCursorShots / shots : 0,
      intervalCv,
      hiddenRatio: shots ? aggregate.hiddenTabShotCount / shots : 0,
      screenWidth: Math.max(0, aggregate.screenMaxNx - aggregate.screenMinNx),
      screenHeight: Math.max(0, aggregate.screenMaxNy - aggregate.screenMinNy),
      avgCursorDistancePx: shots ? aggregate.cursorDistancePxTotal / shots : 0,
      voiceSuccessRate: aggregate.voiceCommandsTotalAttempts
        ? aggregate.voiceCommandsSuccess / aggregate.voiceCommandsTotalAttempts
        : 0,
    });
  }

  return profiles;
}

function evaluateIdentitySignals(ctx, { usersById, maps, referralsByInviter, existingCaseByUser }) {
  const userId = String(ctx.user?._id || '');
  const duplicateSignals = [
    {
      label: 'shared_device',
      map: maps.device,
      value: normalizeSignalValue(ctx.user?.lastDeviceId),
      base: 18,
      perUser: 7,
      cap: 44,
    },
    {
      label: 'shared_fingerprint',
      map: maps.fingerprint,
      value: normalizeSignalValue(ctx.user?.lastFingerprint),
      base: 20,
      perUser: 8,
      cap: 48,
    },
  ];

  for (const entry of duplicateSignals) {
    const relatedIds = collectDuplicates(entry.map, entry.value, userId);
    if (!relatedIds.length) continue;
    addSignal(ctx, {
      signal: `${entry.label}:${entry.value}`,
      score: Math.min(entry.cap, entry.base + relatedIds.length * entry.perUser),
      category: 'identity',
      summary: `${relatedIds.length} аккаунтов совпадают по ${entry.label === 'shared_device' ? 'deviceId' : 'fingerprint'}`,
      happenedAt: new Date(),
      relatedUsers: relatedIds,
      meta: {
        value: entry.value,
        relatedCount: relatedIds.length,
      },
    });

    const bannedLinks = relatedIds.filter((id) => usersById.get(id)?.status === 'banned');
    if (bannedLinks.length) {
      addSignal(ctx, {
        signal: 'linked_banned_account',
        score: Math.min(25, 10 + bannedLinks.length * 5),
        category: 'identity',
        summary: `${bannedLinks.length} связанных аккаунтов уже заблокированы`,
        happenedAt: new Date(),
        relatedUsers: bannedLinks,
      });
    }

    const penalizedLinks = relatedIds.filter((id) => existingCaseByUser.get(id)?.status === 'penalized');
    if (penalizedLinks.length) {
      addSignal(ctx, {
        signal: 'linked_penalized_account',
        score: Math.min(28, 12 + penalizedLinks.length * 6),
        category: 'identity',
        summary: `${penalizedLinks.length} связанных аккаунтов уже были оштрафованы за автоматизацию`,
        happenedAt: new Date(),
        relatedUsers: penalizedLinks,
      });
    }
  }

  const dupEmailNorm = collectDuplicates(
    maps.emailNormalized,
    normalizeSignalValue(ctx.user?.emailNormalized),
    userId
  );
  if (dupEmailNorm.length) {
    addSignal(ctx, {
      signal: 'email_normalized_collision',
      score: Math.min(28, 10 + dupEmailNorm.length * 6),
      category: 'identity',
      summary: `Совпадение нормализованного email с ${dupEmailNorm.length} аккаунтами`,
      happenedAt: new Date(),
      relatedUsers: dupEmailNorm,
    });
  }

  const dupNickNorm = collectDuplicates(
    maps.nicknameNormalized,
    normalizeSignalValue(ctx.user?.nicknameNormalized),
    userId
  );
  if (dupNickNorm.length) {
    addSignal(ctx, {
      signal: 'nickname_normalized_collision',
      score: Math.min(18, 6 + dupNickNorm.length * 4),
      category: 'identity',
      summary: `Совпадение шаблона ника с ${dupNickNorm.length} аккаунтами`,
      happenedAt: new Date(),
      relatedUsers: dupNickNorm,
    });
  }

  const inviterId = ctx.user?.referredBy ? String(ctx.user.referredBy) : '';
  const invitees = inviterId ? Array.from(referralsByInviter.get(inviterId) || []) : [];
  if (invitees.length >= 3) {
    addSignal(ctx, {
      signal: `referral_cluster:${inviterId}`,
      score: Math.min(20, 8 + invitees.length * 2),
      category: 'identity',
      summary: `Реферальный кластер из ${invitees.length} аккаунтов`,
      happenedAt: new Date(),
      relatedUsers: invitees.filter((id) => id !== userId),
      meta: { inviterId, invitees: invitees.length },
    });
  }
}

function evaluateNavigationSignals(ctx, pageViews = [], profitableActivities = [], now = new Date()) {
  const sortedPageViews = sortByDate(pageViews, 'createdAt');
  const activeDays = new Set(sortedPageViews.map((row) => toDayKey(row?.createdAt)));
  const uniquePaths = new Set(sortedPageViews.map((row) => getPagePath(row)).filter(Boolean));
  const targetViews = sortedPageViews.filter((row) => {
    const path = getPagePath(row);
    return isNavigationTargetPath(path) || Boolean(row?.meta?.chainExpected);
  });
  const directTargetViews = targetViews.filter(
    (row) => row?.meta?.navigationSource === 'direct_open' || row?.meta?.isDirectNavigation
  );
  const skippedChainViews = targetViews.filter(
    (row) => row?.meta?.chainExpected && row?.meta?.chainSatisfied === false
  );

  ctx.summary.directNavigationSignature = buildDirectNavigationSignature(directTargetViews);
  ctx.summary.directTargetViews = directTargetViews.length;

  if (
    targetViews.length >= 10 &&
    directTargetViews.length >= 8 &&
    directTargetViews.length / targetViews.length >= 0.75 &&
    new Set(directTargetViews.map((row) => getPagePath(row))).size >= 2
  ) {
    const latest = directTargetViews[directTargetViews.length - 1];
    addSignal(ctx, {
      signal: 'direct_navigation_bias',
      score: clamp(10 + Math.round((directTargetViews.length / targetViews.length) * 15), 10, 24),
      category: 'navigation',
      summary: `${directTargetViews.length} из ${targetViews.length} целевых переходов открыты прямым URL`,
      happenedAt: latest?.createdAt || now,
      meta: {
        targetViews: targetViews.length,
        directViews: directTargetViews.length,
        ratio: round(directTargetViews.length / targetViews.length, 3),
      },
    });
  }

  if (
    targetViews.length >= 8 &&
    skippedChainViews.length >= 5 &&
    skippedChainViews.length / targetViews.length >= 0.5
  ) {
    const latest = skippedChainViews[skippedChainViews.length - 1];
    addSignal(ctx, {
      signal: 'skipped_navigation_chain',
      score: clamp(10 + skippedChainViews.length, 10, 26),
      category: 'navigation',
      summary: `${skippedChainViews.length} переходов пропустили обязательную цепочку экранов`,
      happenedAt: latest?.createdAt || now,
      meta: {
        targetViews: targetViews.length,
        skippedChainViews: skippedChainViews.length,
      },
    });
  }

  if (sortedPageViews.length >= 25 && activeDays.size >= 10 && uniquePaths.size <= 6) {
    const latest = sortedPageViews[sortedPageViews.length - 1];
    addSignal(ctx, {
      signal: 'narrow_page_exploration',
      score: clamp(8 + (10 - uniquePaths.size), 8, 18),
      category: 'navigation',
      summary: `За ${activeDays.size} активных дней посещено только ${uniquePaths.size} страниц`,
      happenedAt: latest?.createdAt || now,
      meta: {
        activeDays: activeDays.size,
        uniquePaths: uniquePaths.size,
        pageViews: sortedPageViews.length,
      },
    });
  }

  const accountAgeDays = Math.max(
    0,
    Math.floor((now.getTime() - new Date(ctx.user?.createdAt || now).getTime()) / (24 * 60 * 60 * 1000))
  );
  if (
    profitableActivities.length >= 12 &&
    activeDays.size >= 10 &&
    uniquePaths.size <= 8 &&
    accountAgeDays >= 10
  ) {
    const latest = profitableActivities[profitableActivities.length - 1];
    addSignal(ctx, {
      signal: 'profit_without_exploration',
      score: clamp(12 + profitableActivities.length / 6, 12, 24),
      category: 'navigation',
      summary: `Аккаунт фармит ${profitableActivities.length} прибыльных действий при очень узком серфинге`,
      happenedAt: latest?.createdAt || now,
      meta: {
        profitableActions: profitableActivities.length,
        uniquePaths: uniquePaths.size,
        accountAgeDays,
      },
    });
  }
}

function evaluateTimingSignals(ctx, pageViews = [], profitableActivities = [], sessions = [], now = new Date()) {
  const profitableByType = new Map();
  const sortedProfitable = sortByDate(profitableActivities, 'createdAt');
  for (const row of sortedProfitable) {
    const type = String(row?.type || '').trim();
    if (!type) continue;
    if (!profitableByType.has(type)) profitableByType.set(type, []);
    profitableByType.get(type).push(row);
  }

  const lowVarianceTypes = [];
  const preciseTimeTypes = [];

  for (const [type, rows] of profitableByType.entries()) {
    if (rows.length < 6) continue;
    const intervals = [];
    const minuteOfDay = [];
    for (let i = 1; i < rows.length; i += 1) {
      intervals.push(new Date(rows[i].createdAt).getTime() - new Date(rows[i - 1].createdAt).getTime());
    }
    rows.forEach((row) => {
      const date = new Date(row.createdAt);
      minuteOfDay.push((date.getUTCHours() * 60) + date.getUTCMinutes());
    });

    const intervalCv = coefficientOfVariation(intervals);
    if (intervals.length >= 5 && intervalCv > 0 && intervalCv <= 0.12) {
      lowVarianceTypes.push({ type, cv: intervalCv, count: rows.length, latestAt: rows[rows.length - 1].createdAt });
    }

    const minuteStd = standardDeviation(minuteOfDay);
    const uniqueDays = new Set(rows.map((row) => toDayKey(row.createdAt)));
    if (uniqueDays.size >= 5 && minuteStd <= 3) {
      preciseTimeTypes.push({
        type,
        stdMinutes: minuteStd,
        count: rows.length,
        latestAt: rows[rows.length - 1].createdAt,
      });
    }
  }

  if (lowVarianceTypes.length) {
    const strongest = lowVarianceTypes.sort((a, b) => a.cv - b.cv || b.count - a.count)[0];
    addSignal(ctx, {
      signal: 'low_interval_variation',
      score: clamp(10 + lowVarianceTypes.length * 3, 10, 22),
      category: 'timing',
      summary: `Слишком ровные интервалы у ${lowVarianceTypes.length} прибыльных механик, самая ровная: ${strongest.type}`,
      happenedAt: strongest.latestAt || now,
      meta: {
        types: lowVarianceTypes.map((row) => ({
          type: row.type,
          count: row.count,
          intervalCv: round(row.cv, 4),
        })),
      },
    });
  }

  if (preciseTimeTypes.length) {
    const strongest = preciseTimeTypes.sort((a, b) => a.stdMinutes - b.stdMinutes || b.count - a.count)[0];
    addSignal(ctx, {
      signal: 'precise_daily_timing',
      score: clamp(8 + preciseTimeTypes.length * 2, 8, 18),
      category: 'timing',
      summary: `Повтор входов и сборов почти в одно и то же время суток, пример: ${strongest.type}`,
      happenedAt: strongest.latestAt || now,
      meta: {
        types: preciseTimeTypes.map((row) => ({
          type: row.type,
          count: row.count,
          stdMinutes: round(row.stdMinutes, 3),
        })),
      },
    });
  }

  const sortedPageViews = sortByDate(pageViews, 'createdAt');
  let pageIndex = 0;
  let immediateProfitActions = 0;
  for (const activity of sortedProfitable) {
    const atMs = new Date(activity.createdAt).getTime();
    while (
      pageIndex + 1 < sortedPageViews.length &&
      new Date(sortedPageViews[pageIndex + 1].createdAt).getTime() <= atMs
    ) {
      pageIndex += 1;
    }
    const pageView = sortedPageViews[pageIndex];
    if (!pageView) continue;
    const diff = atMs - new Date(pageView.createdAt).getTime();
    if (diff >= 0 && diff <= 15000) {
      immediateProfitActions += 1;
    }
  }

  if (
    sortedProfitable.length >= 8 &&
    immediateProfitActions >= 6 &&
    immediateProfitActions / sortedProfitable.length >= 0.7
  ) {
    const latest = sortedProfitable[sortedProfitable.length - 1];
    addSignal(ctx, {
      signal: 'immediate_profit_actions',
      score: clamp(8 + Math.round((immediateProfitActions / sortedProfitable.length) * 12), 8, 20),
      category: 'timing',
      summary: `${immediateProfitActions} прибыльных действий выполнены почти мгновенно после открытия страницы`,
      happenedAt: latest?.createdAt || now,
      meta: {
        profitableActions: sortedProfitable.length,
        immediateProfitActions,
      },
    });
  }

  const shortDurations = sessions
    .map((session) => {
      const startedAt = new Date(session?.startedAt || 0).getTime();
      const endedAt = new Date(session?.endedAt || session?.lastSeenAt || session?.startedAt || 0).getTime();
      return Math.max(0, Math.round((endedAt - startedAt) / 1000));
    })
    .filter((seconds) => seconds >= 20 && seconds <= 600);
  const shortSessionCv = coefficientOfVariation(shortDurations);
  if (shortDurations.length >= 8 && shortSessionCv > 0 && shortSessionCv <= 0.25) {
    const latestSession = sortByDate(sessions, 'startedAt').slice(-1)[0];
    addSignal(ctx, {
      signal: 'short_session_uniformity',
      score: clamp(8 + shortDurations.length / 3, 8, 18),
      category: 'sessions',
      summary: `Короткие сессии слишком одинаковой длительности (${shortDurations.length} повторов)`,
      happenedAt: latestSession?.startedAt || now,
      meta: {
        shortSessions: shortDurations.length,
        averageSeconds: round(mean(shortDurations), 1),
        cv: round(shortSessionCv, 4),
      },
    });
  }

  const sortedSessions = sortByDate(sessions, 'startedAt').map((session) => ({
    startedAt: new Date(session?.startedAt || 0).getTime(),
    endedAt: new Date(session?.endedAt || session?.lastSeenAt || session?.startedAt || 0).getTime(),
  }));
  let overlapCount = 0;
  let lastWindowEnd = 0;
  for (const session of sortedSessions) {
    if (session.startedAt < lastWindowEnd - 60000) {
      overlapCount += 1;
    }
    lastWindowEnd = Math.max(lastWindowEnd, session.endedAt);
  }
  if (overlapCount >= 2) {
    addSignal(ctx, {
      signal: 'parallel_session_overlap',
      score: clamp(6 + overlapCount * 3, 6, 18),
      category: 'sessions',
      summary: `Обнаружены параллельные или перекрывающиеся сессии (${overlapCount})`,
      happenedAt: now,
      meta: { overlapCount },
    });
  }

  ctx.summary.profitRoutineSignature = buildProfitRoutineSignature(sortedProfitable);
  ctx.summary.profitableActions = sortedProfitable.length;
}

function evaluateHttpSignals(ctx, behaviorEvents = [], now = new Date()) {
  const requestActions = sortByDate(
    behaviorEvents.filter((row) => row?.category === 'http' && row?.eventType === 'request_action'),
    'occurredAt'
  );
  const requestErrors = sortByDate(
    behaviorEvents.filter((row) => row?.category === 'http' && row?.eventType === 'request_error'),
    'occurredAt'
  );

  if (requestActions.length >= 10) {
    const actionIntervals = [];
    const pathCounts = new Map();
    requestActions.forEach((row, index) => {
      const path = String(row?.path || '').split('?')[0].trim();
      if (path) pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
      if (index > 0) {
        actionIntervals.push(
          new Date(row.occurredAt).getTime() - new Date(requestActions[index - 1].occurredAt).getTime()
        );
      }
    });
    const actionIntervalCv = coefficientOfVariation(actionIntervals);
    const topPath = Array.from(pathCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (actionIntervals.length >= 8 && actionIntervalCv > 0 && actionIntervalCv <= 0.12 && topPath?.[1] >= 5) {
      const latest = requestActions[requestActions.length - 1];
      addSignal(ctx, {
        signal: 'request_action_cadence',
        score: clamp(8 + topPath[1] + Math.round((0.15 - actionIntervalCv) * 30), 8, 22),
        category: 'http',
        summary: `Успешные action-запросы идут слишком ровным машинным ритмом по ${topPath[0]}`,
        happenedAt: latest?.occurredAt || now,
        meta: {
          requestActions: requestActions.length,
          intervalCv: round(actionIntervalCv, 4),
          topPath: topPath[0],
          topPathCount: topPath[1],
        },
      });
    }
  }

  if (requestErrors.length < 5) return;

  const intervals = [];
  let hasRateLimit = false;
  requestErrors.forEach((row, index) => {
    if (index > 0) {
      intervals.push(new Date(row.occurredAt).getTime() - new Date(requestErrors[index - 1].occurredAt).getTime());
    }
    if (Number(row?.meta?.statusCode) === 429) hasRateLimit = true;
  });

  const intervalCv = coefficientOfVariation(intervals);
  if (hasRateLimit || (intervals.length >= 4 && intervalCv > 0 && intervalCv <= 0.25)) {
    const latest = requestErrors[requestErrors.length - 1];
    addSignal(ctx, {
      signal: 'request_error_rhythm',
      score: clamp(8 + requestErrors.length, 8, 20),
      category: 'http',
      summary: `${requestErrors.length} аномальных HTTP-ошибок по прибыльным endpoint'ам`,
      happenedAt: latest?.occurredAt || now,
      meta: {
        requestErrors: requestErrors.length,
        intervalCv: round(intervalCv, 4),
        hasRateLimit,
      },
    });
  }
}

function evaluateSessionRestrictionSignals(ctx, sessions = [], behaviorEvents = [], now = new Date()) {
  const revokedSessions = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.revokedAt && session?.sessionId);
  if (!revokedSessions.length || !Array.isArray(behaviorEvents) || !behaviorEvents.length) return;

  let matchedCount = 0;
  const evidence = [];
  for (const session of revokedSessions) {
    const revokedAtMs = new Date(session.revokedAt).getTime();
    if (!Number.isFinite(revokedAtMs)) continue;
    const afterEvents = behaviorEvents.filter((row) => {
      if (String(row?.sessionId || '') !== String(session.sessionId || '')) return false;
      const occurredAtMs = new Date(row?.occurredAt || 0).getTime();
      return Number.isFinite(occurredAtMs) && occurredAtMs >= revokedAtMs + 10000;
    });
    if (!afterEvents.length) continue;
    matchedCount += afterEvents.length;
    evidence.push({
      sessionId: session.sessionId,
      revokedAt: session.revokedAt,
      revokeReason: session.revokeReason || '',
      eventsAfterRevoke: afterEvents.length,
      sampleEventTypes: uniq(afterEvents.slice(0, 5).map((row) => row?.eventType || '')),
    });
  }

  if (!matchedCount) return;
  addSignal(ctx, {
    signal: 'activity_after_session_revoke',
    score: clamp(10 + matchedCount * 2, 10, 24),
    category: 'sessions',
    summary: `После ревока сессии продолжилась активность (${matchedCount} событий)`,
    happenedAt: now,
    meta: { sessions: evidence },
  });
}

function buildBattleAttendanceByUser(battles = [], since) {
  const map = new Map();
  for (const battle of battles) {
    const entries = Array.isArray(battle?.attendance) ? battle.attendance : [];
    for (const entry of entries) {
      const userValue = entry?.user;
      const userId = typeof userValue === 'object' && userValue !== null
        ? String(userValue._id || userValue)
        : String(userValue || '');
      if (!userId) continue;
      const happenedAt = entry?.joinedAt || battle?.endsAt || battle?.updatedAt || battle?.createdAt;
      const happenedDate = new Date(happenedAt || 0);
      if (Number.isNaN(happenedDate.getTime()) || happenedDate < since) continue;
      if (!map.has(userId)) map.set(userId, []);
      map.get(userId).push({
        battleId: battle._id,
        happenedAt: happenedDate,
        automationTelemetry: entry?.automationTelemetry || {},
        voiceCommandsTotalAttempts: Number(entry?.voiceCommandsTotalAttempts) || 0,
        voiceCommandsSuccess: Number(entry?.voiceCommandsSuccess) || 0,
      });
    }
  }
  return map;
}

function appendBattleAttendanceByUser(map, battle, since) {
  const entries = Array.isArray(battle?.attendance) ? battle.attendance : [];
  for (const entry of entries) {
    const userValue = entry?.user;
    const userId = typeof userValue === 'object' && userValue !== null
      ? String(userValue._id || userValue)
      : String(userValue || '');
    if (!userId) continue;
    const happenedAt = entry?.joinedAt || battle?.endsAt || battle?.updatedAt || battle?.createdAt;
    const happenedDate = new Date(happenedAt || 0);
    if (Number.isNaN(happenedDate.getTime()) || happenedDate < since) continue;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId).push({
      battleId: battle._id,
      happenedAt: happenedDate,
      automationTelemetry: entry?.automationTelemetry || {},
      voiceCommandsTotalAttempts: Number(entry?.voiceCommandsTotalAttempts) || 0,
      voiceCommandsSuccess: Number(entry?.voiceCommandsSuccess) || 0,
    });
  }
}

function evaluateBattleSignals(ctx, battleAttendances = [], behaviorEvents = [], now = new Date()) {
  const telemetryRows = Array.isArray(battleAttendances) ? battleAttendances : [];
  const modalBurstEvents = behaviorEvents.filter(
    (row) => row?.category === 'battle' && row?.eventType === 'battle_result_modal_same_spot_burst'
  );

  const aggregate = {
    shots: 0,
    intervalCount: 0,
    intervalSumMs: 0,
    intervalSqSumMs: 0,
    staticCursorShots: 0,
    hiddenTabShotCount: 0,
    screenMinNx: 1,
    screenMaxNx: 0,
    screenMinNy: 1,
    screenMaxNy: 0,
    voiceCommandsTotalAttempts: 0,
    voiceCommandsSuccess: 0,
  };

  let latestAt = now;
  telemetryRows.forEach((row) => {
    const telemetry = row?.automationTelemetry || {};
    aggregate.shots += Number(telemetry.shotTelemetryCount) || 0;
    aggregate.intervalCount += Number(telemetry.intervalCount) || 0;
    aggregate.intervalSumMs += Number(telemetry.intervalSumMs) || 0;
    aggregate.intervalSqSumMs += Number(telemetry.intervalSqSumMs) || 0;
    aggregate.staticCursorShots += Number(telemetry.staticCursorShots) || 0;
    aggregate.hiddenTabShotCount += Number(telemetry.hiddenTabShotCount) || 0;
    if (Number.isFinite(Number(telemetry.screenMinNx))) aggregate.screenMinNx = Math.min(aggregate.screenMinNx, Number(telemetry.screenMinNx));
    if (Number.isFinite(Number(telemetry.screenMaxNx))) aggregate.screenMaxNx = Math.max(aggregate.screenMaxNx, Number(telemetry.screenMaxNx));
    if (Number.isFinite(Number(telemetry.screenMinNy))) aggregate.screenMinNy = Math.min(aggregate.screenMinNy, Number(telemetry.screenMinNy));
    if (Number.isFinite(Number(telemetry.screenMaxNy))) aggregate.screenMaxNy = Math.max(aggregate.screenMaxNy, Number(telemetry.screenMaxNy));
    aggregate.voiceCommandsTotalAttempts += Number(row?.voiceCommandsTotalAttempts) || 0;
    aggregate.voiceCommandsSuccess += Number(row?.voiceCommandsSuccess) || 0;
    const happenedAt = new Date(row?.happenedAt || now);
    if (!Number.isNaN(happenedAt.getTime()) && happenedAt > latestAt) latestAt = happenedAt;
  });

  const staticRatio = aggregate.shots ? aggregate.staticCursorShots / aggregate.shots : 0;
  const intervalCv = coefficientFromMoments(
    aggregate.intervalSumMs,
    aggregate.intervalSqSumMs,
    aggregate.intervalCount
  );
  const screenWidth = Math.max(0, aggregate.screenMaxNx - aggregate.screenMinNx);
  const screenHeight = Math.max(0, aggregate.screenMaxNy - aggregate.screenMinNy);

  if (aggregate.shots >= 120 && staticRatio >= 0.72) {
    addSignal(ctx, {
      signal: 'battle_static_cursor',
      score: clamp(12 + Math.round(staticRatio * 20), 12, 26),
      category: 'battle',
      summary: `В бою ${aggregate.staticCursorShots} из ${aggregate.shots} выстрелов сделаны почти без движения курсора`,
      happenedAt: latestAt,
      meta: {
        shots: aggregate.shots,
        staticCursorShots: aggregate.staticCursorShots,
        staticRatio: round(staticRatio, 4),
        screenWidth: round(screenWidth, 4),
        screenHeight: round(screenHeight, 4),
      },
    });
  }

  if (aggregate.intervalCount >= 80 && intervalCv > 0 && intervalCv <= 0.08) {
    addSignal(ctx, {
      signal: 'battle_stable_click_rhythm',
      score: clamp(14 + Math.round((0.1 - intervalCv) * 100), 14, 28),
      category: 'battle',
      summary: `Слишком стабильный ритм кликов в бою (${aggregate.intervalCount} интервалов)`,
      happenedAt: latestAt,
      meta: {
        intervalCount: aggregate.intervalCount,
        intervalCv: round(intervalCv, 5),
      },
    });
  }

  if (aggregate.hiddenTabShotCount >= 5) {
    addSignal(ctx, {
      signal: 'battle_hidden_tab_shots',
      score: clamp(8 + aggregate.hiddenTabShotCount, 8, 18),
      category: 'battle',
      summary: `${aggregate.hiddenTabShotCount} выстрелов отправлены при скрытой вкладке`,
      happenedAt: latestAt,
      meta: { hiddenTabShotCount: aggregate.hiddenTabShotCount },
    });
  }

  if (modalBurstEvents.length) {
    const latest = sortByDate(modalBurstEvents, 'occurredAt').slice(-1)[0];
    addSignal(ctx, {
      signal: 'battle_result_modal_same_spot_burst',
      score: clamp(12 + modalBurstEvents.length * 4, 12, 24),
      category: 'battle',
      summary: `После окончания боя зафиксированы повторные клики в одну точку поверх модального окна (${modalBurstEvents.length})`,
      happenedAt: latest?.occurredAt || latestAt,
      meta: { modalBurstEvents: modalBurstEvents.length },
    });
  }

  if (
    aggregate.voiceCommandsTotalAttempts >= 8 &&
    aggregate.shots >= 120 &&
    aggregate.voiceCommandsSuccess / aggregate.voiceCommandsTotalAttempts <= 0.15
  ) {
    addSignal(ctx, {
      signal: 'battle_voice_ignore_pattern',
      score: 6,
      category: 'battle',
      summary: 'Игрок почти не реагирует на механику Голоса Мрака',
      happenedAt: latestAt,
      meta: {
        voiceCommandsTotalAttempts: aggregate.voiceCommandsTotalAttempts,
        voiceCommandsSuccess: aggregate.voiceCommandsSuccess,
      },
    });
  }
}

function evaluateEconomicSignals(ctx, transferGraph, now = new Date()) {
  const userId = String(ctx.user?._id || '');
  if (!userId || !transferGraph) return;

  const relatedIds = new Set(Array.from(ctx.relatedUsers || []));
  const outbound = transferGraph.outbound.get(userId);
  if (outbound && outbound.totalLm >= 60) {
    const topRecipient = Array.from(outbound.recipients.entries())
      .sort((a, b) => b[1].totalLm - a[1].totalLm || b[1].count - a[1].count)[0];
    if (topRecipient) {
      const [recipientId, recipientStats] = topRecipient;
      const ratio = outbound.totalLm ? recipientStats.totalLm / outbound.totalLm : 0;
      if (relatedIds.has(recipientId) && recipientStats.count >= 3 && ratio >= 0.75) {
        addSignal(ctx, {
          signal: 'benefit_funneling_sender',
          score: clamp(10 + Math.round(recipientStats.totalLm / 20) + recipientStats.count * 2, 10, 28),
          category: 'economy',
          summary: `Основная часть переводов Люменов уходит на один связанный аккаунт (${recipientStats.totalLm} Lm)`,
          happenedAt: recipientStats.lastAt || now,
          relatedUsers: [recipientId],
          meta: {
            totalOutboundLm: round(outbound.totalLm, 3),
            dominantRecipientLm: round(recipientStats.totalLm, 3),
            dominantRecipientCount: recipientStats.count,
            dominantRatio: round(ratio, 4),
          },
        });
      }
    }
  }

  const inbound = transferGraph.inbound.get(userId);
  if (inbound && inbound.totalLm >= 80) {
    const relatedSenders = Array.from(inbound.senders.entries())
      .filter(([senderId]) => relatedIds.has(senderId))
      .sort((a, b) => b[1].totalLm - a[1].totalLm || b[1].count - a[1].count);
    const totalRelatedLm = relatedSenders.reduce((sum, [, row]) => sum + row.totalLm, 0);
    if (relatedSenders.length >= 2 && totalRelatedLm >= 80) {
      addSignal(ctx, {
        signal: 'benefit_funneling_receiver',
        score: clamp(12 + relatedSenders.length * 4 + Math.round(totalRelatedLm / 25), 12, 30),
        category: 'economy',
        summary: `Связанные аккаунты сливают выгоду на этот аккаунт (${round(totalRelatedLm, 3)} Lm)`,
        happenedAt: relatedSenders[0]?.[1]?.lastAt || now,
        relatedUsers: relatedSenders.map(([senderId]) => senderId),
        meta: {
          relatedSenders: relatedSenders.map(([senderId, row]) => ({
            userId: senderId,
            totalLm: round(row.totalLm, 3),
            count: row.count,
          })),
          totalInboundLm: round(inbound.totalLm, 3),
          totalRelatedLm: round(totalRelatedLm, 3),
        },
      });
    }
  }
}

function evaluateStructuralClusterSignals(contextsByUserId, progressProfilesByUser, battleProfilesByUser) {
  for (const [userId, ctx] of contextsByUserId.entries()) {
    const relatedIds = Array.from(ctx.relatedUsers);
    if (!relatedIds.length) continue;

    const ownProgress = progressProfilesByUser.get(userId);
    if (ownProgress) {
      const progressMatches = [];
      const achievementMatches = [];

      for (const relatedId of relatedIds) {
        const relatedProgress = progressProfilesByUser.get(relatedId);
        if (!relatedProgress) continue;

        const structureSimilarity = cosineSimilarity(ownProgress.structureVector, relatedProgress.structureVector);
        const earningsSimilarity = cosineSimilarity(ownProgress.earningsVector, relatedProgress.earningsVector);
        const scaleSimilarity = cosineSimilarity(ownProgress.scaleVector, relatedProgress.scaleVector);
        if (structureSimilarity >= 0.985 && earningsSimilarity >= 0.97 && scaleSimilarity >= 0.985) {
          progressMatches.push({
            userId: relatedId,
            structureSimilarity,
            earningsSimilarity,
            scaleSimilarity,
          });
        }

        const achievementSimilarity = jaccardSimilarity(ownProgress.achievementIds, relatedProgress.achievementIds);
        if (
          ownProgress.achievementIds.size >= 4
          && relatedProgress.achievementIds.size >= 4
          && achievementSimilarity >= 0.85
        ) {
          achievementMatches.push({
            userId: relatedId,
            achievementSimilarity,
          });
        }
      }

      if (progressMatches.length) {
        addSignal(ctx, {
          signal: 'progress_structure_cluster',
          score: clamp(10 + progressMatches.length * 4, 10, 24),
          category: 'cluster',
          summary: 'Связанные аккаунты имеют слишком похожую структуру прогресса и заработка',
          happenedAt: new Date(),
          relatedUsers: progressMatches.map((row) => row.userId),
          meta: {
            matches: progressMatches.map((row) => ({
              userId: row.userId,
              structureSimilarity: round(row.structureSimilarity, 4),
              earningsSimilarity: round(row.earningsSimilarity, 4),
              scaleSimilarity: round(row.scaleSimilarity, 4),
            })),
          },
        });
      }

      if (achievementMatches.length) {
        addSignal(ctx, {
          signal: 'achievement_structure_cluster',
          score: clamp(8 + achievementMatches.length * 3, 8, 20),
          category: 'cluster',
          summary: 'У связанных аккаунтов слишком похожие наборы достижений',
          happenedAt: new Date(),
          relatedUsers: achievementMatches.map((row) => row.userId),
          meta: {
            matches: achievementMatches.map((row) => ({
              userId: row.userId,
              achievementSimilarity: round(row.achievementSimilarity, 4),
            })),
          },
        });
      }
    }

    const ownBattle = battleProfilesByUser.get(userId);
    if (ownBattle && ownBattle.shots >= 120) {
      const battleMatches = [];
      for (const relatedId of relatedIds) {
        const relatedBattle = battleProfilesByUser.get(relatedId);
        if (!relatedBattle || relatedBattle.shots < 120) continue;

        const closeMetrics = [
          Math.abs(ownBattle.staticRatio - relatedBattle.staticRatio) <= 0.08,
          Math.abs(ownBattle.intervalCv - relatedBattle.intervalCv) <= 0.03,
          Math.abs(ownBattle.hiddenRatio - relatedBattle.hiddenRatio) <= 0.03,
          Math.abs(ownBattle.screenWidth - relatedBattle.screenWidth) <= 0.08,
          Math.abs(ownBattle.screenHeight - relatedBattle.screenHeight) <= 0.08,
          Math.abs(ownBattle.avgCursorDistancePx - relatedBattle.avgCursorDistancePx) <= 20,
        ].filter(Boolean).length;

        if (closeMetrics >= 4) {
          battleMatches.push({
            userId: relatedId,
            closeMetrics,
            staticDiff: Math.abs(ownBattle.staticRatio - relatedBattle.staticRatio),
            intervalDiff: Math.abs(ownBattle.intervalCv - relatedBattle.intervalCv),
          });
        }
      }

      if (battleMatches.length) {
        addSignal(ctx, {
          signal: 'battle_signature_cluster',
          score: clamp(10 + battleMatches.length * 4, 10, 24),
          category: 'cluster',
          summary: 'Связанные аккаунты показывают слишком похожую боевую сигнатуру',
          happenedAt: new Date(),
          relatedUsers: battleMatches.map((row) => row.userId),
          meta: {
            matches: battleMatches.map((row) => ({
              userId: row.userId,
              closeMetrics: row.closeMetrics,
              staticDiff: round(row.staticDiff, 4),
              intervalDiff: round(row.intervalDiff, 4),
            })),
          },
        });
      }
    }
  }
}

function evaluateBehaviorClusterSignals(contextsByUserId) {
  for (const ctx of contextsByUserId.values()) {
    const relatedIds = Array.from(ctx.relatedUsers);
    if (!relatedIds.length) continue;

    if (ctx.summary.directNavigationSignature && ctx.summary.directTargetViews >= 8) {
      const matches = relatedIds.filter((id) => {
        const relatedCtx = contextsByUserId.get(id);
        return relatedCtx && relatedCtx.summary.directNavigationSignature === ctx.summary.directNavigationSignature;
      });
      if (matches.length) {
        addSignal(ctx, {
          signal: 'navigation_pattern_cluster',
          score: clamp(8 + matches.length * 4, 8, 20),
          category: 'cluster',
          summary: 'Связанные аккаунты используют одинаковый паттерн direct-link навигации',
          happenedAt: new Date(),
          relatedUsers: matches,
          meta: {
            signature: ctx.summary.directNavigationSignature,
            matchedUsers: matches.length,
          },
        });
      }
    }

    if (ctx.summary.profitRoutineSignature && ctx.summary.profitableActions >= 8) {
      const matches = relatedIds.filter((id) => {
        const relatedCtx = contextsByUserId.get(id);
        return relatedCtx && relatedCtx.summary.profitRoutineSignature === ctx.summary.profitRoutineSignature;
      });
      if (matches.length) {
        addSignal(ctx, {
          signal: 'profit_schedule_cluster',
          score: clamp(8 + matches.length * 3, 8, 18),
          category: 'cluster',
          summary: 'Связанные аккаунты фармят по слишком похожему расписанию',
          happenedAt: new Date(),
          relatedUsers: matches,
          meta: {
            signature: ctx.summary.profitRoutineSignature,
            matchedUsers: matches.length,
          },
        });
      }
    }
  }
}

function sanitizeEvidence(evidence = []) {
  return sortByDate(evidence, 'happenedAt')
    .reverse()
    .slice(0, 100)
    .map((row) => ({
      happenedAt: row.happenedAt,
      category: row.category,
      signal: row.signal,
      score: round(row.score, 2),
      summary: row.summary,
      meta: row.meta,
    }));
}

function sanitizeTimeline(rows = []) {
  return rows.map((row) => ({
    dateKey: row.dateKey,
    score: round(row.score, 2),
    signalCount: row.signalCount,
    evidenceCount: row.evidenceCount,
    signals: uniq(row.signals),
  }));
}

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

