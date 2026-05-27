const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBattleAttendanceSnapshot,
  withBattleAttendanceLock,
} = require('../services/battle/battleAttendanceCounter');
const { BATTLE_BASE_DURATION_SECONDS } = require('../services/battle/battleConfig');

test('battle attendance snapshot keeps old public fields stable', () => {
  const snapshot = buildBattleAttendanceSnapshot({
    _id: 'battle-attendance-test',
    status: 'active',
    startsAt: '2026-01-01T00:00:00.000Z',
    firstPlayerJoinedAt: null,
    durationSeconds: 0,
    attendanceCount: '2',
    maxAttendanceCount: '4',
    uniqueAttendanceCount: '3',
    endsAt: '2026-01-01T01:00:00.000Z',
    isShrunken: 1,
    activeUsersCountSnapshot: '10',
    scenario: { weakZones: [] },
    injuries: [{ branchName: 'north' }],
    injury: { branchName: 'north' },
  });

  assert.deepEqual(snapshot, {
    _id: 'battle-attendance-test',
    status: 'active',
    startsAt: '2026-01-01T00:00:00.000Z',
    firstPlayerJoinedAt: null,
    durationSeconds: BATTLE_BASE_DURATION_SECONDS,
    attendanceCount: 2,
    maxAttendanceCount: 4,
    uniqueAttendanceCount: 3,
    endsAt: '2026-01-01T01:00:00.000Z',
    isShrunken: true,
    activeUsersCountSnapshot: 10,
    scenario: { weakZones: [] },
    injuries: [{ branchName: 'north' }],
    injury: { branchName: 'north' },
  });
});

test('battle attendance lock runs tasks for one battle in order', async () => {
  const order = [];
  let releaseFirst;

  const first = withBattleAttendanceLock('battle-attendance-lock-test', async () => {
    order.push('first-start');
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    order.push('first-end');
    return 1;
  });
  const second = withBattleAttendanceLock('battle-attendance-lock-test', async () => {
    order.push('second');
    return 2;
  });

  await new Promise((resolve) => {
    setImmediate(resolve);
  });
  assert.deepEqual(order, ['first-start']);

  releaseFirst();
  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
});
