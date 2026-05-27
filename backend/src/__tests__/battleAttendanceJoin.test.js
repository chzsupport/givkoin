const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyBattleAttendanceCounterJoin,
  buildExistingAttendanceSync,
  buildInitialAttendanceEntry,
} = require('../services/battle/battleAttendanceJoin');
const {
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_SYNC_INTERVAL_SECONDS,
  BATTLE_SYNC_SLOT_COUNT,
} = require('../services/battle/battleConfig');

test('battle attendance join initial entry keeps old sync defaults', () => {
  const joinedAt = new Date('2026-01-01T00:00:00.000Z');
  assert.deepEqual(buildInitialAttendanceEntry('user-1', joinedAt), {
    user: 'user-1',
    joinedAt,
    damage: 0,
    syncSlot: 0,
    syncSlotCount: BATTLE_SYNC_SLOT_COUNT,
    syncIntervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  });
});

test('battle attendance join existing sync keeps old fallback fields', () => {
  assert.deepEqual(buildExistingAttendanceSync({
    syncSlot: 59,
    syncSlotCount: 60,
    syncIntervalSeconds: 60,
  }), {
    syncSlot: 59,
    syncSlotCount: 60,
    syncIntervalSeconds: 60,
  });

  assert.deepEqual(buildExistingAttendanceSync(null), {
    syncSlot: 0,
    syncSlotCount: BATTLE_SYNC_SLOT_COUNT,
    syncIntervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  });
});

test('battle attendance join counter update keeps first join timer contract', () => {
  const joinedAt = new Date('2026-01-01T00:00:00.000Z');
  const counter = {
    attendanceCount: 0,
    uniqueAttendanceCount: 0,
    maxAttendanceCount: 0,
    version: 0,
    dirty: false,
    battle: {
      _id: 'battle-join-test',
      status: 'active',
      durationLocked: false,
      firstPlayerJoinedAt: null,
      durationSeconds: 900,
      attendanceCount: 0,
      uniqueAttendanceCount: 0,
      maxAttendanceCount: 0,
    },
  };

  const result = applyBattleAttendanceCounterJoin(counter, joinedAt);

  assert.equal(result.startedByFirstJoin, true);
  assert.deepEqual(result.sync, {
    syncSlot: 0,
    syncSlotCount: BATTLE_SYNC_SLOT_COUNT,
    syncIntervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  });
  assert.equal(counter.attendanceCount, 1);
  assert.equal(counter.uniqueAttendanceCount, 1);
  assert.equal(counter.maxAttendanceCount, 1);
  assert.equal(counter.version, 1);
  assert.equal(counter.dirty, true);
  assert.equal(counter.battle.firstPlayerJoinedAt, joinedAt);
  assert.equal(counter.battle.durationSeconds, BATTLE_BASE_DURATION_SECONDS);
  assert.equal(
    counter.battle.endsAt.toISOString(),
    new Date(joinedAt.getTime() + BATTLE_BASE_DURATION_SECONDS * 1000).toISOString()
  );
});
