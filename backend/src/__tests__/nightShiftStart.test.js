const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSeatRollbackPatch,
  buildShiftStartRuntime,
  buildStartedNightShift,
  createNightShiftStart,
} = require('../services/nightShift/nightShiftStart');

test('night shift start builds runtime document for new shift', () => {
  const runtime = buildShiftStartRuntime({
    createId: (prefix) => `${prefix}-secret`,
    now: new Date('2026-05-25T19:00:00.000Z'),
    seats: {
      seatLimit: 10,
      activeUsersCount: 3,
      occupiedSeats: 4,
      reusedShiftSeat: true,
    },
    sessionId: 'session-1',
    settings: { nightShiftSalary: { k: 120, lm: 90, stars: 0.002 } },
    shiftWindow: {
      key: 'shift-1',
      startAt: new Date('2026-05-25T19:00:00.000Z'),
      endAt: new Date('2026-05-26T06:00:00.000Z'),
    },
    userId: 'user-1',
  });

  assert.equal(runtime.sessionId, 'session-1');
  assert.equal(runtime.userId, 'user-1');
  assert.equal(runtime.status, 'active');
  assert.equal(runtime.windowSecret, 'night_shift_window-secret');
  assert.equal(runtime.seatLimitSnapshot, 10);
  assert.equal(runtime.reusedShiftSeat, true);
  assert.deepEqual(runtime.salaryRates, { k: 120, lm: 90, stars: 0.002 });
});

test('night shift start builds user state for serving shift', () => {
  const next = buildStartedNightShift({
    currentNightShift: {
      stats: { totalTimeMs: 1 },
      pendingSettlement: { sessionId: 'old' },
    },
    now: new Date('2026-05-25T19:00:00.000Z'),
    seats: { seatLimit: 10, occupiedSeats: 4 },
    sessionId: 'session-1',
    shiftWindow: {
      key: 'shift-1',
      endAt: new Date('2026-05-26T06:00:00.000Z'),
    },
  });

  assert.equal(next.isServing, true);
  assert.equal(next.sessionId, 'session-1');
  assert.equal(next.pendingSettlement, null);
  assert.equal(next.lastJoinedShiftKey, 'shift-1');
  assert.equal(next.shiftEndsAt, '2026-05-26T06:00:00.000Z');
  assert.equal(next.seatLimitSnapshot, 10);
  assert.equal(next.occupiedSeatsSnapshot, 4);
});

test('night shift start builds rollback patches for reserved seats', () => {
  assert.deepEqual(buildSeatRollbackPatch({
    reusedShiftSeat: false,
    occupiedSeats: 4,
    activeServingCount: 3,
  }), {
    occupiedSeats: 3,
    activeServingCount: 2,
  });

  assert.deepEqual(buildSeatRollbackPatch({
    reusedShiftSeat: true,
    reusedRetainedSeat: true,
    occupiedSeats: 4,
    activeServingCount: 3,
    retainedSeats: 2,
  }), {
    occupiedSeats: 4,
    activeServingCount: 2,
    retainedSeats: 3,
  });
});

test('night shift start creates runtime session and updates user state', async () => {
  const saved = [];
  const updates = [];
  const now = new Date('2026-05-25T19:00:00.000Z');
  const { startShiftForUser } = createNightShiftStart({
    createId: (prefix) => (prefix === 'night_shift' ? 'session-1' : 'window-secret'),
    getActiveRuntimeForUser: async () => null,
    getNightShiftFromUserData: (data) => data.nightShift,
    getNow: () => now,
    getShiftWindow: () => ({
      isOpen: true,
      key: 'shift-1',
      startAt: now,
      endAt: new Date('2026-05-26T06:00:00.000Z'),
    }),
    getUserData: (row) => row.data,
    getUserRowById: async () => ({
      id: 'user-1',
      data: { nightShift: { isServing: false, stats: {} } },
    }),
    isShiftRestRequired: () => false,
    listDocsByModel: async () => [{ nightShiftSalary: { k: 110, lm: 70, stars: 0.003 } }],
    reserveShiftSeat: async () => ({
      seatLimit: 10,
      activeServingCount: 3,
      activeUsersCount: 3,
      occupiedSeats: 4,
      reserved: true,
    }),
    saveRuntimeSession: async (sessionId, runtime) => saved.push({ sessionId, runtime }),
    updateUserDataById: async (userId, patch) => {
      updates.push({ userId, patch });
      return { id: userId, data: { nightShift: patch.nightShift } };
    },
  });

  const result = await startShiftForUser('user-1');

  assert.equal(saved[0].sessionId, 'session-1');
  assert.equal(saved[0].runtime.windowSecret, 'window-secret');
  assert.equal(saved[0].runtime.salaryRates.k, 110);
  assert.equal(updates[0].patch.nightShift.isServing, true);
  assert.equal(result.nightShift.sessionId, 'session-1');
  assert.equal(result.nightShift.currentWindow.index, 0);
});

test('night shift start rolls back seat reservation when user update fails', async () => {
  const patches = [];
  const now = new Date('2026-05-25T19:00:00.000Z');
  const { startShiftForUser } = createNightShiftStart({
    createId: (prefix) => (prefix === 'night_shift' ? 'session-1' : 'window-secret'),
    getActiveRuntimeForUser: async () => null,
    getNightShiftFromUserData: (data) => data.nightShift,
    getNow: () => now,
    getShiftWindow: () => ({
      isOpen: true,
      key: 'shift-1',
      startAt: now,
      endAt: new Date('2026-05-26T06:00:00.000Z'),
    }),
    getUserData: (row) => row.data,
    getUserRowById: async () => ({
      id: 'user-1',
      data: { nightShift: { isServing: false } },
    }),
    isShiftRestRequired: () => false,
    listDocsByModel: async () => [],
    patchShiftSummary: async (shiftKey, patch) => patches.push({ shiftKey, patch }),
    reserveShiftSeat: async () => ({
      seatLimit: 10,
      activeServingCount: 3,
      activeUsersCount: 3,
      occupiedSeats: 4,
      reserved: true,
    }),
    saveRuntimeSession: async () => {},
    updateUserDataById: async () => {
      throw new Error('write_failed');
    },
  });

  await assert.rejects(() => startShiftForUser('user-1'), /write_failed/);
  assert.deepEqual(patches, [{
    shiftKey: 'shift-1',
    patch: {
      occupiedSeats: 3,
      activeServingCount: 2,
    },
  }]);
});
