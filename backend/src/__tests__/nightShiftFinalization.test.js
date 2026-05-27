const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClosedNightShift,
  buildFinalShiftPayload,
  buildFinalShiftReward,
  calculateEffectiveShiftEnd,
  createNightShiftFinalization,
} = require('../services/nightShift/nightShiftFinalization');

test('night shift finalization clamps effective end by hard end', () => {
  const now = new Date('2026-05-25T23:00:00.000Z');
  const timing = calculateEffectiveShiftEnd({
    normalizedRuntime: { startedAt: '2026-05-25T19:00:00.000Z' },
    now,
    safeMs: (value) => new Date(value).getTime(),
    getSessionHardEndMs: () => new Date('2026-05-25T21:00:00.000Z').getTime(),
  });

  assert.equal(timing.effectiveEndMs, new Date('2026-05-25T21:00:00.000Z').getTime());
  assert.equal(timing.totalDurationSeconds, 7200);
});

test('night shift finalization builds final payload from window reports', () => {
  const result = buildFinalShiftPayload({
    normalizedRuntime: {
      startedAt: '2026-05-25T19:00:00.000Z',
      totalReportedAnomalies: 3,
      hourlyAnomalies: { 0: 5 },
      totalPageHits: { '/old': 1 },
    },
    effectiveEndMs: new Date('2026-05-25T20:00:00.000Z').getTime(),
    totalDurationSeconds: 3600,
    finalReport: {
      pageHits: { '/ru/news?x=1': 2 },
      windowReports: [{
        index: 1,
        startedAt: '2026-05-25T19:05:00.000Z',
        endedAt: '2026-05-25T19:10:00.000Z',
        resolvedAnomalies: [
          { anomalyId: 'a1', pagePath: '/ru/news' },
          { anomalyId: 'a2', pagePath: '/en/tree' },
        ],
      }],
    },
  });

  assert.equal(result.reportedTotalAnomalies, 2);
  assert.equal(result.finalPayload.totalAnomalies, 2);
  assert.deepEqual(result.finalPayload.pageHits, { '/news': 2 });
  assert.equal(result.finalPayload.windowReports[0].resolvedAnomalies.length, 2);
});

test('night shift finalization builds reward from payable hours', () => {
  assert.deepEqual(buildFinalShiftReward({
    normalizedRuntime: {
      salaryRates: { k: 100, lm: 80, stars: 0.001 },
    },
    payableHours: 2,
  }), {
    k: 200,
    lm: 160,
    stars: 0.002,
  });
});

test('night shift finalization builds closed user state with pending settlement', () => {
  const next = buildClosedNightShift({
    closeReason: 'manual_exit',
    currentNightShift: {
      shiftKey: 'old',
      shiftEndsAt: 'old-end',
      seatLimitSnapshot: 5,
      occupiedSeatsSnapshot: 2,
    },
    hasReward: true,
    nextRuntime: {
      seatLimitSnapshot: 10,
      occupiedSeatsSnapshot: 3,
    },
    normalizedRuntime: {
      sessionId: 'session-1',
      shiftKey: 'shift-1',
      shiftEndsAt: '2026-05-26T06:00:00.000Z',
    },
    paidHours: 2,
    reward: { k: 200, lm: 160, stars: 0.002 },
    settlementDueAt: new Date('2026-05-25T21:05:00.000Z'),
    toIso: (value) => new Date(value).toISOString(),
    now: new Date('2026-05-25T21:00:00.000Z'),
  });

  assert.equal(next.isServing, false);
  assert.equal(next.sessionId, null);
  assert.equal(next.pendingSettlement.sessionId, 'session-1');
  assert.equal(next.pendingSettlement.dueAt, '2026-05-25T21:05:00.000Z');
  assert.equal(next.seatLimitSnapshot, 10);
  assert.equal(next.occupiedSeatsSnapshot, 3);
  assert.equal(next.lastCloseReason, 'manual_exit');
});

