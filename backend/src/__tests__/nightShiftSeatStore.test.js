const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createNightShiftSeatStore,
} = require('../services/nightShift/nightShiftSeatStore');
const {
  normalizeShiftSummary,
} = require('../services/nightShift/nightShiftDocuments');

function createMemorySeatStore({ initialSummary = null, rowsByQuery = () => [] } = {}) {
  let summary = initialSummary ? normalizeShiftSummary(initialSummary) : null;
  const writes = [];
  const queries = [];
  const store = createNightShiftSeatStore({
    getActiveUsersCountSnapshot: async () => 10,
    getShiftSummary: async () => summary,
    getShiftWindowByKey: () => ({
      startAt: new Date('2026-05-25T19:00:00.000Z'),
      endAt: new Date('2026-05-26T06:00:00.000Z'),
    }),
    listRuntimeSessionsByFilters: async (filters) => {
      queries.push(filters);
      return rowsByQuery(filters);
    },
    toIso: (value) => new Date(value).toISOString(),
    writeShiftSummary: async (shiftKey, data) => {
      summary = normalizeShiftSummary({ ...data, shiftKey });
      writes.push(summary);
      return summary;
    },
  });
  return {
    get summary() {
      return summary;
    },
    queries,
    store,
    writes,
  };
}

test('night shift seat store creates summary and reserves a new seat', async () => {
  const memory = createMemorySeatStore();

  const seats = await memory.store.reserveShiftSeat({
    key: 'shift-1',
    startAt: new Date('2026-05-25T19:00:00.000Z'),
    endAt: new Date('2026-05-26T06:00:00.000Z'),
  }, {
    userId: 'user-1',
    now: new Date('2026-05-25T19:10:00.000Z'),
  });

  assert.equal(seats.activeUsersCount, 10);
  assert.equal(seats.seatLimit, 5);
  assert.equal(seats.occupiedSeats, 1);
  assert.equal(seats.activeServingCount, 1);
  assert.equal(seats.reserved, true);
  assert.equal(seats.reusedShiftSeat, false);
  assert.equal(memory.writes.length, 2);
});

test('night shift seat store reuses retained seat for same user', async () => {
  const memory = createMemorySeatStore({
    initialSummary: {
      shiftKey: 'shift-1',
      activeUsersCountSnapshot: 10,
      seatLimit: 5,
      occupiedSeats: 3,
      activeServingCount: 1,
      retainedSeats: 1,
    },
    rowsByQuery: (filters) => (filters.status === 'ended' ? [{ userId: 'user-1', seatRetained: true }] : []),
  });

  const seats = await memory.store.reserveShiftSeat({ key: 'shift-1' }, {
    userId: 'user-1',
    now: new Date('2026-05-25T20:00:00.000Z'),
  });

  assert.equal(seats.occupiedSeats, 3);
  assert.equal(seats.activeServingCount, 2);
  assert.equal(seats.retainedSeats, 0);
  assert.equal(seats.reusedShiftSeat, true);
  assert.equal(seats.reusedRetainedSeat, true);
  assert.equal(seats.reserved, true);
});

test('night shift seat store releases active seat into retained seat', async () => {
  const memory = createMemorySeatStore({
    initialSummary: {
      shiftKey: 'shift-1',
      activeUsersCountSnapshot: 10,
      seatLimit: 5,
      occupiedSeats: 3,
      activeServingCount: 2,
      retainedSeats: 0,
    },
  });

  const summary = await memory.store.applyShiftSeatRelease({
    sessionId: 'session-1',
    userId: 'user-1',
    shiftKey: 'shift-1',
    status: 'active',
  }, {
    seatRetained: true,
    now: new Date('2026-05-25T21:00:00.000Z'),
  });

  assert.equal(summary.occupiedSeats, 3);
  assert.equal(summary.activeServingCount, 1);
  assert.equal(summary.retainedSeats, 1);
});

test('night shift seat store rebuilds summary counters from sessions', async () => {
  const memory = createMemorySeatStore({
    initialSummary: {
      shiftKey: 'shift-1',
      activeUsersCountSnapshot: 10,
      seatLimit: 5,
      occupiedSeats: 0,
      activeServingCount: 0,
      retainedSeats: 0,
    },
    rowsByQuery: () => [
      { userId: 'user-1', status: 'active' },
      { userId: 'user-2', status: 'ended' },
      { userId: 'user-1', status: 'ended' },
    ],
  });

  const summary = await memory.store.rebuildShiftSummaryCounters(memory.summary, {
    now: new Date('2026-05-25T22:00:00.000Z'),
  });

  assert.equal(summary.occupiedSeats, 2);
  assert.equal(summary.activeServingCount, 1);
  assert.equal(summary.retainedSeats, 1);
});
