const crypto = require('crypto');
const { recordActivity } = require('./activityService');
const { awardRadianceForActivity } = require('./activityRadianceService');
const { getBaseRewardMultiplier, recordTransaction } = require('./scService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getDocById, listDocsByModel, mapDocRow, toIso, upsertDoc } = require('./documentStore');
const { getActiveUsersCountSnapshot } = require('./battleService');
const { applyTreeBlessingToReward } = require('./treeBlessingService');
const { normalizeSitePath, pathStartsWith } = require('../utils/sitePath');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const SESSION_MODEL = 'NightShiftRuntimeSession';
const SHIFT_SUMMARY_MODEL = 'NightShiftRuntimeSummary';

const HEARTBEAT_WINDOW_SECONDS = 5 * 60;
const EMPTY_WINDOWS_LIMIT = 3;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_WINDOW_SECONDS * 1000 * EMPTY_WINDOWS_LIMIT;
const MIN_ANOMALIES_PER_ACTIVE_HOUR = 60;
const MIN_ANOMALIES_PER_PAID_HOUR = 60;
const MAX_SHIFT_MS = 8 * 60 * 60 * 1000;
const SETTLEMENT_DELAY_MIN_MS = 2 * 60 * 1000;
const SETTLEMENT_DELAY_MAX_MS = 5 * 60 * 1000;
const SHIFT_START_HOUR = 19;
const SHIFT_END_HOUR = 6;
const SHIFT_SLOT_RATIO = 0.5;
const SEAT_LOCK_THRESHOLD_MINUTES = 181;
const SEAT_LOCK_THRESHOLD_SECONDS = SEAT_LOCK_THRESHOLD_MINUTES * 60;

const ANOMALY_MIN_INTERVAL_SECONDS = 15;
const ANOMALY_MAX_INTERVAL_SECONDS = 45;
const NIGHT_SHIFT_DEFAULT_SALARY = Object.freeze({ sc: 100, lm: 100, stars: 0.001 });
const WINDOW_SECTORS = Object.freeze([
  { id: 'fortune', name: 'Сектор Фортуны', url: '/fortune' },
  { id: 'bridges', name: 'Сектор Мостов', url: '/bridges' },
  { id: 'galaxy', name: 'Сектор Галактики', url: '/galaxy' },
  { id: 'chronicle', name: 'Архивы Хроники', url: '/chronicle' },
  { id: 'news', name: 'Отдел Новостей', url: '/news' },
  { id: 'shop', name: 'Торговый Квартал', url: '/shop' },
]);

function normalizeNightShiftSalary(value) {
  const sc = Number(value?.sc);
  const lm = Number(value?.lm);
  const stars = Number(value?.stars);

  if (sc === 10 && lm === 50 && stars === 0.01) {
    return { ...NIGHT_SHIFT_DEFAULT_SALARY };
  }

  if (!Number.isFinite(sc) || !Number.isFinite(lm) || !Number.isFinite(stars)) {
    return { ...NIGHT_SHIFT_DEFAULT_SALARY };
  }

  return {
    sc,
    lm,
    stars,
  };
}

function randomId(prefix) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function pad2(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, '0');
}

function formatShiftKey(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseShiftKey(key) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || '').trim());
  if (!match) return null;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getPreviousShiftKey(currentShiftKey) {
  const currentDate = parseShiftKey(currentShiftKey);
  if (!currentDate) return '';
  currentDate.setDate(currentDate.getDate() - 1);
  return formatShiftKey(currentDate);
}

function isShiftRestRequired(lastJoinedShiftKey, currentShiftKey) {
  const lastKey = String(lastJoinedShiftKey || '').trim();
  const currentKey = String(currentShiftKey || '').trim();
  if (!lastKey || !currentKey) return false;
  return lastKey === currentKey || lastKey === getPreviousShiftKey(currentKey);
}

function getShiftWindow(now = new Date()) {
  const base = now instanceof Date ? new Date(now) : new Date(now);
  const hour = base.getHours();

  const start = new Date(base);
  const end = new Date(base);

  if (hour >= SHIFT_START_HOUR) {
    start.setHours(SHIFT_START_HOUR, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    end.setHours(SHIFT_END_HOUR, 0, 0, 0);
    return {
      key: formatShiftKey(start),
      startAt: start,
      endAt: end,
      isOpen: true,
    };
  }

  if (hour < SHIFT_END_HOUR) {
    start.setDate(start.getDate() - 1);
    start.setHours(SHIFT_START_HOUR, 0, 0, 0);
    end.setHours(SHIFT_END_HOUR, 0, 0, 0);
    return {
      key: formatShiftKey(start),
      startAt: start,
      endAt: end,
      isOpen: true,
    };
  }

  start.setHours(SHIFT_START_HOUR, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  end.setHours(SHIFT_END_HOUR, 0, 0, 0);
  return {
    key: formatShiftKey(start),
    startAt: start,
    endAt: end,
    isOpen: false,
  };
}

function getShiftWindowByKey(shiftKey) {
  const shiftDate = parseShiftKey(shiftKey);
  if (!shiftDate) return null;
  const start = new Date(shiftDate);
  start.setHours(SHIFT_START_HOUR, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(SHIFT_END_HOUR, 0, 0, 0);
  return {
    key: formatShiftKey(start),
    startAt: start,
    endAt: end,
    isOpen: false,
  };
}

function normalizeResolvedAnomalies(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const next = [];

  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const anomalyId = String(row.anomalyId || '').trim();
    if (!anomalyId || seen.has(anomalyId)) continue;
    seen.add(anomalyId);
    const rawPagePath = String(row.pagePath || '').trim();
    next.push({
      anomalyId,
      pagePath: rawPagePath ? normalizeSitePath(rawPagePath) : '',
      clearedAt: row.clearedAt ? String(row.clearedAt) : null,
    });
  }

  return next;
}

function normalizeSuspiciousWindows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      return {
        index: Math.max(0, Math.floor(Number(row.index) || 0)),
        reason: String(row.reason || '').trim(),
        claimedCount: Math.max(0, Math.floor(Number(row.claimedCount) || 0)),
        acceptedCount: Math.max(0, Math.floor(Number(row.acceptedCount) || 0)),
        invalidCount: Math.max(0, Math.floor(Number(row.invalidCount) || 0)),
        reportedAt: row.reportedAt ? String(row.reportedAt) : null,
        details: Array.isArray(row.details)
          ? row.details
            .map((detail) => (detail && typeof detail === 'object'
              ? {
                anomalyId: String(detail.anomalyId || '').trim(),
                reason: String(detail.reason || '').trim(),
                pagePath: detail.pagePath ? normalizeSitePath(String(detail.pagePath || '').trim()) : '',
              }
              : null))
            .filter(Boolean)
            .slice(0, 20)
          : [],
      };
    })
    .filter(Boolean)
    .slice(-24);
}

function buildPageHitsFromResolved(resolvedRows = []) {
  const next = {};
  for (const row of normalizeResolvedAnomalies(resolvedRows)) {
    const pagePath = row.pagePath ? normalizeSitePath(String(row.pagePath || '').trim()) : '';
    if (!pagePath) continue;
    next[pagePath] = (Number(next[pagePath]) || 0) + 1;
  }
  return next;
}

