const {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
} = require('./nightShiftWindowPlan');
const {
  normalizeNightShiftSalary,
} = require('./nightShiftRewards');
const {
  normalizePageHits,
  normalizeSuspiciousWindows,
} = require('./nightShiftReports');

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

function sumHourlyAnomalies(value) {
  const hourly = cloneHourlyAnomalies(value);
  return Object.values(hourly).reduce((sum, count) => sum + Math.max(0, Math.floor(Number(count) || 0)), 0);
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
    reusedShiftSeat: Boolean(row.reusedShiftSeat || row.reusedRetainedSeat),
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

module.exports = {
  cloneAcceptedWindowIndexes,
  cloneEvaluatedHours,
  cloneHourlyAnomalies,
  cloneWindowsList,
  normalizeRuntimeSession,
  sumHourlyAnomalies,
};
