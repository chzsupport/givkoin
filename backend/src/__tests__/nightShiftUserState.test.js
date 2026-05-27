const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createNightShiftUserState,
  getNightShiftFromUserData,
  getUserData,
  mergeRuntimeIntoNightShift,
  toId,
} = require('../services/nightShift/nightShiftUserState');

test('night shift user state reads nested ids and user data safely', () => {
  assert.equal(toId({ value: { id: 123 } }), '123');
  assert.equal(toId({ value: { value: { _id: 'deep' } } }), 'deep');
  assert.equal(toId({ value: { value: { value: { value: { id: 'too-deep' } } } } }), '');
  assert.deepEqual(getUserData({ data: { nightShift: { isServing: true } } }), { nightShift: { isServing: true } });
  assert.deepEqual(getUserData({ data: null }), {});
});

test('night shift user state normalizes stored night shift data', () => {
  const state = getNightShiftFromUserData({
    nightShift: {
      isServing: true,
      sessionId: 'session-1',
      anomalySeed: '12',
      acceptedAnomaliesCurrentSession: '7',
      payableHoursCurrent: '2',
      consecutiveEmptyWindows: '1',
      seatLimitSnapshot: '20.9',
      occupiedSeatsSnapshot: -3,
      stats: {
        totalTimeMs: '1000',
        anomaliesCleared: '5',
        totalEarnings: {
          k: '10',
          lm: '20',
          stars: '0.002',
        },
      },
    },
  });

  assert.equal(state.isServing, true);
  assert.equal(state.sessionId, 'session-1');
  assert.equal(state.anomalySeed, 12);
  assert.equal(state.acceptedAnomaliesCurrentSession, 7);
  assert.equal(state.payableHoursCurrent, 2);
  assert.equal(state.consecutiveEmptyWindows, 1);
  assert.equal(state.seatLimitSnapshot, 20);
  assert.equal(state.occupiedSeatsSnapshot, 0);
  assert.deepEqual(state.stats.totalEarnings, { k: 10, lm: 20, stars: 0.002 });
});

test('night shift user state merges active runtime into stored state', () => {
  const merged = mergeRuntimeIntoNightShift({
    isServing: false,
    sessionId: null,
    startTime: null,
    lastActivityAt: 'old',
  }, {
    status: 'active',
    sessionId: 'runtime-1',
    startedAt: '2026-05-25T19:00:00.000Z',
    lastSeenAt: '2026-05-25T19:05:00.000Z',
    totalAcceptedAnomalies: 8,
    payableHours: 1,
    consecutiveEmptyWindows: 2,
    shiftKey: '2026-05-25',
    shiftEndsAt: '2026-05-26T06:00:00.000Z',
    seatLimitSnapshot: 10,
    occupiedSeatsSnapshot: 4,
  });

  assert.equal(merged.isServing, true);
  assert.equal(merged.sessionId, 'runtime-1');
  assert.equal(merged.startTime, '2026-05-25T19:00:00.000Z');
  assert.equal(merged.lastActivityAt, '2026-05-25T19:05:00.000Z');
  assert.equal(merged.acceptedAnomaliesCurrentSession, 8);
  assert.equal(merged.payableHoursCurrent, 1);
  assert.equal(merged.consecutiveEmptyWindows, 2);
  assert.equal(merged.shiftKey, '2026-05-25');
});

test('night shift user state store keeps get and update shapes', async () => {
  const calls = [];
  const rows = new Map([
    ['user-1', { id: 'user-1', email: 'one@example.com', nickname: 'One', data: { kept: true } }],
  ]);
  const getSupabaseClient = () => ({
    from(table) {
      const state = { table, updatePayload: null, id: '' };
      const chain = {
        select(value) {
          calls.push(['select', table, value]);
          return chain;
        },
        update(payload) {
          state.updatePayload = payload;
          calls.push(['update', table, payload]);
          return chain;
        },
        eq(field, value) {
          calls.push(['eq', table, field, value]);
          if (field === 'id') state.id = String(value);
          return chain;
        },
        async maybeSingle() {
          calls.push(['maybeSingle', table]);
          if (state.updatePayload) {
            const existing = rows.get(state.id);
            const next = { ...existing, data: state.updatePayload.data };
            rows.set(state.id, next);
            return { data: next, error: null };
          }
          return { data: rows.get(state.id) || null, error: null };
        },
      };
      return chain;
    },
  });

  const store = createNightShiftUserState({
    getSupabaseClient,
    now: () => new Date('2026-05-25T12:00:00.000Z'),
  });

  assert.deepEqual(await store.getUserRowById({ id: 'user-1' }), {
    id: 'user-1',
    email: 'one@example.com',
    nickname: 'One',
    data: { kept: true },
  });

  const updated = await store.updateUserDataById('user-1', { nightShift: { isServing: false } });
  assert.deepEqual(updated.data, {
    kept: true,
    nightShift: { isServing: false },
  });
  assert.equal(
    calls.some((row) => row[0] === 'update' && row[2].updated_at === '2026-05-25T12:00:00.000Z'),
    true
  );
});