function seededUnit(secret, windowIndex, itemIndex, channel = 0) {
  const input = `${String(secret || '')}:${Number(windowIndex) || 0}:${Number(itemIndex) || 0}:${Number(channel) || 0}`;
  const hash = crypto.createHash('sha256').update(input).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

function getSessionHardEndMs(runtime) {
  const startedAtMs = safeMs(runtime?.startedAt);
  const shiftEndsAtMs = safeMs(runtime?.shiftEndsAt);
  if (startedAtMs == null && shiftEndsAtMs == null) return null;
  const maxShiftEndMs = startedAtMs == null ? null : startedAtMs + MAX_SHIFT_MS;
  if (shiftEndsAtMs == null) return maxShiftEndMs;
  if (maxShiftEndMs == null) return shiftEndsAtMs;
  return Math.min(shiftEndsAtMs, maxShiftEndMs);
}

function buildWindowPlan(runtime, windowIndex) {
  const normalizedRuntime = normalizeRuntimeSession(runtime);
  if (!normalizedRuntime) return null;

  const startedAtMs = safeMs(normalizedRuntime.startedAt);
  if (startedAtMs == null) return null;

  const bounds = getWindowBounds(startedAtMs, windowIndex);
  const hardEndMs = getSessionHardEndMs(normalizedRuntime);
  if (hardEndMs != null && bounds.startedAt >= hardEndMs) return null;

  const effectiveEndMs = hardEndMs == null
    ? bounds.endedAt
    : Math.min(bounds.endedAt, hardEndMs);

  const anomalies = [];
  let cursorMs = bounds.startedAt;
  let anomalyIndex = 0;

  while (true) {
    const intervalUnit = seededUnit(normalizedRuntime.windowSecret, windowIndex, anomalyIndex, 1);
    const intervalSeconds = ANOMALY_MIN_INTERVAL_SECONDS + Math.floor(intervalUnit * ((ANOMALY_MAX_INTERVAL_SECONDS - ANOMALY_MIN_INTERVAL_SECONDS) + 1));
    cursorMs += intervalSeconds * 1000;
    if (cursorMs >= effectiveEndMs) break;

    const sectorUnit = seededUnit(normalizedRuntime.windowSecret, windowIndex, anomalyIndex, 2);
    const sectorIndex = Math.floor(sectorUnit * WINDOW_SECTORS.length) % WINDOW_SECTORS.length;
    const sector = WINDOW_SECTORS[sectorIndex] || WINDOW_SECTORS[0];
    const anomalyHash = crypto
      .createHash('sha1')
      .update(`${normalizedRuntime.windowSecret}:${windowIndex}:${anomalyIndex}:${sector.id}`)
      .digest('hex')
      .slice(0, 12);

    anomalies.push({
      id: `anomaly_${windowIndex}_${anomalyIndex}_${anomalyHash}`,
      sectorId: sector.id,
      sectorName: sector.name,
      sectorUrl: sector.url,
      spawnAt: toIso(cursorMs),
    });
    anomalyIndex += 1;
  }

  return {
    index: Math.max(0, Math.floor(Number(windowIndex) || 0)),
    startedAt: toIso(bounds.startedAt),
    endedAt: toIso(effectiveEndMs),
    anomalies,
  };
}

function validateHeartbeatWindow(windowPlan, resolvedRows, claimedCount) {
  const resolved = normalizeResolvedAnomalies(resolvedRows);
  const expectedById = new Map((Array.isArray(windowPlan?.anomalies) ? windowPlan.anomalies : []).map((row) => [String(row.id), row]));
  const accepted = [];
  const invalid = [];

  const windowStartMs = safeMs(windowPlan?.startedAt);
  const windowEndMs = safeMs(windowPlan?.endedAt);

  for (const row of resolved) {
    const expected = expectedById.get(String(row.anomalyId));
    if (!expected) {
      invalid.push({ anomalyId: row.anomalyId, reason: 'unexpected_anomaly', pagePath: row.pagePath });
      continue;
    }

    if (row.pagePath && !pathStartsWith(row.pagePath, String(expected.sectorUrl || ''))) {
      invalid.push({ anomalyId: row.anomalyId, reason: 'wrong_page', pagePath: row.pagePath });
      continue;
    }

    const clearedAtMs = safeMs(row.clearedAt);
    if (clearedAtMs != null && (
      (windowStartMs != null && clearedAtMs < windowStartMs) ||
      (windowEndMs != null && clearedAtMs > windowEndMs)
    )) {
      invalid.push({ anomalyId: row.anomalyId, reason: 'wrong_time', pagePath: row.pagePath });
      continue;
    }

    accepted.push({
      anomalyId: row.anomalyId,
      pagePath: row.pagePath || normalizeSitePath(String(expected.sectorUrl || '')),
      clearedAt: row.clearedAt || expected.spawnAt,
    });
  }

  const claimed = Math.max(Math.floor(Number(claimedCount) || 0), resolved.length);
  return {
    accepted,
    invalid,
    acceptedCount: accepted.length,
    claimedCount: claimed,
    pageHits: buildPageHitsFromResolved(accepted),
    suspicious: invalid.length > 0 || claimed > accepted.length,
  };
}

function shouldSendHourCheckpoint(windowIndex) {
  const safeIndex = Math.max(0, Math.floor(Number(windowIndex) || 0));
  return ((safeIndex + 1) % 12) === 0;
}

function sumHourlyAnomalies(value) {
  const hourly = cloneHourlyAnomalies(value);
  return Object.values(hourly).reduce((sum, count) => sum + Math.max(0, Math.floor(Number(count) || 0)), 0);
}

function normalizeFinalWindowReports(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const startedAt = row.startedAt ? String(row.startedAt) : '';
      const endedAt = row.endedAt ? String(row.endedAt) : '';
      if (!startedAt || !endedAt) return null;
      return {
        index: Math.max(0, Math.floor(Number(row.index) || 0)),
        startedAt,
        endedAt,
        resolvedAnomalies: normalizeResolvedAnomalies(row.resolvedAnomalies),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)
    .slice(0, 96);
}

function getTotalAnomaliesFromWindowReports(value) {
  return normalizeFinalWindowReports(value)
    .reduce((sum, row) => sum + (Array.isArray(row.resolvedAnomalies) ? row.resolvedAnomalies.length : 0), 0);
}

function stripWindowReportsFromFinalPayload(finalReport) {
  if (!finalReport || typeof finalReport !== 'object') return finalReport;
  const next = { ...finalReport };
  delete next.windowReports;
  return next;
}

function validateFinalShiftReport(runtime, finalReport) {
  const normalizedRuntime = normalizeRuntimeSession(runtime);
  const windowReports = normalizeFinalWindowReports(finalReport?.windowReports);
  if (!normalizedRuntime || !windowReports.length) {
    return {
      windowReports,
      claimedTotal: Math.max(0, Math.floor(Number(finalReport?.totalAnomalies) || 0)),
      acceptedTotal: 0,
      pageHits: normalizePageHits(finalReport?.pageHits),
      suspicious: false,
      suspiciousWindows: [],
    };
  }

  const suspiciousWindows = [];
  let claimedTotal = 0;
  let acceptedTotal = 0;
  let pageHits = {};

  for (const windowReport of windowReports) {
    const expectedWindow = buildWindowPlan(normalizedRuntime, windowReport.index);
    const claimedCount = Array.isArray(windowReport.resolvedAnomalies) ? windowReport.resolvedAnomalies.length : 0;
    claimedTotal += claimedCount;

    if (!expectedWindow) {
      suspiciousWindows.push({
        index: windowReport.index,
        reason: 'unexpected_window',
        claimedCount,
        acceptedCount: 0,
        invalidCount: claimedCount,
        reportedAt: finalReport?.endedAt || normalizedRuntime.endedAt || null,
        details: normalizeResolvedAnomalies(windowReport.resolvedAnomalies)
          .map((row) => ({
            anomalyId: row.anomalyId,
            reason: 'unexpected_window',
            pagePath: row.pagePath,
          }))
          .slice(0, 20),
      });
      continue;
    }

    const validation = validateHeartbeatWindow(expectedWindow, windowReport.resolvedAnomalies, claimedCount);
    acceptedTotal += validation.acceptedCount;
    pageHits = mergePageHits(pageHits, validation.pageHits);

    if (validation.suspicious) {
      suspiciousWindows.push({
        index: windowReport.index,
        reason: 'report_mismatch',
        claimedCount: validation.claimedCount,
        acceptedCount: validation.acceptedCount,
        invalidCount: validation.invalid.length,
        reportedAt: finalReport?.endedAt || normalizedRuntime.endedAt || null,
        details: validation.invalid,
      });
    }
  }

  return {
    windowReports,
    claimedTotal: Math.max(claimedTotal, Math.floor(Number(finalReport?.totalAnomalies) || 0)),
    acceptedTotal,
    pageHits: Object.keys(pageHits).length ? pageHits : normalizePageHits(finalReport?.pageHits),
    suspicious: suspiciousWindows.length > 0,
    suspiciousWindows: normalizeSuspiciousWindows(suspiciousWindows),
  };
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  const id = toId(userId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(id);
  if (!row) return null;
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,email,nickname,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getNightShiftFromUserData(userData) {
  const ns = userData?.nightShift && typeof userData.nightShift === 'object' ? userData.nightShift : {};
  const stats = ns.stats && typeof ns.stats === 'object' ? ns.stats : {};
  const totalEarnings = stats.totalEarnings && typeof stats.totalEarnings === 'object' ? stats.totalEarnings : {};
  return {
    isServing: Boolean(ns.isServing),
    sessionId: ns.sessionId || null,
    startTime: ns.startTime || null,
    lastActivityAt: ns.lastActivityAt || null,
    pendingSettlement: ns.pendingSettlement || null,
    anomalySeed: Number(ns.anomalySeed) || 0,
    anomalyMinIntervalSeconds: Number(ns.anomalyMinIntervalSeconds) || ANOMALY_MIN_INTERVAL_SECONDS,
    anomalyMaxIntervalSeconds: Number(ns.anomalyMaxIntervalSeconds) || ANOMALY_MAX_INTERVAL_SECONDS,
    acceptedAnomaliesCurrentSession: Number(ns.acceptedAnomaliesCurrentSession) || 0,
    payableHoursCurrent: Number(ns.payableHoursCurrent) || 0,
    consecutiveEmptyWindows: Number(ns.consecutiveEmptyWindows) || 0,
    lastCloseReason: ns.lastCloseReason || null,
    lastJoinedShiftKey: ns.lastJoinedShiftKey || null,
    shiftKey: ns.shiftKey || null,
    shiftEndsAt: ns.shiftEndsAt || null,
    seatLimitSnapshot: Math.max(0, Math.floor(Number(ns.seatLimitSnapshot) || 0)),
    occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(ns.occupiedSeatsSnapshot) || 0)),
    stats: {
      totalTimeMs: Number(stats.totalTimeMs) || 0,
      anomaliesCleared: Number(stats.anomaliesCleared) || 0,
      totalEarnings: {
        sc: Number(totalEarnings.sc) || 0,
        lm: Number(totalEarnings.lm) || 0,
        stars: Number(totalEarnings.stars) || 0,
      },
    },
  };
}

function mergeRuntimeIntoNightShift(baseNightShift, runtime) {
  const base = baseNightShift && typeof baseNightShift === 'object'
    ? baseNightShift
    : getNightShiftFromUserData({});

  const normalizedRuntime = normalizeRuntimeSession(runtime);
  if (!normalizedRuntime || normalizedRuntime.status !== 'active') {
    return base;
  }

  return {
    ...base,
    isServing: true,
    sessionId: normalizedRuntime.sessionId,
    startTime: normalizedRuntime.startedAt || base.startTime || null,
    lastActivityAt: normalizedRuntime.lastSeenAt || normalizedRuntime.lastHeartbeatAt || base.lastActivityAt || null,
    acceptedAnomaliesCurrentSession: normalizedRuntime.totalAcceptedAnomalies,
    payableHoursCurrent: normalizedRuntime.payableHours,
    consecutiveEmptyWindows: normalizedRuntime.consecutiveEmptyWindows,
    shiftKey: normalizedRuntime.shiftKey || base.shiftKey || null,
    shiftEndsAt: normalizedRuntime.shiftEndsAt || base.shiftEndsAt || null,
    seatLimitSnapshot: Math.max(0, Math.floor(Number(normalizedRuntime.seatLimitSnapshot) || 0)),
    occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(normalizedRuntime.occupiedSeatsSnapshot) || 0)),
  };
}

async function getSystemSettings() {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'SystemSettings')
    .maybeSingle();
  return {
    nightShiftSalary: normalizeNightShiftSalary(data?.data?.nightShiftSalary),
    nightShiftSchedule: data?.data?.nightShiftSchedule || { start: null, end: null },
  };
}

