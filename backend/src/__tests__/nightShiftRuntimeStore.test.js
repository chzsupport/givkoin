const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createNightShiftRuntimeStore,
} = require('../services/nightShift/nightShiftRuntimeStore');

test('night shift runtime store reads sessions by stable document id', async () => {
  const seenIds = [];
  const store = createNightShiftRuntimeStore({
    getDocById: async (id) => {
      seenIds.push(id);
      return {
        sessionId: 'session-1',
        userId: 42,
        status: 'active',
      };
    },
  });

  const runtime = await store.getRuntimeSession('session-1');

  assert.deepEqual(seenIds, ['night_shift_runtime:session-1']);
  assert.equal(runtime.sessionId, 'session-1');
  assert.equal(runtime.userId, '42');
  assert.equal(runtime.status, 'active');
});

test('night shift runtime store writes normalized shift summaries', async () => {
  const upserts = [];
  const updatedAt = new Date('2026-05-25T19:00:00.000Z');
  const store = createNightShiftRuntimeStore({
    upsertDoc: async (payload) => upserts.push(payload),
  });

  const summary = await store.writeShiftSummary(' 2026-05-25 ', {
    activeUsersCountSnapshot: '10.8',
    seatLimit: '5',
    occupiedSeats: '3',
    activeServingCount: '2',
    retainedSeats: '1',
  }, { updatedAt });

  assert.equal(summary.shiftKey, '2026-05-25');
  assert.equal(summary.activeUsersCountSnapshot, 10);
  assert.deepEqual(upserts, [{
    id: 'night_shift_summary:2026-05-25',
    model: 'NightShiftRuntimeSummary',
    data: summary,
    createdAt: updatedAt,
    updatedAt,
  }]);
});

test('night shift runtime store lists sessions with document filters', async () => {
  let query = null;
  const store = createNightShiftRuntimeStore({
    listDocsByModel: async (model, options) => {
      query = { model, options };
      return [
        { sessionId: 'session-1', userId: 'user-1', status: 'active' },
        { sessionId: 'session-2', userId: 'user-2', status: 'ended' },
      ];
    },
  });

  const rows = await store.listRuntimeSessionsByFilters({
    status: ['active', 'ended'],
    settlementStatus: 'queued',
    userId: 'user-1',
    shiftKey: 'shift-1',
    reviewStatus: 'pending',
    finalVerificationStatus: 'queued',
    limit: 9000,
  });

  assert.equal(query.model, 'NightShiftRuntimeSession');
  assert.deepEqual(query.options.dataIn, { status: ['active', 'ended'] });
  assert.deepEqual(query.options.dataEq, {
    settlementStatus: 'queued',
    userId: 'user-1',
    shiftKey: 'shift-1',
    reviewStatus: 'pending',
    finalVerificationStatus: 'queued',
  });
  assert.equal(query.options.limit, 5000);
  assert.deepEqual(rows.map((row) => row.sessionId), ['session-1', 'session-2']);
});

test('night shift runtime store saves and patches normalized sessions', async () => {
  const writes = [];
  const updatedAt = new Date('2026-05-25T20:00:00.000Z');
  const store = createNightShiftRuntimeStore({
    getDocById: async () => ({
      sessionId: 'session-1',
      userId: 'user-1',
      status: 'active',
      totalAcceptedAnomalies: 2,
    }),
    toIso: (value) => new Date(value).toISOString(),
    updateDocByModel: async (model, id, data, options) => writes.push(['update', model, id, data, options]),
    upsertDoc: async (payload) => writes.push(['upsert', payload]),
  });

  const saved = await store.saveRuntimeSession('session-1', {
    userId: 'user-1',
    status: 'ended',
  }, { createdAt: updatedAt, updatedAt });
  const patched = await store.patchRuntimeSession('session-1', {
    totalAcceptedAnomalies: 7,
  }, { now: updatedAt });

  assert.equal(saved.sessionId, 'session-1');
  assert.equal(saved.status, 'ended');
  assert.equal(patched.totalAcceptedAnomalies, 7);
  assert.equal(writes[0][0], 'upsert');
  assert.equal(writes[0][1].id, 'night_shift_runtime:session-1');
  assert.equal(writes[0][1].model, 'NightShiftRuntimeSession');
  assert.equal(writes[1][0], 'update');
  assert.equal(writes[1][1], 'NightShiftRuntimeSession');
  assert.equal(writes[1][2], 'night_shift_runtime:session-1');
  assert.equal(writes[1][3].updatedAt, '2026-05-25T20:00:00.000Z');
});
