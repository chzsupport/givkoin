const { toIso: defaultToIso } = require('../documentStore');
const { safeMs: defaultSafeMs } = require('./nightShiftRuntimeConfig');
const { buildWindowPlan: defaultBuildWindowPlan } = require('./nightShiftWindowPlan');
const {
  getHourIndex: defaultGetHourIndex,
  parseHeartbeatPayload: defaultParseHeartbeatPayload,
  parseHourCheckpointPayload: defaultParseHourCheckpointPayload,
  syncCompletedHours: defaultSyncCompletedHours,
} = require('./nightShiftHeartbeat');
const { finalizeShiftSession: defaultFinalizeShiftSession } = require('./nightShiftFinalization');
const {
  cloneHourlyAnomalies,
  sumHourlyAnomalies,
} = require('./nightShiftRuntimeSession');

function defaultGetRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').getRuntimeSession(...args);
}

function defaultPatchRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').patchRuntimeSession(...args);
}

function buildHeartbeatFinalReport({ runtime, now, safeMs = defaultSafeMs, toIso = defaultToIso }) {
  return {
    startedAt: runtime.startedAt,
    endedAt: toIso(now),
    totalDurationSeconds: Math.max(0, Math.floor((now.getTime() - (safeMs(runtime.startedAt) || now.getTime())) / 1000)),
    totalAnomalies: Math.max(0, Math.floor(Number(runtime.totalReportedAnomalies) || sumHourlyAnomalies(runtime.hourlyAnomalies) || 0)),
    pageHits: runtime.totalPageHits,
  };
}

function buildDuplicateHeartbeatResponse({
  buildWindowPlan,
  getHourIndex,
  heartbeatWindow,
  now,
  runtime,
  safeMs,
}) {
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

function buildClosedHeartbeatResponse({
  accepted,
  closed,
  closeReason,
  consecutiveEmptyWindows,
  hourAnomalies,
}) {
  return {
    runtime: closed.runtime,
    accepted,
    consecutiveEmptyWindows,
    hourAnomalies,
    payableHours: closed.payableHours,
    shouldClose: true,
    closeReason,
    acceptedAnomaliesTotal: closed.totalAcceptedAnomalies,
    currentWindow: null,
  };
}

function createNightShiftRuntimeHeartbeat({
  buildWindowPlan = defaultBuildWindowPlan,
  finalizeShiftSession = defaultFinalizeShiftSession,
  getHourIndex = defaultGetHourIndex,
  getRuntimeSession = defaultGetRuntimeSession,
  parseHeartbeatPayload = defaultParseHeartbeatPayload,
  parseHourCheckpointPayload = defaultParseHourCheckpointPayload,
  patchRuntimeSession = defaultPatchRuntimeSession,
  safeMs = defaultSafeMs,
  syncCompletedHours = defaultSyncCompletedHours,
  toIso = defaultToIso,
} = {}) {
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
      return buildDuplicateHeartbeatResponse({
        buildWindowPlan,
        getHourIndex,
        heartbeatWindow,
        now,
        runtime,
        safeMs,
      });
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
        finalReport: buildHeartbeatFinalReport({ runtime, now, safeMs, toIso }),
      });
      return buildClosedHeartbeatResponse({
        accepted: false,
        closed,
        closeReason: 'shift_window_closed',
        consecutiveEmptyWindows: runtime.consecutiveEmptyWindows,
        hourAnomalies: 0,
      });
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
      const closeReason = synced.evaluated.closeReason || 'low_hour_activity';
      const closed = await finalizeShiftSession({
        runtime: nextRuntime,
        userId,
        now,
        closeReason,
        finalReport: buildHeartbeatFinalReport({ runtime: nextRuntime, now, safeMs, toIso }),
      });
      return buildClosedHeartbeatResponse({
        accepted: true,
        closed,
        closeReason,
        consecutiveEmptyWindows: nextRuntime.consecutiveEmptyWindows,
        hourAnomalies: synced.evaluated.hourAnomalies,
      });
    }

    const nextWindow = buildWindowPlan(nextRuntime, nextRuntime.issuedWindowIndex);
    if (!nextWindow) {
      const closed = await finalizeShiftSession({
        runtime: nextRuntime,
        userId,
        now,
        closeReason: 'shift_window_closed',
        finalReport: buildHeartbeatFinalReport({ runtime: nextRuntime, now, safeMs, toIso }),
      });
      return buildClosedHeartbeatResponse({
        accepted: true,
        closed,
        closeReason: 'shift_window_closed',
        consecutiveEmptyWindows: nextRuntime.consecutiveEmptyWindows,
        hourAnomalies: synced.evaluated.hourAnomalies,
      });
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

  return {
    recordShiftHeartbeat,
  };
}

const defaultRuntimeHeartbeat = createNightShiftRuntimeHeartbeat();

module.exports = {
  buildClosedHeartbeatResponse,
  buildDuplicateHeartbeatResponse,
  buildHeartbeatFinalReport,
  createNightShiftRuntimeHeartbeat,
  recordShiftHeartbeat: defaultRuntimeHeartbeat.recordShiftHeartbeat,
};