function safeMs(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getSettlementDelaySeconds() {
  const spread = SETTLEMENT_DELAY_MAX_MS - SETTLEMENT_DELAY_MIN_MS;
  const delayMs = SETTLEMENT_DELAY_MIN_MS + Math.floor(Math.random() * (spread + 1));
  return Math.floor(delayMs / 1000);
}

function buildSessionDocId(sessionId) {
  return `night_shift_runtime:${String(sessionId)}`;
}

function buildShiftSummaryDocId(shiftKey) {
  return `night_shift_summary:${String(shiftKey || '').trim()}`;
}

function getSyncConfig() {
  return {
    heartbeatWindowSeconds: HEARTBEAT_WINDOW_SECONDS,
    emptyWindowsLimit: EMPTY_WINDOWS_LIMIT,
    minAnomaliesPerActiveHour: MIN_ANOMALIES_PER_ACTIVE_HOUR,
    minAnomaliesPerPaidHour: MIN_ANOMALIES_PER_PAID_HOUR,
  };
}

function normalizePageHits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  for (const [pagePath, rawCount] of Object.entries(value)) {
    const rawPath = String(pagePath || '').trim();
    if (!rawPath) continue;
    const key = normalizeSitePath(rawPath);
    if (!key) continue;
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if (!count) continue;
    next[key] = count;
  }
  return next;
}

function mergePageHits(left, right) {
  const next = { ...(left && typeof left === 'object' ? left : {}) };
  const rhs = normalizePageHits(right);
  for (const [pagePath, count] of Object.entries(rhs)) {
    next[pagePath] = (Number(next[pagePath]) || 0) + count;
  }
  // Keep the payload bounded: we only need a compact "where user was active" summary.
  const keys = Object.keys(next);
  if (keys.length > 50) {
    keys
      .sort((a, b) => (Number(next[b]) || 0) - (Number(next[a]) || 0))
      .slice(50)
      .forEach((k) => { delete next[k]; });
  }
  return next;
}

function cloneWindowsList(value) {
  return Array.isArray(value)
    ? value
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const index = Math.max(0, Math.floor(Number(row.index) || 0));
        const startedAt = row.startedAt ? String(row.startedAt) : '';
        const endedAt = row.endedAt ? String(row.endedAt) : '';
        if (!startedAt || !endedAt) return null;
        return {
          index,
          startedAt,
          endedAt,
          anomalyCount: Math.max(0, Math.floor(Number(row.anomalyCount) || 0)),
          pageHits: normalizePageHits(row.pageHits),
          acceptedAt: row.acceptedAt ? String(row.acceptedAt) : null,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.index - right.index)
    : [];
}

function cloneAcceptedWindowIndexes(value) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((index) => Math.max(0, Math.floor(Number(index) || 0)))
    )
  ).sort((left, right) => left - right);
}

function cloneHourlyAnomalies(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  for (const [hourIndex, rawCount] of Object.entries(value)) {
    const key = String(Math.max(0, Math.floor(Number(hourIndex) || 0)));
    next[key] = Math.max(0, Math.floor(Number(rawCount) || 0));
  }
  return next;
}

function cloneEvaluatedHours(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((hour) => Math.max(0, Math.floor(Number(hour) || 0))))).sort((a, b) => a - b)
    : [];
}

function normalizeRuntimeSession(row) {
  if (!row || typeof row !== 'object') return null;
  const legacyWindows = cloneWindowsList(row.windows);
  const acceptedWindowIndexes = cloneAcceptedWindowIndexes(
    Array.isArray(row.acceptedWindowIndexes)
      ? row.acceptedWindowIndexes
      : legacyWindows.map((window) => window.index)
  );
  const lastAcceptedRaw = Number(row.lastAcceptedWindowIndex);
  const lastAcceptedWindowIndex = Number.isFinite(lastAcceptedRaw)
    ? Math.max(-1, Math.floor(lastAcceptedRaw))
    : (acceptedWindowIndexes.length ? acceptedWindowIndexes[acceptedWindowIndexes.length - 1] : -1);
  return {
    ...row,
    status: row.status || 'active',
    sessionId: String(row.sessionId || ''),
    userId: String(row.userId || ''),
    shiftKey: row.shiftKey ? String(row.shiftKey) : null,
    shiftStartsAt: row.shiftStartsAt || null,
    shiftEndsAt: row.shiftEndsAt || null,
    startedAt: row.startedAt || null,
    lastHeartbeatAt: row.lastHeartbeatAt || null,
    lastSeenAt: row.lastSeenAt || null,
    windowSecret: row.windowSecret ? String(row.windowSecret) : '',
    issuedWindowIndex: Math.max(0, Math.floor(Number(row.issuedWindowIndex) || 0)),
    anomalySeed: Number(row.anomalySeed) || 0,
    anomalyMinIntervalSeconds: Number(row.anomalyMinIntervalSeconds) || ANOMALY_MIN_INTERVAL_SECONDS,
    anomalyMaxIntervalSeconds: Number(row.anomalyMaxIntervalSeconds) || ANOMALY_MAX_INTERVAL_SECONDS,
    consecutiveEmptyWindows: Math.max(0, Math.floor(Number(row.consecutiveEmptyWindows) || 0)),
    totalAcceptedAnomalies: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
    totalReportedAnomalies: Math.max(0, Math.floor(Number(row.totalReportedAnomalies) || 0)),
    totalPageHits: normalizePageHits(row.totalPageHits),
    hourlyAnomalies: cloneHourlyAnomalies(row.hourlyAnomalies),
    evaluatedHours: cloneEvaluatedHours(row.evaluatedHours),
    payableHours: Math.max(0, Math.floor(Number(row.payableHours) || 0)),
    seatLimitSnapshot: Math.max(0, Math.floor(Number(row.seatLimitSnapshot) || 0)),
    activeUsersCountSnapshot: Math.max(0, Math.floor(Number(row.activeUsersCountSnapshot) || 0)),
    occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(row.occupiedSeatsSnapshot) || 0)),
    seatRetained: Boolean(row.seatRetained),
    lastAcceptedWindowIndex,
    acceptedWindowIndexes: undefined,
    windows: undefined,
    settlementStatus: row.settlementStatus || null,
    settlementDueAt: row.settlementDueAt || null,
    reward: row.reward || null,
    closeReason: row.closeReason || null,
    finalReport: row.finalReport && typeof row.finalReport === 'object' ? row.finalReport : null,
    statsCommitted: Boolean(row.statsCommitted),
    salaryRates: normalizeNightShiftSalary(row.salaryRates),
    suspiciousWindows: normalizeSuspiciousWindows(row.suspiciousWindows),
    reviewStatus: row.reviewStatus || 'clean',
    reviewActionAt: row.reviewActionAt || null,
    reviewActionBy: row.reviewActionBy || null,
    reviewPenalty: row.reviewPenalty && typeof row.reviewPenalty === 'object' ? row.reviewPenalty : null,
    finalVerificationStatus: row.finalVerificationStatus || 'none',
    finalVerifiedAt: row.finalVerifiedAt || null,
    finalVerificationMismatchCount: Math.max(0, Math.floor(Number(row.finalVerificationMismatchCount) || 0)),
  };
}

async function listRuntimeSessions() {
  const rows = await listDocsByModel(SESSION_MODEL, { limit: 5000 });
  return rows.map(normalizeRuntimeSession).filter(Boolean);
}

async function getRuntimeSession(sessionId) {
  return normalizeRuntimeSession(await getDocById(buildSessionDocId(sessionId)));
}

function normalizeShiftSummary(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    shiftKey: row.shiftKey ? String(row.shiftKey) : null,
    shiftStartsAt: row.shiftStartsAt || null,
    shiftEndsAt: row.shiftEndsAt || null,
    activeUsersCountSnapshot: Math.max(0, Math.floor(Number(row.activeUsersCountSnapshot) || 0)),
    seatLimit: Math.max(0, Math.floor(Number(row.seatLimit) || 0)),
    occupiedSeats: Math.max(0, Math.floor(Number(row.occupiedSeats) || 0)),
    activeServingCount: Math.max(0, Math.floor(Number(row.activeServingCount) || 0)),
    retainedSeats: Math.max(0, Math.floor(Number(row.retainedSeats) || 0)),
  };
}

async function getShiftSummary(shiftKey) {
  const safeShiftKey = String(shiftKey || '').trim();
  if (!safeShiftKey) return null;
  return normalizeShiftSummary(await getDocById(buildShiftSummaryDocId(safeShiftKey)));
}

async function writeShiftSummary(shiftKey, summary, { createdAt = null, updatedAt = new Date() } = {}) {
  const safeShiftKey = String(shiftKey || '').trim();
  if (!safeShiftKey) return null;
  const normalized = normalizeShiftSummary({
    ...(summary && typeof summary === 'object' ? summary : {}),
    shiftKey: safeShiftKey,
  });
  if (!normalized) return null;
  await upsertDoc({
    id: buildShiftSummaryDocId(safeShiftKey),
    model: SHIFT_SUMMARY_MODEL,
    data: normalized,
    createdAt: createdAt || updatedAt,
    updatedAt,
  });
  return normalized;
}

async function rebuildShiftSummaryCounters(summary, { now = new Date() } = {}) {
  const normalizedSummary = normalizeShiftSummary(summary);
  if (!normalizedSummary?.shiftKey) return normalizedSummary;
  const rows = await listRuntimeSessionsByFilters({
    shiftKey: normalizedSummary.shiftKey,
    status: ['active', 'ended'],
    limit: 5000,
  });
  const occupiedUsers = new Set();
  const retainedUsers = new Set();
  let activeServingCount = 0;

  for (const row of rows) {
    if (!row?.userId) continue;
    const currentUserId = String(row.userId);
    if (row.status === 'active') {
      activeServingCount += 1;
      occupiedUsers.add(currentUserId);
      continue;
    }
    if (row.seatRetained) {
      retainedUsers.add(currentUserId);
      occupiedUsers.add(currentUserId);
    }
  }

  return writeShiftSummary(normalizedSummary.shiftKey, {
    ...normalizedSummary,
    occupiedSeats: occupiedUsers.size,
    activeServingCount,
    retainedSeats: retainedUsers.size,
  }, { updatedAt: now });
}