test('night shift finalization finalizes active shift and queues settlement', async () => {
  const saves = [];
  const updates = [];
  const userRow = {
    id: 'user-1',
    data: {
      nightShift: {
        isServing: true,
        sessionId: 'session-1',
        stats: {
          totalTimeMs: 1000,
          anomaliesCleared: 5,
          totalEarnings: { k: 0, lm: 0, stars: 0 },
        },
      },
    },
  };
  const runtime = {
    sessionId: 'session-1',
    userId: 'user-1',
    status: 'active',
    startedAt: '2026-05-25T19:00:00.000Z',
    shiftKey: 'shift-1',
    shiftEndsAt: '2026-05-26T06:00:00.000Z',
    hourlyAnomalies: { 0: 60, 1: 65 },
    salaryRates: { k: 100, lm: 80, stars: 0.001 },
    totalReportedAnomalies: 125,
    totalPageHits: { '/tree': 3 },
  };
  const { finalizeShiftSession } = createNightShiftFinalization({
    applyShiftSeatRelease: async () => ({
      seatLimit: 10,
      activeUsersCountSnapshot: 4,
      occupiedSeats: 3,
    }),
    getNightShiftFromUserData: (data) => data.nightShift,
    getSessionHardEndMs: () => null,
    getUserData: (row) => row.data,
    getUserRowById: async () => userRow,
    getSettlementDelaySeconds: () => 300,
    saveRuntimeSession: async (sessionId, nextRuntime) => saves.push({ sessionId, runtime: nextRuntime }),
    toIso: (value) => new Date(value).toISOString(),
    updateUserDataById: async (userId, patch) => updates.push({ userId, patch }),
  });

  const result = await finalizeShiftSession({
    runtime,
    userId: 'user-1',
    now: new Date('2026-05-25T21:10:00.000Z'),
    finalReport: {
      totalDurationSeconds: 7800,
      windowReports: [{
        index: 1,
        startedAt: '2026-05-25T19:05:00.000Z',
        endedAt: '2026-05-25T19:10:00.000Z',
        resolvedAnomalies: [{ anomalyId: 'a1', pagePath: '/tree' }],
      }],
    },
  });

  assert.equal(result.queued, true);
  assert.equal(result.payableHours, 2);
  assert.deepEqual(result.reward, { k: 200, lm: 160, stars: 0.002 });
  assert.equal(saves[0].runtime.status, 'ended');
  assert.equal(saves[0].runtime.settlementStatus, 'queued');
  assert.equal(saves[0].runtime.finalVerificationStatus, 'queued');
  assert.equal(saves[1].runtime.statsCommitted, true);
  assert.equal(updates[0].patch.nightShift.stats.totalTimeMs, 7801000);
  assert.equal(updates[0].patch.nightShift.stats.anomaliesCleared, 6);
  assert.equal(updates[1].patch.nightShift.isServing, false);
  assert.equal(updates[1].patch.nightShift.pendingSettlement.dueAt, '2026-05-25T21:15:00.000Z');
});

test('night shift finalization closes stale sessions', async () => {
  const saves = [];
  const updates = [];
  const runtime = {
    sessionId: 'session-timeout',
    userId: 'user-1',
    status: 'active',
    startedAt: '2026-05-25T19:00:00.000Z',
    lastHeartbeatAt: '2026-05-25T19:10:00.000Z',
    hourlyAnomalies: { 0: 60 },
    salaryRates: { k: 100, lm: 80, stars: 0.001 },
    totalAcceptedAnomalies: 60,
    totalPageHits: { '/tree': 3 },
  };
  const { processStaleNightShiftClosures } = createNightShiftFinalization({
    applyShiftSeatRelease: async () => null,
    getNightShiftFromUserData: (data) => data.nightShift,
    getSessionHardEndMs: () => null,
    getUserData: (row) => row.data,
    getUserRowById: async () => ({
      id: 'user-1',
      data: {
        nightShift: {
          isServing: true,
          sessionId: 'session-timeout',
          stats: { totalTimeMs: 0, anomaliesCleared: 0, totalEarnings: { k: 0, lm: 0, stars: 0 } },
        },
      },
    }),
    getSettlementDelaySeconds: () => 300,
    listRuntimeSessionsByFilters: async (filters) => {
      assert.deepEqual(filters, { status: 'active' });
      return [runtime];
    },
    safeMs: (value) => new Date(value).getTime(),
    saveRuntimeSession: async (sessionId, nextRuntime) => saves.push({ sessionId, runtime: nextRuntime }),
    toIso: (value) => new Date(value).toISOString(),
    updateUserDataById: async (userId, patch) => updates.push({ userId, patch }),
  });

  const results = await processStaleNightShiftClosures({
    now: new Date('2026-05-25T19:30:00.000Z'),
  });

  assert.deepEqual(results, [{
    userId: 'user-1',
    sessionId: 'session-timeout',
    closeReason: 'heartbeat_timeout',
    payableHours: 0,
  }]);
  assert.equal(saves[0].runtime.closeReason, 'heartbeat_timeout');
  assert.equal(updates[1].patch.nightShift.lastCloseReason, 'heartbeat_timeout');
});
