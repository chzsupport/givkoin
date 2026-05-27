const { toIso } = require('../documentStore');
const { evaluateCompletedHours: evaluateNightShiftCompletedHours } = require('./nightShiftEvaluation');
const {
  HEARTBEAT_WINDOW_SECONDS,
  MIN_ANOMALIES_PER_ACTIVE_HOUR,
  MIN_ANOMALIES_PER_PAID_HOUR,
  getWindowBounds,
  safeMs,
} = require('./nightShiftRuntimeConfig');
const { normalizePageHits } = require('./nightShiftReports');
const {
  cloneEvaluatedHours,
  normalizeRuntimeSession,
} = require('./nightShiftRuntimeSession');
const { shouldSendHourCheckpoint } = require('./nightShiftValidation');
const {
  updateRuntimeSessionFast: defaultUpdateRuntimeSessionFast,
} = require('./nightShiftRuntimeStore');

function getHourIndex(startedAtMs, windowStartedAtMs) {
  return Math.max(0, Math.floor((windowStartedAtMs - startedAtMs) / (60 * 60 * 1000)));
}

function getWindowIndex(startedAtMs, windowStartedAtMs) {
  return Math.max(0, Math.floor((windowStartedAtMs - startedAtMs) / (HEARTBEAT_WINDOW_SECONDS * 1000)));
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
  return evaluateNightShiftCompletedHours(runtime, effectiveEndMs, {
    minAnomaliesPerActiveHour: MIN_ANOMALIES_PER_ACTIVE_HOUR,
    minAnomaliesPerPaidHour: MIN_ANOMALIES_PER_PAID_HOUR,
  });
}

function hasHourEvaluationChanged(runtime, evaluated) {
  const currentEvaluated = cloneEvaluatedHours(runtime?.evaluatedHours);
  const nextEvaluated = cloneEvaluatedHours(evaluated?.evaluatedHours);
  if (currentEvaluated.length !== nextEvaluated.length) return true;
  if (currentEvaluated.some((value, index) => value !== nextEvaluated[index])) return true;
  return Math.max(0, Math.floor(Number(runtime?.payableHours) || 0)) !== Math.max(0, Math.floor(Number(evaluated?.payableHours) || 0));
}

function createNightShiftHeartbeat({ updateRuntimeSessionFast = defaultUpdateRuntimeSessionFast } = {}) {
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

  return {
    syncCompletedHours,
  };
}

const defaultHeartbeat = createNightShiftHeartbeat();

module.exports = {
  createNightShiftHeartbeat,
  evaluateCompletedHours,
  getHourIndex,
  getWindowIndex,
  hasHourEvaluationChanged,
  parseHeartbeatPayload,
  parseHourCheckpointPayload,
  syncCompletedHours: defaultHeartbeat.syncCompletedHours,
};