async function getOrCreateShiftSummary(shiftWindow, now = new Date()) {
  const shiftKey = String(shiftWindow?.key || '').trim();
  if (!shiftKey) return null;

  const existing = await getShiftSummary(shiftKey);
  if (existing) return existing;

  const activeUsersCount = Math.max(0, Number(await getActiveUsersCountSnapshot(now)) || 0);
  const seatLimit = Math.max(0, Math.floor(activeUsersCount * SHIFT_SLOT_RATIO));
  let summary = await writeShiftSummary(shiftKey, {
    shiftKey,
    shiftStartsAt: toIso(shiftWindow?.startAt || now),
    shiftEndsAt: toIso(shiftWindow?.endAt || now),
    activeUsersCountSnapshot: activeUsersCount,
    seatLimit,
    occupiedSeats: 0,
    activeServingCount: 0,
    retainedSeats: 0,
  }, { createdAt: now, updatedAt: now });

  const rows = await listRuntimeSessionsByFilters({
    shiftKey,
    status: ['active', 'ended'],
    limit: 5000,
  });
  if (rows.length) {
    summary = await rebuildShiftSummaryCounters(summary, { now });
  }

  return summary;
}

async function patchShiftSummary(shiftKey, patch, { summary = null, now = new Date() } = {}) {
  const baseSummary = normalizeShiftSummary(summary || await getShiftSummary(shiftKey));
  if (!baseSummary) return null;
  return writeShiftSummary(shiftKey, {
    ...baseSummary,
    ...(patch && typeof patch === 'object' ? patch : {}),
  }, { updatedAt: now });
}

async function reserveShiftSeat(shiftWindow, { now = new Date() } = {}) {
  const summary = await getOrCreateShiftSummary(shiftWindow, now);
  if (!summary) {
    return {
      activeUsersCount: 0,
      seatLimit: 0,
      occupiedSeats: 0,
      freeSeats: 0,
      activeServingCount: 0,
      retainedSeats: 0,
      reserved: false,
    };
  }

  if (summary.seatLimit <= 0 || summary.occupiedSeats >= summary.seatLimit) {
    return {
      activeUsersCount: summary.activeUsersCountSnapshot,
      seatLimit: summary.seatLimit,
      occupiedSeats: summary.occupiedSeats,
      freeSeats: Math.max(0, summary.seatLimit - summary.occupiedSeats),
      activeServingCount: summary.activeServingCount,
      retainedSeats: summary.retainedSeats,
      reserved: false,
    };
  }

  const nextSummary = await patchShiftSummary(summary.shiftKey, {
    occupiedSeats: summary.occupiedSeats + 1,
    activeServingCount: summary.activeServingCount + 1,
  }, { summary, now });

  return {
    activeUsersCount: nextSummary.activeUsersCountSnapshot,
    seatLimit: nextSummary.seatLimit,
    occupiedSeats: nextSummary.occupiedSeats,
    freeSeats: Math.max(0, nextSummary.seatLimit - nextSummary.occupiedSeats),
    activeServingCount: nextSummary.activeServingCount,
    retainedSeats: nextSummary.retainedSeats,
    reserved: true,
  };
}

async function applyShiftSeatRelease(runtime, { seatRetained = false, now = new Date() } = {}) {
  const normalizedRuntime = normalizeRuntimeSession(runtime);
  if (!normalizedRuntime?.shiftKey) return null;

  const summary = await getShiftSummary(normalizedRuntime.shiftKey);
  if (!summary) return null;

  const nextPatch = {
    activeServingCount: Math.max(0, summary.activeServingCount - 1),
  };

  if (seatRetained) {
    nextPatch.occupiedSeats = summary.occupiedSeats;
    nextPatch.retainedSeats = Math.min(summary.seatLimit, summary.retainedSeats + 1);
  } else {
    nextPatch.occupiedSeats = Math.max(0, summary.occupiedSeats - 1);
    nextPatch.retainedSeats = Math.min(summary.retainedSeats, nextPatch.occupiedSeats);
  }

  return patchShiftSummary(summary.shiftKey, nextPatch, { summary, now });
}

async function listRuntimeSessionsByFilters({
  status = null,
  settlementStatus = null,
  userId = null,
  shiftKey = null,
  reviewStatus = null,
  finalVerificationStatus = null,
  limit = 5000,
} = {}) {
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 5000));
  let query = supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', SESSION_MODEL)
    .limit(safeLimit);

  const statuses = Array.isArray(status)
    ? status.map((item) => String(item || '').trim()).filter(Boolean)
    : (status ? [String(status).trim()] : []);
  if (statuses.length === 1) {
    query = query.eq('data->>status', statuses[0]);
  } else if (statuses.length > 1) {
    query = query.in('data->>status', statuses);
  }

  const settlement = String(settlementStatus || '').trim();
  if (settlement) {
    query = query.eq('data->>settlementStatus', settlement);
  }

  const uid = String(userId || '').trim();
  if (uid) {
    query = query.eq('data->>userId', uid);
  }

  const safeShiftKey = String(shiftKey || '').trim();
  if (safeShiftKey) {
    query = query.eq('data->>shiftKey', safeShiftKey);
  }

  const safeReviewStatus = String(reviewStatus || '').trim();
  if (safeReviewStatus) {
    query = query.eq('data->>reviewStatus', safeReviewStatus);
  }

  const safeFinalVerificationStatus = String(finalVerificationStatus || '').trim();
  if (safeFinalVerificationStatus) {
    query = query.eq('data->>finalVerificationStatus', safeFinalVerificationStatus);
  }

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];
  return data.map(mapDocRow).map(normalizeRuntimeSession).filter(Boolean);
}

async function updateRuntimeSessionFast(sessionId, nextRuntime, { updatedAt = new Date() } = {}) {
  const supabase = getSupabaseClient();
  const nowIso = toIso(updatedAt);
  const payload = {
    ...nextRuntime,
    updatedAt: nowIso,
  };

  const { error } = await supabase
    .from(DOC_TABLE)
    .update({
      data: payload,
      updated_at: nowIso,
    })
    .eq('id', buildSessionDocId(sessionId))
    .eq('model', SESSION_MODEL);

  if (error) {
    throw error;
  }

  return normalizeRuntimeSession(payload);
}

async function patchRuntimeSession(sessionId, patch, { runtime = null, now = new Date() } = {}) {
  const baseRuntime = normalizeRuntimeSession(runtime || await getRuntimeSession(sessionId));
  if (!baseRuntime) return null;
  const nextRuntime = normalizeRuntimeSession({
    ...baseRuntime,
    ...(patch && typeof patch === 'object' ? patch : {}),
  });
  if (!nextRuntime) return null;
  return updateRuntimeSessionFast(sessionId, nextRuntime, { updatedAt: now });
}

async function getActiveRuntimeForUser(userId) {
  const uid = String(userId || '');
  if (!uid) return null;
  const rows = await listRuntimeSessionsByFilters({
    status: 'active',
    userId: uid,
    limit: 1,
  });
  return rows[0] || null;
}

async function getNightShiftStatusForUser(userId) {
  const userRow = await getUserRowById(userId);
  if (!userRow) return null;

  const userData = getUserData(userRow);
  const storedNightShift = getNightShiftFromUserData(userData);
  if (!storedNightShift.isServing || !storedNightShift.sessionId) {
    return storedNightShift;
  }

  const runtime = await getRuntimeSession(storedNightShift.sessionId);
  if (!runtime || runtime.status !== 'active' || String(runtime.userId) !== String(userRow.id)) {
    return storedNightShift;
  }

  return {
    ...mergeRuntimeIntoNightShift(storedNightShift, runtime),
    currentWindow: buildWindowPlan(runtime, runtime.issuedWindowIndex),
  };
}

async function getShiftSeatSnapshot(shiftKey, now = new Date()) {
  const safeShiftKey = String(shiftKey || '').trim();
  if (!safeShiftKey) {
    return {
      activeUsersCount: 0,
      seatLimit: 0,
      occupiedSeats: 0,
      freeSeats: 0,
    };
  }
  const shiftWindow = getShiftWindowByKey(safeShiftKey);
  const summary = await getOrCreateShiftSummary({
    key: safeShiftKey,
    startAt: shiftWindow?.startAt || now,
    endAt: shiftWindow?.endAt || now,
  }, now);
  const activeUsersCount = Math.max(0, Number(summary?.activeUsersCountSnapshot) || 0);
  const seatLimit = Math.max(0, Number(summary?.seatLimit) || 0);
  const occupiedSeats = Math.max(0, Number(summary?.occupiedSeats) || 0);
  return {
    activeUsersCount,
    seatLimit,
    occupiedSeats,
    freeSeats: Math.max(0, seatLimit - occupiedSeats),
  };
}

function getHourIndex(startedAtMs, windowStartedAtMs) {
  return Math.max(0, Math.floor((windowStartedAtMs - startedAtMs) / (60 * 60 * 1000)));
}

function getWindowIndex(startedAtMs, windowStartedAtMs) {
  return Math.max(0, Math.floor((windowStartedAtMs - startedAtMs) / (HEARTBEAT_WINDOW_SECONDS * 1000)));
}

function getWindowBounds(startedAtMs, windowIndex) {
  const startedAt = startedAtMs + (windowIndex * HEARTBEAT_WINDOW_SECONDS * 1000);
  const endedAt = startedAt + (HEARTBEAT_WINDOW_SECONDS * 1000);
  return {
    startedAt,
    endedAt,
  };
}

function parseHeartbeatPayload(runtime, payload = {}) {
  const startedAtMs = safeMs(runtime.startedAt);
  if (startedAtMs == null) return null;

  const rawWindowStartedAtMs = safeMs(payload.windowStartedAt);
  if (rawWindowStartedAtMs == null || rawWindowStartedAtMs < startedAtMs) return null;

  const windowIndex = getWindowIndex(startedAtMs, rawWindowStartedAtMs);
  const bounds = getWindowBounds(startedAtMs, windowIndex);

  return {
    index: windowIndex,
    startedAt: toIso(bounds.startedAt),
    endedAt: toIso(bounds.endedAt),
    anomalyCount: Math.max(0, Math.floor(Number(payload.anomalyCount) || 0)),
    pageHits: normalizePageHits(payload.pageHits),
    hourIndex: getHourIndex(startedAtMs, bounds.startedAt),
  };
}

function parseHourCheckpointPayload(heartbeatWindow, payload = {}) {
  const expectedHourIndex = Math.max(0, Math.floor(Number(heartbeatWindow?.hourIndex) || 0));
  const rawHourIndex = payload?.hourIndex;
  const rawHourAnomalyCount = payload?.hourAnomalyCount;
  const checkpointRequired = shouldSendHourCheckpoint(heartbeatWindow?.index);

  if (rawHourIndex == null && rawHourAnomalyCount == null) {
    if (checkpointRequired) return null;
    return { present: false, hourIndex: expectedHourIndex, anomalyCount: 0 };
  }

  if (!checkpointRequired) return null;

  const hourIndex = Math.max(0, Math.floor(Number(rawHourIndex) || 0));
  if (hourIndex !== expectedHourIndex) return null;

  return {
    present: true,
    hourIndex,
    anomalyCount: Math.max(0, Math.floor(Number(rawHourAnomalyCount) || 0)),
  };
}

