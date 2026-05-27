const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttendanceTimingUpdate,
  computeBattleDurationSecondsForAttendance,
  computeBattleDurationSecondsForAttendanceWithBase,
  computeMissingAttendancePercent,
} = require('../services/battle/battleTiming');

test('battle duration shrinks by attendance but never below minimum', () => {
  assert.equal(computeBattleDurationSecondsForAttendance(0), 3600);
  assert.equal(computeBattleDurationSecondsForAttendance(1000), 3595);
  assert.equal(computeBattleDurationSecondsForAttendance(1000000), 900);
});

test('battle duration with custom base respects smaller base as minimum', () => {
  assert.equal(computeBattleDurationSecondsForAttendanceWithBase(0, 600), 600);
  assert.equal(computeBattleDurationSecondsForAttendanceWithBase(100000, 600), 600);
});

test('battle attendance timing update only shortens active unlocked battle', () => {
  const firstPlayerJoinedAt = '2026-01-01T00:00:00.000Z';
  const update = buildAttendanceTimingUpdate({
    status: 'active',
    durationLocked: false,
    firstPlayerJoinedAt,
    durationSeconds: 3600,
    attendanceCount: 1000,
    endsAt: '2026-01-01T01:00:00.000Z',
    isShrunken: false,
  });

  assert.equal(update.durationSeconds, 3595);
  assert.equal(update.endsAt.toISOString(), '2026-01-01T00:59:55.000Z');
  assert.equal(update.isShrunken, true);

  assert.equal(buildAttendanceTimingUpdate({ status: 'scheduled' }), null);
  assert.equal(buildAttendanceTimingUpdate({
    status: 'active',
    durationLocked: true,
    firstPlayerJoinedAt,
  }), null);
});

test('battle missing attendance percent keeps old target behavior', () => {
  assert.equal(computeMissingAttendancePercent({ attendanceCount: 0, activeUsersCount: 0 }), 0);
  assert.equal(computeMissingAttendancePercent({ attendanceCount: 25, activeUsersCount: 100 }), 50);
  assert.equal(computeMissingAttendancePercent({ attendanceCount: 50, activeUsersCount: 100 }), 0);
});
