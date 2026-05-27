const {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildEvidenceEntry,
} = require('./evidenceScoring');
const {
  overlapDurationMs,
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

function appendSessionBehaviorEvidence(evidence, {
  signalHistory = [],
  sessions = [],
  crowdedIpRows = [],
  userIds = [],
  maxDevicesPerIp = 4,
} = {}) {
  const tokenMaps = new Map();
  const pushToken = (type, value, row) => {
    const safeValue = cleanText(value);
    if (!safeValue) return;
    const key = `${type}:${safeValue}`;
    if (!tokenMaps.has(key)) tokenMaps.set(key, []);
    tokenMaps.get(key).push(row);
  };
  (Array.isArray(signalHistory) ? signalHistory : []).forEach((row) => {
    pushToken('device', row?.deviceId, row);
    pushToken('fingerprint', row?.fingerprint, row);
    pushToken('profile', row?.profileKey, row);
  });

  const switchTransitions = [];
  tokenMaps.forEach((rows, key) => {
    const sorted = sortByDate(rows, 'createdAt');
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1];
      const next = sorted[index];
      if (cleanText(prev?.userId) === cleanText(next?.userId)) continue;
      const diffMs = Math.abs(new Date(next?.createdAt || 0).getTime() - new Date(prev?.createdAt || 0).getTime());
      if (!Number.isFinite(diffMs) || diffMs > 20 * 60 * 1000) continue;
      switchTransitions.push({
        token: key,
        fromUserId: cleanText(prev?.userId),
        toUserId: cleanText(next?.userId),
        diffMinutes: round(diffMs / 60000, 2),
        happenedAt: next?.createdAt || null,
      });
    }
  });
  if (switchTransitions.length >= 2) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'session_switch',
      category: 'sessions',
      score: Math.min(26, DETAIL_SCORES.session_switch + switchTransitions.length),
      summary: 'Аккаунты быстро сменяли друг друга на одном и том же следе устройства',
      count: switchTransitions.length,
      matchedUserIds: uniq(switchTransitions.flatMap((row) => [row.fromUserId, row.toUserId])),
      firstSeenAt: sortByDate(switchTransitions, 'happenedAt')[0]?.happenedAt || null,
      lastSeenAt: sortByDate(switchTransitions, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { transitions: switchTransitions.slice(0, 20) },
    }));
  }

  const syncPairs = [];
  const sessionList = sortByDate(sessions, 'startedAt');
  for (let index = 0; index < sessionList.length; index += 1) {
    for (let inner = index + 1; inner < sessionList.length; inner += 1) {
      const left = sessionList[index];
      const right = sessionList[inner];
      if (cleanText(left?.userId) === cleanText(right?.userId)) continue;
      const startDiffMs = Math.abs(new Date(left?.startedAt || 0).getTime() - new Date(right?.startedAt || 0).getTime());
      const leftEnd = left?.endedAt || left?.lastSeenAt || left?.startedAt;
      const rightEnd = right?.endedAt || right?.lastSeenAt || right?.startedAt;
      const endDiffMs = Math.abs(new Date(leftEnd || 0).getTime() - new Date(rightEnd || 0).getTime());
      const overlapMs = overlapDurationMs(left?.startedAt, leftEnd, right?.startedAt, rightEnd);
      if (startDiffMs <= 5 * 60 * 1000 && endDiffMs <= 10 * 60 * 1000) {
        syncPairs.push({
          type: 'sync',
          userIds: [cleanText(left?.userId), cleanText(right?.userId)],
          startedAt: left?.startedAt || right?.startedAt || null,
          startDiffMinutes: round(startDiffMs / 60000, 2),
          endDiffMinutes: round(endDiffMs / 60000, 2),
        });
      }
      if (overlapMs >= 10 * 60 * 1000) {
        syncPairs.push({
          type: 'parallel',
          userIds: [cleanText(left?.userId), cleanText(right?.userId)],
          startedAt: left?.startedAt || right?.startedAt || null,
          overlapMinutes: round(overlapMs / 60000, 2),
        });
      }
    }
  }

  const sessionSyncRows = syncPairs.filter((row) => row.type === 'sync');
  if (sessionSyncRows.length >= 2) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'session_sync',
      category: 'sessions',
      score: Math.min(24, DETAIL_SCORES.session_sync + sessionSyncRows.length * 2),
      summary: 'Разные аккаунты слишком синхронно входят и выходят',
      count: sessionSyncRows.length,
      matchedUserIds: uniq(sessionSyncRows.flatMap((row) => row.userIds)),
      firstSeenAt: sortByDate(sessionSyncRows, 'startedAt')[0]?.startedAt || null,
      lastSeenAt: sortByDate(sessionSyncRows, 'startedAt').slice(-1)[0]?.startedAt || null,
      details: { entries: sessionSyncRows.slice(0, 20) },
    }));
  }

  const parallelSessionRows = syncPairs.filter((row) => row.type === 'parallel');
  if (parallelSessionRows.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'parallel_session_overlap',
      category: 'sessions',
      score: Math.min(22, DETAIL_SCORES.parallel_session_overlap + parallelSessionRows.length * 2),
      summary: 'У связанных аккаунтов были параллельные сессии',
      count: parallelSessionRows.length,
      matchedUserIds: uniq(parallelSessionRows.flatMap((row) => row.userIds)),
      firstSeenAt: sortByDate(parallelSessionRows, 'startedAt')[0]?.startedAt || null,
      lastSeenAt: sortByDate(parallelSessionRows, 'startedAt').slice(-1)[0]?.startedAt || null,
      details: { entries: parallelSessionRows.slice(0, 20) },
    }));
  }

  const dailyLoginBuckets = new Map();
  (Array.isArray(signalHistory) ? signalHistory : [])
    .filter((row) => cleanText(row?.eventType) === 'login')
    .forEach((row) => {
      const at = new Date(row?.createdAt || 0);
      if (Number.isNaN(at.getTime())) return;
      const dateKey = at.toISOString().slice(0, 10);
      if (!dailyLoginBuckets.has(dateKey)) dailyLoginBuckets.set(dateKey, []);
      dailyLoginBuckets.get(dateKey).push({
        userId: cleanText(row?.userId),
        minutes: at.getUTCHours() * 60 + at.getUTCMinutes(),
        happenedAt: row?.createdAt || null,
      });
    });
  const sharedScheduleDays = [];
  dailyLoginBuckets.forEach((rows, dateKey) => {
    const sorted = [...rows].sort((a, b) => a.minutes - b.minutes);
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1];
      const next = sorted[index];
      if (prev.userId === next.userId) continue;
      if (Math.abs(prev.minutes - next.minutes) > 15) continue;
      sharedScheduleDays.push({
        dateKey,
        userIds: [prev.userId, next.userId],
        minuteDiff: Math.abs(prev.minutes - next.minutes),
        happenedAt: next.happenedAt,
      });
      break;
    }
  });
  if (sharedScheduleDays.length >= 3) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'shared_schedule',
      category: 'sessions',
      score: Math.min(18, DETAIL_SCORES.shared_schedule + sharedScheduleDays.length),
      summary: 'У аккаунтов повторяется почти одинаковое время входа по дням',
      count: sharedScheduleDays.length,
      matchedUserIds: uniq(sharedScheduleDays.flatMap((row) => row.userIds)),
      firstSeenAt: sortByDate(sharedScheduleDays, 'happenedAt')[0]?.happenedAt || null,
      lastSeenAt: sortByDate(sharedScheduleDays, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { days: sharedScheduleDays.slice(0, 20) },
    }));
  }

  const crowdedIpDetails = [];
  const crowdedIpMap = new Map();
  (Array.isArray(crowdedIpRows) ? crowdedIpRows : []).forEach((row) => {
    const ip = cleanText(row?.ip);
    if (!ip) return;
    if (!crowdedIpMap.has(ip)) crowdedIpMap.set(ip, new Set());
    const token = cleanText(row?.deviceId || row?.fingerprint || row?.weakFingerprint || row?.profileKey);
    if (token) crowdedIpMap.get(ip).add(token);
  });
  crowdedIpMap.forEach((tokens, ip) => {
    if (tokens.size > maxDevicesPerIp) {
      crowdedIpDetails.push({ ip, deviceCount: tokens.size });
    }
  });
  if (crowdedIpDetails.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'ip_device_crowding',
      category: 'sessions',
      score: Math.min(20, DETAIL_SCORES.ip_device_crowding + crowdedIpDetails.length * 2),
      summary: 'На одном IP замечено больше допустимого числа разных устройств',
      count: crowdedIpDetails.length,
      matchedUserIds: userIds,
      details: { ips: crowdedIpDetails.slice(0, 10), limit: maxDevicesPerIp },
    }));
  }

  return {
    switchTransitions,
    parallelSessionRows,
  };
}

module.exports = {
  appendSessionBehaviorEvidence,
};