function evaluateCompletedHours(runtime, effectiveEndMs) {
  const startedAtMs = safeMs(runtime.startedAt);
  if (startedAtMs == null) {
    return {
      evaluatedHours: cloneEvaluatedHours(runtime.evaluatedHours),
      payableHours: Math.max(0, Math.floor(Number(runtime.payableHours) || 0)),
      shouldClose: false,
      closeReason: null,
      hourAnomalies: 0,
    };
  }

  const completedHours = Math.max(0, Math.floor((effectiveEndMs - startedAtMs) / (60 * 60 * 1000)));
  const evaluatedHours = cloneEvaluatedHours(runtime.evaluatedHours);
  const evaluatedSet = new Set(evaluatedHours);
  let payableHours = Math.max(0, Math.floor(Number(runtime.payableHours) || 0));
  let shouldClose = false;
  let closeReason = null;

  for (let hourIndex = 0; hourIndex < completedHours; hourIndex += 1) {
    if (evaluatedSet.has(hourIndex)) continue;
    const anomalies = Math.max(0, Math.floor(Number(runtime.hourlyAnomalies?.[String(hourIndex)]) || 0));
    evaluatedSet.add(hourIndex);
    evaluatedHours.push(hourIndex);
    if (anomalies >= MIN_ANOMALIES_PER_PAID_HOUR) {
      payableHours += 1;
    }
    if (!shouldClose && anomalies < MIN_ANOMALIES_PER_ACTIVE_HOUR) {
      shouldClose = true;
      closeReason = 'low_hour_activity';
    }
  }

  const currentHourIndex = getHourIndex(startedAtMs, Math.max(startedAtMs, effectiveEndMs - 1));
  const hourAnomalies = Math.max(0, Math.floor(Number(runtime.hourlyAnomalies?.[String(currentHourIndex)]) || 0));

  return {
    evaluatedHours,
    payableHours,
    shouldClose,
    closeReason,
    hourAnomalies,
  };
}

function hasHourEvaluationChanged(runtime, evaluated) {
  const currentEvaluated = cloneEvaluatedHours(runtime?.evaluatedHours);
  const nextEvaluated = cloneEvaluatedHours(evaluated?.evaluatedHours);
  if (currentEvaluated.length !== nextEvaluated.length) return true;
  if (currentEvaluated.some((value, index) => value !== nextEvaluated[index])) return true;
  return Math.max(0, Math.floor(Number(runtime?.payableHours) || 0)) !== Math.max(0, Math.floor(Number(evaluated?.payableHours) || 0));
}

async function syncCompletedHours(runtime, effectiveEndMs, updatedAt = new Date()) {
  const evaluated = evaluateCompletedHours(runtime, effectiveEndMs);
  if (!hasHourEvaluationChanged(runtime, evaluated)) {
    return {
      runtime,
      evaluated,
      changed: false,
    };
  }

  const nextRuntime = normalizeRuntimeSession({
    ...runtime,
    evaluatedHours: evaluated.evaluatedHours,
    payableHours: evaluated.payableHours,
  });

  await updateRuntimeSessionFast(nextRuntime.sessionId, nextRuntime, { updatedAt });

  return {
    runtime: nextRuntime,
    evaluated,
    changed: true,
  };
}

async function commitShiftStatsIfNeeded({ runtime, userId, totalDurationSeconds, totalAcceptedAnomalies, endedAt }) {
  if (runtime.statsCommitted) return;
  const userRow = await getUserRowById(userId);
  if (!userRow) return;
  const userData = getUserData(userRow);
  const currentNightShift = getNightShiftFromUserData(userData);
  const nextNightShift = {
    ...currentNightShift,
    stats: {
      totalTimeMs: (Number(currentNightShift.stats?.totalTimeMs) || 0) + (Math.max(0, Number(totalDurationSeconds) || 0) * 1000),
      anomaliesCleared: (Number(currentNightShift.stats?.anomaliesCleared) || 0) + Math.max(0, Number(totalAcceptedAnomalies) || 0),
      totalEarnings: {
        sc: Number(currentNightShift.stats?.totalEarnings?.sc) || 0,
        lm: Number(currentNightShift.stats?.totalEarnings?.lm) || 0,
        stars: Number(currentNightShift.stats?.totalEarnings?.stars) || 0,
      },
    },
  };

  await updateUserDataById(userRow.id, { nightShift: nextNightShift });
  await upsertDoc({
    id: buildSessionDocId(runtime.sessionId),
    model: SESSION_MODEL,
    data: {
      ...runtime,
      statsCommitted: true,
      endedAt: runtime.endedAt || toIso(endedAt),
    },
    updatedAt: endedAt,
  });
}

async function finalizeShiftSession({
  runtime,
  userId,
  now = new Date(),
  closeReason = 'manual_exit',
  finalReport = null,
}) {
  const normalizedRuntime = normalizeRuntimeSession(runtime);
  if (!normalizedRuntime) {
    throw new Error('night_shift_session_not_found');
  }

  const startedAtMs = safeMs(normalizedRuntime.startedAt);
  const nowMs = now.getTime();
  const hardEndMs = getSessionHardEndMs(normalizedRuntime);
  const effectiveEndMs = startedAtMs == null
    ? nowMs
    : Math.min(nowMs, hardEndMs == null ? nowMs : hardEndMs);
  const evaluated = evaluateCompletedHours(normalizedRuntime, effectiveEndMs);
  const totalDurationSeconds = startedAtMs == null ? 0 : Math.max(0, Math.floor((effectiveEndMs - startedAtMs) / 1000));
  const finalWindowReports = normalizeFinalWindowReports(finalReport?.windowReports);
  const reportedTotalAnomalies = Math.max(
    0,
    Math.floor(
      Number(finalReport?.totalAnomalies)
      || getTotalAnomaliesFromWindowReports(finalWindowReports)
      || Number(normalizedRuntime.totalReportedAnomalies)
      || sumHourlyAnomalies(normalizedRuntime.hourlyAnomalies)
      || 0
    )
  );
  const reportedPageHits = normalizePageHits(finalReport?.pageHits);
  const seatRetained = totalDurationSeconds >= SEAT_LOCK_THRESHOLD_SECONDS;
  const finalPayload = {
    startedAt: finalReport?.startedAt || normalizedRuntime.startedAt || null,
    endedAt: finalReport?.endedAt || toIso(effectiveEndMs),
    totalDurationSeconds: Math.max(0, Math.floor(Number(finalReport?.totalDurationSeconds) || totalDurationSeconds)),
    totalAnomalies: reportedTotalAnomalies,
    pageHits: Object.keys(reportedPageHits).length ? reportedPageHits : normalizedRuntime.totalPageHits,
    windowReports: finalWindowReports,
  };

  const paidHours = Math.max(0, Math.floor(Number(evaluated.payableHours) || 0));
  const salaryRates = normalizeNightShiftSalary(normalizedRuntime.salaryRates);
  const reward = {
    sc: Math.floor((Number(salaryRates.sc) || 0) * paidHours),
    lm: Math.floor((Number(salaryRates.lm) || 0) * paidHours),
    stars: Number(((Number(salaryRates.stars) || 0) * paidHours).toFixed(4)),
  };

  const hasReward = paidHours > 0 && (reward.sc > 0 || reward.lm > 0 || reward.stars > 0);
  const delaySeconds = hasReward ? getSettlementDelaySeconds() : 0;
  const settlementDueAt = hasReward ? new Date(now.getTime() + (delaySeconds * 1000)) : null;

  const nextRuntime = {
    ...normalizedRuntime,
    status: 'ended',
    endedAt: toIso(effectiveEndMs),
    closeReason,
    evaluatedHours: evaluated.evaluatedHours,
    payableHours: paidHours,
    totalAcceptedAnomalies: reportedTotalAnomalies,
    totalReportedAnomalies: finalPayload.totalAnomalies,
    finalReport: finalPayload,
    settlementStatus: hasReward ? 'queued' : 'none',
    settlementDueAt: settlementDueAt ? toIso(settlementDueAt) : null,
    reward,
    seatRetained,
    finalVerificationStatus: finalWindowReports.length ? 'queued' : 'none',
    finalVerifiedAt: null,
    finalVerificationMismatchCount: 0,
  };

  const shiftSummary = await applyShiftSeatRelease(normalizedRuntime, {
    seatRetained,
    now,
  });
  if (shiftSummary) {
    nextRuntime.seatLimitSnapshot = shiftSummary.seatLimit;
    nextRuntime.activeUsersCountSnapshot = shiftSummary.activeUsersCountSnapshot;
    nextRuntime.occupiedSeatsSnapshot = shiftSummary.occupiedSeats;
  }

  await upsertDoc({
    id: buildSessionDocId(normalizedRuntime.sessionId),
    model: SESSION_MODEL,
    data: nextRuntime,
    updatedAt: now,
  });

  await commitShiftStatsIfNeeded({
    runtime: nextRuntime,
    userId,
    totalDurationSeconds: finalPayload.totalDurationSeconds,
    totalAcceptedAnomalies: reportedTotalAnomalies,
    endedAt: now,
  });

  const userRow = await getUserRowById(userId);
  if (!userRow) throw new Error('user_not_found');
  const userData = getUserData(userRow);
  const currentNightShift = getNightShiftFromUserData(userData);
  await updateUserDataById(userId, {
    nightShift: {
      ...currentNightShift,
      isServing: false,
      sessionId: null,
      startTime: null,
      lastActivityAt: toIso(now),
      pendingSettlement: hasReward ? {
        sessionId: normalizedRuntime.sessionId,
        dueAt: toIso(settlementDueAt),
        reward,
        payableHours: paidHours,
      } : null,
      shiftKey: normalizedRuntime.shiftKey || currentNightShift.shiftKey || null,
      shiftEndsAt: normalizedRuntime.shiftEndsAt || currentNightShift.shiftEndsAt || null,
      seatLimitSnapshot: Math.max(0, Math.floor(Number(nextRuntime.seatLimitSnapshot) || Number(currentNightShift.seatLimitSnapshot) || 0)),
      occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(nextRuntime.occupiedSeatsSnapshot) || Number(currentNightShift.occupiedSeatsSnapshot) || 0)),
      acceptedAnomaliesCurrentSession: 0,
      payableHoursCurrent: 0,
      consecutiveEmptyWindows: 0,
      lastCloseReason: closeReason,
    },
  });

  return {
    runtime: nextRuntime,
    reward,
    settlementEtaSeconds: delaySeconds,
    payableHours: paidHours,
    queued: hasReward,
    closeReason,
    totalDurationSeconds: finalPayload.totalDurationSeconds,
    totalAcceptedAnomalies: reportedTotalAnomalies,
  };
}

