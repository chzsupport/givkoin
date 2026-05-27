const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClosedHeartbeatResponse,
  buildDuplicateHeartbeatResponse,
  buildHeartbeatFinalReport,
  createNightShiftRuntimeHeartbeat,
} = require('../services/nightShift/nightShiftRuntimeHeartbeat');

test('night shift runtime heartbeat builds final report from runtime state', () => {
  assert.deepEqual(buildHeartbeatFinalReport({
    runtime: {
      startedAt: '2026-05-25T19:00:00.000Z',
      totalReportedAnomalies: 0,
      hourlyAnomalies: { 0: 7, 1: 3 },
      totalPageHits: { '/tree': 2 },
    },
    now: new Date('2026-05-25T19:30:00.000Z'),
  }), {
    startedAt: '2026-05-25T19:00:00.000Z',
    endedAt: '2026-05-25T19:30:00.000Z',
    totalDurationSeconds: 1800,
    totalAnomalies: 10,
    pageHits: { '/tree': 2 },
  });
});

test('night shift runtime heartbeat builds duplicate response without mutation', () => {
  const runtime = {
    startedAt: '2026-05-25T19:00:00.000Z',
    issuedWindowIndex: 3,
    consecutiveEmptyWindows: 1,
    payableHours: 2,
    totalReportedAnomalies: 30,
    hourlyAnomalies: { 1: 9 },
  };
  const response = buildDuplicateHeartbeatResponse({
    buildWindowPlan: (row, index) => ({ index, sessionId: row.sessionId || null }),
    getHourIndex: () => 1,
    now: new Date('2026-05-25T20:10:00.000Z'),
    runtime,
    safeMs: (value) => new Date(value).getTime(),
  });

  assert.equal(response.accepted, false);
  assert.equal(response.hourAnomalies, 9);
  assert.equal(response.payableHours, 2);
  assert.deepEqual(response.currentWindow, { index: 3, sessionId: null });
});

test('night shift runtime heartbeat builds closed response shape', () => {
  const response = buildClosedHeartbeatResponse({
    accepted: true,
    closed: {
      runtime: { sessionId: 'session-1' },
      payableHours: 1,
      totalAcceptedAnomalies: 60,
    },
    closeReason: 'low_hour_activity',
    consecutiveEmptyWindows: 0,
    hourAnomalies: 20,
  });

  assert.deepEqual(response, {
    runtime: { sessionId: 'session-1' },
    accepted: true,
    consecutiveEmptyWindows: 0,
    hourAnomalies: 20,
    payableHours: 1,
    shouldClose: true,
    closeReason: 'low_hour_activity',
    acceptedAnomaliesTotal: 60,
    currentWindow: null,
  });
});

test('night shift runtime heartbeat accepts window and syncs hours', async () => {
  const patches = [];
  const runtime = {
    sessionId: 'session-1',
    userId: 'user-1',
    status: 'active',
    startedAt: '2026-05-25T19:00:00.000Z',
    issuedWindowIndex: 0,
    lastAcceptedWindowIndex: -1,
    totalReportedAnomalies: 0,
    hourlyAnomalies: {},
  };
  const { recordShiftHeartbeat } = createNightShiftRuntimeHeartbeat({
    buildWindowPlan: (row, index) => (index <= 1 ? { index, endedAt: '2026-05-25T19:05:00.000Z' } : null),
    getRuntimeSession: async () => runtime,
    parseHeartbeatPayload: () => ({ index: 0, hourIndex: 0 }),
    parseHourCheckpointPayload: () => ({ present: true, hourIndex: 0, anomalyCount: 7 }),
    patchRuntimeSession: async (sessionId, patch) => {
      patches.push({ sessionId, patch });
      return { ...runtime, ...patch };
    },
    syncCompletedHours: async (nextRuntime) => ({
      runtime: { ...nextRuntime, payableHours: 0 },
      evaluated: { shouldClose: false, hourAnomalies: 7 },
    }),
    toIso: (value) => new Date(value).toISOString(),
  });

  const result = await recordShiftHeartbeat({
    userId: 'user-1',
    shiftSessionId: 'session-1',
    now: new Date('2026-05-25T19:05:00.000Z'),
  });

  assert.equal(result.accepted, true);
  assert.equal(result.shouldClose, false);
  assert.equal(result.hourAnomalies, 7);
  assert.deepEqual(result.currentWindow, { index: 1, endedAt: '2026-05-25T19:05:00.000Z' });
  assert.equal(patches[0].patch.totalReportedAnomalies, 7);
  assert.equal(patches[0].patch.issuedWindowIndex, 1);
});

test('night shift runtime heartbeat closes on low hour activity', async () => {
  const finalizeCalls = [];
  const runtime = {
    sessionId: 'session-1',
    userId: 'user-1',
    status: 'active',
    startedAt: '2026-05-25T19:00:00.000Z',
    issuedWindowIndex: 0,
    lastAcceptedWindowIndex: -1,
    totalReportedAnomalies: 10,
    totalPageHits: { '/tree': 1 },
    hourlyAnomalies: {},
  };
  const { recordShiftHeartbeat } = createNightShiftRuntimeHeartbeat({
    buildWindowPlan: () => ({ index: 0, endedAt: '2026-05-25T20:00:00.000Z' }),
    finalizeShiftSession: async (payload) => {
      finalizeCalls.push(payload);
      return {
        runtime: { sessionId: payload.runtime.sessionId, status: 'ended' },
        payableHours: 0,
        totalAcceptedAnomalies: 10,
      };
    },
    getRuntimeSession: async () => runtime,
    parseHeartbeatPayload: () => ({ index: 0, hourIndex: 0 }),
    parseHourCheckpointPayload: () => ({ present: false, hourIndex: 0, anomalyCount: 0 }),
    patchRuntimeSession: async (sessionId, patch) => ({ ...runtime, ...patch }),
    syncCompletedHours: async (nextRuntime) => ({
      runtime: nextRuntime,
      evaluated: { shouldClose: true, closeReason: 'low_hour_activity', hourAnomalies: 10 },
    }),
    toIso: (value) => new Date(value).toISOString(),
  });

  const result = await recordShiftHeartbeat({
    userId: 'user-1',
    shiftSessionId: 'session-1',
    now: new Date('2026-05-25T20:00:00.000Z'),
  });

  assert.equal(result.shouldClose, true);
  assert.equal(result.closeReason, 'low_hour_activity');
  assert.equal(result.acceptedAnomaliesTotal, 10);
  assert.equal(finalizeCalls[0].closeReason, 'low_hour_activity');
  assert.equal(finalizeCalls[0].finalReport.totalDurationSeconds, 3600);
});

test('night shift runtime heartbeat rejects missing active session', async () => {
  const { recordShiftHeartbeat } = createNightShiftRuntimeHeartbeat({
    getRuntimeSession: async () => null,
  });

  await assert.rejects(() => recordShiftHeartbeat({
    userId: 'user-1',
    shiftSessionId: 'missing',
  }), /night_shift_session_not_found/);
});
