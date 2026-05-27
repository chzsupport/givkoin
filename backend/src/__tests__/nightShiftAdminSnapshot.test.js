const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createNightShiftAdminSnapshot,
  loadUserMap,
} = require('../services/nightShift/nightShiftAdminSnapshot');

function createUsersClient(rows) {
  return () => ({
    from(table) {
      assert.equal(table, 'users');
      return {
        select(columns) {
          assert.equal(columns, 'id,email,nickname');
          return {
            async in(field, ids) {
              assert.equal(field, 'id');
              return {
                data: rows.filter((row) => ids.map(String).includes(String(row.id))),
                error: null,
              };
            },
          };
        },
      };
    },
  });
}

test('night shift admin snapshot loads user map safely', async () => {
  const map = await loadUserMap(['user-1', 'user-2'], createUsersClient([
    { id: 'user-1', email: 'one@example.com', nickname: 'One' },
    { id: 'user-3', email: 'three@example.com', nickname: 'Three' },
  ]));

  assert.deepEqual(map.get('user-1'), {
    nickname: 'One',
    email: 'one@example.com',
  });
  assert.equal(map.has('user-2'), false);
});

test('night shift admin snapshot builds active recent and suspicious lists', async () => {
  const calls = [];
  const { getAdminSnapshot } = createNightShiftAdminSnapshot({
    getSupabaseClient: createUsersClient([
      { id: 'user-1', email: 'one@example.com', nickname: 'One' },
      { id: 'user-2', email: 'two@example.com', nickname: 'Two' },
      { id: 'user-3', email: 'three@example.com', nickname: 'Three' },
    ]),
    listRuntimeSessionsByFilters: async (filters) => {
      calls.push(filters);
      if (filters.status === 'active') {
        return [{
          userId: 'user-1',
          sessionId: 'active-1',
          startedAt: '2026-05-25T20:00:00.000Z',
          lastHeartbeatAt: '2026-05-25T20:05:00.000Z',
          totalAcceptedAnomalies: '7',
        }];
      }
      if (filters.status === 'ended') {
        return [{
          userId: 'user-2',
          sessionId: 'ended-1',
          startedAt: '2026-05-25T19:00:00.000Z',
          endedAt: '2026-05-25T21:00:00.000Z',
          finalReport: { totalDurationSeconds: '7200' },
          totalAcceptedAnomalies: '80',
          payableHours: '2',
          reward: { k: 200, lm: 200, stars: 0.002 },
          settlementStatus: 'settled',
          reviewStatus: 'clean',
        }];
      }
      return [{
        userId: 'user-3',
        sessionId: 'pending-1',
        status: 'ended',
        reviewStatus: 'pending',
        startedAt: '2026-05-25T19:00:00.000Z',
        endedAt: '2026-05-25T22:00:00.000Z',
        finalReport: { totalDurationSeconds: '10800' },
        totalAcceptedAnomalies: '150',
        totalReportedAnomalies: '160',
        suspiciousWindows: [{ index: 1, expected: 3, received: 4 }],
      }];
    },
  });

  const snapshot = await getAdminSnapshot({ recentLimit: 50 });

  assert.deepEqual(calls, [
    { status: 'active', limit: 500 },
    { status: 'ended', limit: 100 },
    { reviewStatus: 'pending', limit: 200 },
  ]);
  assert.equal(snapshot.active[0].nickname, 'One');
  assert.equal(snapshot.active[0].totalAnomalies, 7);
  assert.equal(snapshot.recentShifts[0].nickname, 'Two');
  assert.equal(snapshot.recentShifts[0].totalDurationSeconds, 7200);
  assert.equal(snapshot.suspicious[0].nickname, 'Three');
  assert.equal(snapshot.suspicious[0].mismatchCount, 1);
  assert.deepEqual(snapshot.suspicious[0].latestMismatch, { index: 1, expected: 3, received: 4 });
});