async function startShiftForUser(userId) {
  const userRow = await getUserRowById(userId);
  if (!userRow) {
    throw new Error('user_not_found');
  }

  const userData = getUserData(userRow);
  const currentNightShift = getNightShiftFromUserData(userData);
  if (currentNightShift.isServing) {
    throw new Error('shift_already_active');
  }

  const activeRuntime = await getActiveRuntimeForUser(userRow.id);
  if (activeRuntime) {
    throw new Error('shift_already_active');
  }

  const settings = await getSystemSettings();
  const now = new Date();
  const shiftWindow = getShiftWindow(now);
  if (!shiftWindow.isOpen) {
    throw new Error('shift_schedule_closed');
  }

  if (isShiftRestRequired(currentNightShift.lastJoinedShiftKey, shiftWindow.key)) {
    throw new Error('shift_rest_required');
  }

  const seats = await reserveShiftSeat(shiftWindow, { now });
  if (seats.seatLimit <= 0 || !seats.reserved) {
    throw new Error('shift_slots_full');
  }

  const sessionId = randomId('night_shift');
  const runtimeDoc = normalizeRuntimeSession({
    sessionId,
    userId: String(userRow.id),
    status: 'active',
    shiftKey: shiftWindow.key,
    shiftStartsAt: toIso(shiftWindow.startAt),
    shiftEndsAt: toIso(shiftWindow.endAt),
    startedAt: toIso(now),
    lastHeartbeatAt: toIso(now),
    lastSeenAt: toIso(now),
    windowSecret: randomId('night_shift_window'),
    issuedWindowIndex: 0,
    consecutiveEmptyWindows: 0,
    totalAcceptedAnomalies: 0,
    totalReportedAnomalies: 0,
    totalPageHits: {},
    hourlyAnomalies: {},
    evaluatedHours: [],
    payableHours: 0,
    seatLimitSnapshot: seats.seatLimit,
    activeUsersCountSnapshot: seats.activeUsersCount,
    occupiedSeatsSnapshot: seats.occupiedSeats,
    seatRetained: false,
    lastAcceptedWindowIndex: -1,
    settlementStatus: null,
    settlementDueAt: null,
    reward: null,
    closeReason: null,
    finalReport: null,
    statsCommitted: false,
    salaryRates: normalizeNightShiftSalary(settings?.nightShiftSalary),
    suspiciousWindows: [],
    reviewStatus: 'clean',
  });
  try {
    await upsertDoc({
      id: buildSessionDocId(sessionId),
      model: SESSION_MODEL,
      data: runtimeDoc,
      createdAt: now,
      updatedAt: now,
    });

    const nextNightShift = {
      ...currentNightShift,
      isServing: true,
      sessionId,
      startTime: toIso(now),
      lastActivityAt: toIso(now),
      pendingSettlement: null,
      acceptedAnomaliesCurrentSession: 0,
      payableHoursCurrent: 0,
      consecutiveEmptyWindows: 0,
      lastCloseReason: null,
      lastJoinedShiftKey: shiftWindow.key,
      shiftKey: shiftWindow.key,
      shiftEndsAt: toIso(shiftWindow.endAt),
      seatLimitSnapshot: seats.seatLimit,
      occupiedSeatsSnapshot: seats.occupiedSeats,
    };

    const updatedUserRow = await updateUserDataById(userRow.id, { nightShift: nextNightShift });
    return {
      runtime: runtimeDoc,
      nightShift: {
        ...getNightShiftFromUserData(getUserData(updatedUserRow || userRow)),
        currentWindow: buildWindowPlan(runtimeDoc, 0),
      },
    };
  } catch (error) {
    await patchShiftSummary(shiftWindow.key, {
      occupiedSeats: Math.max(0, seats.occupiedSeats - 1),
      activeServingCount: Math.max(0, (seats.activeServingCount || 0) - 1),
    }, { now }).catch(() => null);
    throw error;
  }
}

async function recordShiftHeartbeat({
  userId,
  shiftSessionId,
  windowStartedAt,
  windowEndedAt,
  hourIndex,
  hourAnomalyCount,
  now = new Date(),
}) {
  const runtime = await getRuntimeSession(shiftSessionId);
  if (!runtime || runtime.status !== 'active' || String(runtime.userId) !== String(userId)) {
    throw new Error('night_shift_session_not_found');
  }

  const heartbeatWindow = parseHeartbeatPayload(runtime, {
    windowStartedAt,
    windowEndedAt,
  });
  if (!heartbeatWindow) {
    throw new Error('night_shift_invalid_heartbeat');
  }

  const hourCheckpoint = parseHourCheckpointPayload(heartbeatWindow, {
    hourIndex,
    hourAnomalyCount,
  });
  if (!hourCheckpoint) {
    throw new Error('night_shift_invalid_heartbeat');
  }

  const lastAcceptedIndex = Math.max(-1, Math.floor(Number(runtime.lastAcceptedWindowIndex) || -1));
  if (heartbeatWindow.index < Math.max(lastAcceptedIndex, runtime.issuedWindowIndex)) {
    const currentHourIndex = getHourIndex(safeMs(runtime.startedAt) || now.getTime(), now.getTime());
    return {
      runtime,
      accepted: false,
      consecutiveEmptyWindows: runtime.consecutiveEmptyWindows,
      hourAnomalies: Math.max(0, Math.floor(Number(runtime.hourlyAnomalies?.[String(currentHourIndex)]) || 0)),
      payableHours: Math.max(0, Math.floor(Number(runtime.payableHours) || 0)),
      shouldClose: false,
      closeReason: null,
      acceptedAnomaliesTotal: runtime.totalReportedAnomalies,
      currentWindow: buildWindowPlan(runtime, runtime.issuedWindowIndex),
    };
  }

  if (heartbeatWindow.index !== Math.max(0, Math.floor(Number(runtime.issuedWindowIndex) || 0))) {
    throw new Error('night_shift_invalid_heartbeat');
  }

  const expectedWindow = buildWindowPlan(runtime, heartbeatWindow.index);
  if (!expectedWindow) {
    const closed = await finalizeShiftSession({
      runtime,
      userId,
      now,
      closeReason: 'shift_window_closed',
      finalReport: {
        startedAt: runtime.startedAt,
        endedAt: toIso(now),
        totalDurationSeconds: Math.max(0, Math.floor((now.getTime() - (safeMs(runtime.startedAt) || now.getTime())) / 1000)),
        totalAnomalies: Math.max(0, Math.floor(Number(runtime.totalReportedAnomalies) || sumHourlyAnomalies(runtime.hourlyAnomalies) || 0)),
        pageHits: runtime.totalPageHits,
      },
    });
    return {
      runtime: closed.runtime,
      accepted: false,
      consecutiveEmptyWindows: runtime.consecutiveEmptyWindows,
      hourAnomalies: 0,
      payableHours: closed.payableHours,
      shouldClose: true,
      closeReason: 'shift_window_closed',
      acceptedAnomaliesTotal: closed.totalAcceptedAnomalies,
      currentWindow: null,
    };
  }

  const hourlyAnomalies = cloneHourlyAnomalies(runtime.hourlyAnomalies);
  if (hourCheckpoint.present) {
    hourlyAnomalies[String(hourCheckpoint.hourIndex)] = hourCheckpoint.anomalyCount;
  }
  const nextReportedAnomalies = Math.max(
    Math.floor(Number(runtime.totalReportedAnomalies) || 0),
    sumHourlyAnomalies(hourlyAnomalies)
  );

  let nextRuntime = await patchRuntimeSession(shiftSessionId, {
    lastHeartbeatAt: toIso(now),
    lastSeenAt: toIso(now),
    consecutiveEmptyWindows: 0,
    totalReportedAnomalies: nextReportedAnomalies,
    hourlyAnomalies,
    lastAcceptedWindowIndex: heartbeatWindow.index,
    issuedWindowIndex: heartbeatWindow.index + 1,
  }, {
    runtime,
    now,
  });

  const windowEndMs = safeMs(expectedWindow.endedAt) || now.getTime();
  const synced = await syncCompletedHours(nextRuntime, windowEndMs, now);
  nextRuntime = synced.runtime;

  if (synced.evaluated.shouldClose) {
    const closed = await finalizeShiftSession({
      runtime: nextRuntime,
      userId,
      now,
      closeReason: synced.evaluated.closeReason || 'low_hour_activity',
      finalReport: {
        startedAt: nextRuntime.startedAt,
        endedAt: toIso(now),
        totalDurationSeconds: Math.max(0, Math.floor((now.getTime() - (safeMs(nextRuntime.startedAt) || now.getTime())) / 1000)),
        totalAnomalies: Math.max(0, Math.floor(Number(nextRuntime.totalReportedAnomalies) || sumHourlyAnomalies(nextRuntime.hourlyAnomalies) || 0)),
        pageHits: nextRuntime.totalPageHits,
      },
    });
    return {
      runtime: closed.runtime,
      accepted: true,
      consecutiveEmptyWindows: nextRuntime.consecutiveEmptyWindows,
      hourAnomalies: synced.evaluated.hourAnomalies,
      payableHours: closed.payableHours,
      shouldClose: true,
      closeReason: synced.evaluated.closeReason || 'low_hour_activity',
      acceptedAnomaliesTotal: closed.totalAcceptedAnomalies,
      currentWindow: null,
    };
  }

  const nextWindow = buildWindowPlan(nextRuntime, nextRuntime.issuedWindowIndex);
  if (!nextWindow) {
    const closed = await finalizeShiftSession({
      runtime: nextRuntime,
      userId,
      now,
      closeReason: 'shift_window_closed',
      finalReport: {
        startedAt: nextRuntime.startedAt,
        endedAt: toIso(now),
        totalDurationSeconds: Math.max(0, Math.floor((now.getTime() - (safeMs(nextRuntime.startedAt) || now.getTime())) / 1000)),
        totalAnomalies: Math.max(0, Math.floor(Number(nextRuntime.totalReportedAnomalies) || sumHourlyAnomalies(nextRuntime.hourlyAnomalies) || 0)),
        pageHits: nextRuntime.totalPageHits,
      },
    });
    return {
      runtime: closed.runtime,
      accepted: true,
      consecutiveEmptyWindows: nextRuntime.consecutiveEmptyWindows,
      hourAnomalies: synced.evaluated.hourAnomalies,
      payableHours: closed.payableHours,
      shouldClose: true,
      closeReason: 'shift_window_closed',
      acceptedAnomaliesTotal: closed.totalAcceptedAnomalies,
      currentWindow: null,
    };
  }

  const currentHourAnomalies = Math.max(0, Math.floor(Number(nextRuntime.hourlyAnomalies?.[String(heartbeatWindow.hourIndex)]) || 0));

  return {
    runtime: nextRuntime,
    accepted: true,
    suspicious: false,
    consecutiveEmptyWindows: nextRuntime.consecutiveEmptyWindows,
    hourAnomalies: currentHourAnomalies,
    payableHours: nextRuntime.payableHours,
    shouldClose: false,
    closeReason: null,
    acceptedAnomaliesTotal: nextRuntime.totalReportedAnomalies,
    currentWindow: nextWindow,
  };
}

async function endShiftForUser({
  userId,
  shiftSessionId,
  startedAt,
  endedAt,
  totalDurationSeconds,
  totalAnomalies,
  pageHits,
  windowReports,
  now = new Date(),
}) {
  const runtime = await getRuntimeSession(shiftSessionId);
  if (!runtime || String(runtime.userId) !== String(userId) || runtime.status !== 'active') {
    throw new Error('night_shift_session_not_found');
  }

  return finalizeShiftSession({
    runtime,
    userId,
    now,
    closeReason: 'manual_exit',
    finalReport: {
      startedAt: startedAt || runtime.startedAt,
      endedAt: endedAt || toIso(now),
      totalDurationSeconds,
      totalAnomalies,
      pageHits,
      windowReports,
    },
  });
}

async function processStaleNightShiftClosures({ now = new Date() } = {}) {
  const rows = await listRuntimeSessionsByFilters({ status: 'active' });
  const nowMs = now.getTime();
  const results = [];

  for (const row of rows) {
    if (row.status !== 'active') continue;
    const startedAtMs = safeMs(row.startedAt);
    const lastHeartbeatMs = safeMs(row.lastHeartbeatAt) || startedAtMs;
    if (startedAtMs == null || lastHeartbeatMs == null) continue;

    const timedOut = nowMs - lastHeartbeatMs >= HEARTBEAT_TIMEOUT_MS;
    const hardEndMs = getSessionHardEndMs(row);
    const hardEnded = hardEndMs != null && nowMs >= hardEndMs;
    if (!timedOut && !hardEnded) continue;

    const closed = await finalizeShiftSession({
      runtime: row,
      userId: row.userId,
      now,
      closeReason: timedOut ? 'heartbeat_timeout' : 'shift_window_closed',
      finalReport: {
        startedAt: row.startedAt,
        endedAt: toIso(now),
        totalDurationSeconds: Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)),
        totalAnomalies: row.totalAcceptedAnomalies,
        pageHits: row.totalPageHits,
      },
    });
    results.push({
      userId: row.userId,
      sessionId: row.sessionId,
      closeReason: closed.closeReason,
      payableHours: closed.payableHours,
    });
  }

  return results;
}

async function getAdminSnapshot({ recentLimit = 100 } = {}) {
  const [activeRows, recentRows, suspiciousRows] = await Promise.all([
    listRuntimeSessionsByFilters({ status: 'active', limit: 500 }),
    listRuntimeSessionsByFilters({ status: 'ended', limit: Math.max(100, Math.min(500, Number(recentLimit) || 100)) }),
    listRuntimeSessionsByFilters({ reviewStatus: 'pending', limit: 200 }),
  ]);
  const userIds = Array.from(new Set([
    ...activeRows.map((row) => String(row.userId || '')),
    ...recentRows.map((row) => String(row.userId || '')),
    ...suspiciousRows.map((row) => String(row.userId || '')),
  ].filter(Boolean)));
  const userMap = new Map();

  if (userIds.length) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id,email,nickname')
      .in('id', userIds);
    if (!error && Array.isArray(data)) {
      data.forEach((row) => {
        userMap.set(String(row.id), {
          nickname: row.nickname || 'Unknown',
          email: row.email || 'Unknown',
        });
      });
    }
  }

  const active = activeRows
    .sort((left, right) => (safeMs(right.startedAt) || 0) - (safeMs(left.startedAt) || 0))
    .map((row) => {
      const user = userMap.get(String(row.userId)) || {};
      return {
        userId: String(row.userId),
        nickname: user.nickname || 'Unknown',
        email: user.email || 'Unknown',
        sessionId: row.sessionId,
        startedAt: row.startedAt,
        lastSeenAt: row.lastSeenAt || row.lastHeartbeatAt || null,
        totalAnomalies: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
      };
    });

  const recentShifts = recentRows
    .sort((left, right) => (safeMs(right.endedAt || right.finalReport?.endedAt) || 0) - (safeMs(left.endedAt || left.finalReport?.endedAt) || 0))
    .slice(0, Math.max(1, Math.min(500, Number(recentLimit) || 100)))
    .map((row) => {
      const user = userMap.get(String(row.userId)) || {};
      const reward = row.reward || { sc: 0, lm: 0, stars: 0 };
      return {
        userId: String(row.userId),
        nickname: user.nickname || 'Unknown',
        email: user.email || 'Unknown',
        sessionId: row.sessionId,
        startedAt: row.startedAt || row.finalReport?.startedAt || null,
        endedAt: row.endedAt || row.finalReport?.endedAt || null,
        totalDurationSeconds: Math.max(0, Math.floor(Number(row.finalReport?.totalDurationSeconds) || 0)),
        anomaliesCleared: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
        payableHours: Math.max(0, Math.floor(Number(row.payableHours) || 0)),
        reward,
        settlementStatus: row.settlementStatus || 'none',
        closeReason: row.closeReason || null,
        reviewStatus: row.reviewStatus || 'clean',
      };
    });

  const suspicious = suspiciousRows
    .filter((row) => row.status !== 'active' && row.reviewStatus === 'pending')
    .sort((left, right) => (safeMs(right.endedAt || right.finalReport?.endedAt) || 0) - (safeMs(left.endedAt || left.finalReport?.endedAt) || 0))
    .slice(0, 200)
    .map((row) => {
      const user = userMap.get(String(row.userId)) || {};
      const latestMismatch = Array.isArray(row.suspiciousWindows) && row.suspiciousWindows.length
        ? row.suspiciousWindows[row.suspiciousWindows.length - 1]
        : null;
      return {
        userId: String(row.userId),
        nickname: user.nickname || 'Unknown',
        email: user.email || 'Unknown',
        sessionId: row.sessionId,
        startedAt: row.startedAt || row.finalReport?.startedAt || null,
        endedAt: row.endedAt || row.finalReport?.endedAt || null,
        closeReason: row.closeReason || null,
        reward: row.reward || { sc: 0, lm: 0, stars: 0 },
        payableHours: Math.max(0, Math.floor(Number(row.payableHours) || 0)),
        totalDurationSeconds: Math.max(0, Math.floor(Number(row.finalReport?.totalDurationSeconds) || 0)),
        totalAcceptedAnomalies: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
        totalReportedAnomalies: Math.max(0, Math.floor(Number(row.totalReportedAnomalies) || 0)),
        mismatchCount: Array.isArray(row.suspiciousWindows) ? row.suspiciousWindows.length : 0,
        latestMismatch,
        suspiciousWindows: normalizeSuspiciousWindows(row.suspiciousWindows),
      };
    });

  return { active, recentShifts, suspicious };
}

async function reviewSuspiciousShift({ sessionId, action, adminUserId = null, now = new Date() } = {}) {
  const runtime = await getRuntimeSession(sessionId);
  if (!runtime || runtime.status === 'active') {
    throw new Error('night_shift_review_not_found');
  }

  const safeAction = String(action || '').trim();
  if (safeAction !== 'approve' && safeAction !== 'penalize') {
    throw new Error('night_shift_review_invalid_action');
  }

  if (runtime.reviewStatus === 'approved' || runtime.reviewStatus === 'penalized') {
    throw new Error('night_shift_review_already_handled');
  }

  const basePatch = {
    reviewActionAt: toIso(now),
    reviewActionBy: adminUserId ? String(adminUserId) : null,
  };

  if (safeAction === 'approve') {
    const updated = await patchRuntimeSession(runtime.sessionId, {
      ...basePatch,
      reviewStatus: 'approved',
      reviewPenalty: null,
    }, { runtime, now });
    return {
      runtime: updated,
      penalty: null,
      user: await getUserRowById(updated.userId),
    };
  }

  const userRow = await getUserRowById(runtime.userId);
  if (!userRow) {
    throw new Error('night_shift_review_user_not_found');
  }

  const reward = runtime.reward || { sc: 0, lm: 0, stars: 0 };
  const requestedPenalty = {
    sc: Math.floor((Number(reward.sc) || 0) * 0.8),
    lm: Math.floor((Number(reward.lm) || 0) * 0.8),
    stars: Number(((Number(reward.stars) || 0) * 0.8).toFixed(4)),
  };

  const userData = getUserData(userRow);
  const currentNightShift = getNightShiftFromUserData(userData);
  const currentSc = Number(userData.sc) || 0;
  const currentLm = Number(userData.lumens) || 0;
  const currentStars = Number(userData.stars) || 0;
  const appliedPenalty = {
    sc: Math.min(currentSc, requestedPenalty.sc),
    lm: Math.min(currentLm, requestedPenalty.lm),
    stars: Number(Math.min(currentStars, requestedPenalty.stars).toFixed(4)),
  };

  await updateUserDataById(userRow.id, {
    sc: Math.max(0, currentSc - appliedPenalty.sc),
    lumens: Math.max(0, currentLm - appliedPenalty.lm),
    stars: Number(Math.max(0, currentStars - appliedPenalty.stars).toFixed(4)),
    nightShift: {
      ...currentNightShift,
      stats: {
        totalTimeMs: Number(currentNightShift.stats?.totalTimeMs) || 0,
        anomaliesCleared: Number(currentNightShift.stats?.anomaliesCleared) || 0,
        totalEarnings: {
          sc: Math.max(0, (Number(currentNightShift.stats?.totalEarnings?.sc) || 0) - appliedPenalty.sc),
          lm: Math.max(0, (Number(currentNightShift.stats?.totalEarnings?.lm) || 0) - appliedPenalty.lm),
          stars: Number(Math.max(0, (Number(currentNightShift.stats?.totalEarnings?.stars) || 0) - appliedPenalty.stars).toFixed(4)),
        },
      },
    },
  });

  if (appliedPenalty.sc > 0) {
    await recordTransaction({
      userId: userRow.id,
      type: 'night_shift',
      direction: 'debit',
      amount: appliedPenalty.sc,
      currency: 'K',
      description: 'Штраф за Ночную Смену',
      relatedEntity: runtime.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }

  if (appliedPenalty.lm > 0) {
    await recordTransaction({
      userId: userRow.id,
      type: 'night_shift',
      direction: 'debit',
      amount: appliedPenalty.lm,
      currency: 'LM',
      description: 'Штраф за Ночную Смену',
      relatedEntity: runtime.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }

  if (appliedPenalty.stars > 0) {
    await recordTransaction({
      userId: userRow.id,
      type: 'night_shift',
      direction: 'debit',
      amount: appliedPenalty.stars,
      currency: 'STAR',
      description: 'Штраф за Ночную Смену',
      relatedEntity: runtime.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }

  const updated = await patchRuntimeSession(runtime.sessionId, {
    ...basePatch,
    reviewStatus: 'penalized',
    reviewPenalty: appliedPenalty,
  }, { runtime, now });

  return {
    runtime: updated,
    penalty: appliedPenalty,
    user: userRow,
  };
}

async function processPendingNightShiftFinalReviews({ now = new Date(), limit = 50 } = {}) {
  const rows = await listRuntimeSessionsByFilters({
    status: 'ended',
    finalVerificationStatus: 'queued',
    limit: Math.max(1, Math.min(200, Number(limit) || 50)),
  });

  const results = [];

  for (const row of rows) {
    try {
      const verification = validateFinalShiftReport(row, row.finalReport);
      const nextFinalReport = stripWindowReportsFromFinalPayload({
        ...(row.finalReport && typeof row.finalReport === 'object' ? row.finalReport : {}),
        totalAnomalies: verification.claimedTotal,
        verifiedAnomalies: verification.acceptedTotal,
      });

      const updated = await patchRuntimeSession(row.sessionId, {
        totalAcceptedAnomalies: verification.acceptedTotal,
        totalReportedAnomalies: verification.claimedTotal,
        totalPageHits: Object.keys(verification.pageHits).length ? verification.pageHits : row.totalPageHits,
        suspiciousWindows: verification.suspicious ? verification.suspiciousWindows : [],
        reviewStatus: verification.suspicious ? 'pending' : 'clean',
        finalVerificationStatus: 'verified',
        finalVerifiedAt: toIso(now),
        finalVerificationMismatchCount: verification.suspiciousWindows.length,
        finalReport: nextFinalReport,
      }, { runtime: row, now });

      results.push({
        sessionId: updated.sessionId,
        suspicious: verification.suspicious,
        mismatchCount: verification.suspiciousWindows.length,
      });
    } catch (error) {
      await patchRuntimeSession(row.sessionId, {
        finalVerificationStatus: 'error',
      }, { runtime: row, now }).catch(() => null);
    }
  }

  return results;
}

async function processDueNightShiftSettlements({ now = new Date() } = {}) {
  const rows = await listRuntimeSessionsByFilters({ settlementStatus: 'queued' });
  const nowMs = now.getTime();
  const results = [];

  for (const row of rows) {
    try {
      if (row.settlementStatus !== 'queued') continue;
      const dueAtMs = safeMs(row.settlementDueAt);
      if (dueAtMs == null || nowMs < dueAtMs) continue;

      const reward = row.reward || { sc: 0, lm: 0, stars: 0 };
      const payableHours = Math.max(0, Math.floor(Number(row.payableHours) || 0));
      if (payableHours <= 0) {
        await upsertDoc({
          id: buildSessionDocId(row.sessionId),
          model: SESSION_MODEL,
          data: {
            ...row,
            settlementStatus: 'settled',
            settledAt: toIso(now),
            settlementError: null,
          },
          updatedAt: now,
        });
        continue;
      }

      const userRow = await getUserRowById(row.userId);
      if (!userRow) {
        throw new Error('night_shift_settlement_user_not_found');
      }
      const userData = getUserData(userRow);
      const baseMultiplier = await getBaseRewardMultiplier(userRow.id);
      const blessingReward = await applyTreeBlessingToReward({
        userId: userRow.id,
        sc: reward.sc,
        lumens: reward.lm,
        now,
        baseMultiplier,
      });
      const finalReward = {
        ...reward,
        sc: blessingReward.sc,
        lm: blessingReward.lumens,
        stars: Number(((Number(reward.stars) || 0) * baseMultiplier).toFixed(4)),
      };
      const currentNightShift = getNightShiftFromUserData(userData);
      const nextNightShift = {
        ...currentNightShift,
        pendingSettlement: null,
        stats: {
          totalTimeMs: Number(currentNightShift.stats?.totalTimeMs) || 0,
          anomaliesCleared: Number(currentNightShift.stats?.anomaliesCleared) || 0,
          totalEarnings: {
            sc: (Number(currentNightShift.stats?.totalEarnings?.sc) || 0) + (Number(finalReward.sc) || 0),
            lm: (Number(currentNightShift.stats?.totalEarnings?.lm) || 0) + (Number(finalReward.lm) || 0),
            stars: Number(((Number(currentNightShift.stats?.totalEarnings?.stars) || 0) + (Number(finalReward.stars) || 0)).toFixed(4)),
          },
        },
      };

      await updateUserDataById(userRow.id, {
        sc: (Number(userData.sc) || 0) + (Number(finalReward.sc) || 0),
        lumens: (Number(userData.lumens) || 0) + (Number(finalReward.lm) || 0),
        stars: Number(((Number(userData.stars) || 0) + (Number(finalReward.stars) || 0)).toFixed(4)),
        nightShift: nextNightShift,
      });

      if ((Number(finalReward.sc) || 0) > 0) {
        await recordTransaction({
          userId: userRow.id,
          type: 'night_shift',
          direction: 'credit',
          amount: Number(finalReward.sc) || 0,
          currency: 'K',
          description: 'Ночная Смена: полный час',
          relatedEntity: row.sessionId,
          occurredAt: now,
        }).catch(() => null);
      }

      if ((Number(finalReward.stars) || 0) > 0) {
        await recordTransaction({
          userId: userRow.id,
          type: 'night_shift',
          direction: 'credit',
          amount: Number(finalReward.stars) || 0,
          currency: 'STAR',
          description: 'Ночная Смена: полный час',
          relatedEntity: row.sessionId,
          occurredAt: now,
        }).catch(() => null);
      }

      const durationMinutes = payableHours * 60;
      const acceptedAnomalies = Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0));
      if (acceptedAnomalies > 0) {
        await awardRadianceForActivity({
          userId: userRow.id,
          activityType: 'night_shift_anomaly',
          units: acceptedAnomalies,
          meta: { sessionId: row.sessionId, acceptedAnomalies },
          dedupeKey: `night_shift_anomaly:${String(userRow.id)}:${String(row.sessionId)}`,
        });
      }
      if (payableHours > 0) {
        await awardRadianceForActivity({
          userId: userRow.id,
          activityType: 'night_shift_hour',
          units: payableHours,
          meta: { sessionId: row.sessionId, payableHours, durationMinutes },
          dedupeKey: `night_shift_hour:${String(userRow.id)}:${String(row.sessionId)}`,
        });
      }

      await recordActivity({
        userId: userRow.id,
        type: 'night_shift',
        minutes: durationMinutes,
        meta: {
          reward: finalReward,
          payableHours,
          anomaliesCleared: acceptedAnomalies,
          sessionId: row.sessionId,
        },
      }).catch(() => {});

      await upsertDoc({
        id: buildSessionDocId(row.sessionId),
        model: SESSION_MODEL,
        data: {
          ...row,
          settlementStatus: 'settled',
          settledAt: toIso(now),
          settlementError: null,
        },
        updatedAt: now,
      });

      results.push({
        userId: String(userRow.id),
        nickname: userRow.nickname || '',
        sessionId: row.sessionId,
        reward: finalReward,
        payableHours,
      });
    } catch (error) {
      await upsertDoc({
        id: buildSessionDocId(row.sessionId),
        model: SESSION_MODEL,
        data: {
          ...row,
          settlementStatus: 'error',
          settlementError: String(error?.message || error || 'unknown_settlement_error'),
        },
        updatedAt: now,
      }).catch(() => {});
    }
  }

  return results;
}

module.exports = {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
  EMPTY_WINDOWS_LIMIT,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_WINDOW_SECONDS,
  MAX_SHIFT_MS,
  MIN_ANOMALIES_PER_ACTIVE_HOUR,
  MIN_ANOMALIES_PER_PAID_HOUR,
  buildSessionDocId,
  endShiftForUser,
  getActiveRuntimeForUser,
  getNightShiftFromUserData,
  getNightShiftStatusForUser,
  getRuntimeSession,
  getSyncConfig,
  getSystemSettings,
  getUserRowById,
  getUserData,
  processDueNightShiftSettlements,
  getAdminSnapshot,
  processPendingNightShiftFinalReviews,
  processStaleNightShiftClosures,
  recordShiftHeartbeat,
  reviewSuspiciousShift,
  startShiftForUser,
  updateUserDataById,
};

