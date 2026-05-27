const test = require('node:test');
const assert = require('node:assert/strict');

const { BATTLE_FINAL_REPORT_ACCEPT_SECONDS } = require('../services/battle/battleConfig');
const {
  acquireBattleEarlyFinalizeLock,
  clearBattleFinalizeSchedule,
  getBattleFinalizeAtMs,
  hasBattleEarlyFinalizeLock,
  releaseBattleEarlyFinalizeLock,
  scheduleBattleFinalize,
  shouldFinalizeBattleNow,
} = require('../services/battle/battleFinalizeScheduler');

test('battle finalize scheduler keeps final report accept window', () => {
  const endsAt = '2026-01-01T00:00:00.000Z';
  const expected = new Date(
    new Date(endsAt).getTime() + BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000
  ).getTime();

  assert.equal(getBattleFinalizeAtMs({ endsAt }), expected);
  assert.equal(Number.isFinite(getBattleFinalizeAtMs({ endsAt: null })), false);
});

test('battle finalize scheduler skips non-active battle without timer', () => {
  const battleId = 'scheduler-non-active-test';

  assert.equal(scheduleBattleFinalize({
    _id: battleId,
    status: 'finished',
    endsAt: '2026-01-01T00:00:00.000Z',
  }), false);

  clearBattleFinalizeSchedule(battleId);
});

test('battle early finalize lock allows only one active finalization', () => {
  const battleId = 'scheduler-lock-test';

  releaseBattleEarlyFinalizeLock(battleId);
  assert.equal(hasBattleEarlyFinalizeLock(battleId), false);
  assert.equal(acquireBattleEarlyFinalizeLock(battleId), true);
  assert.equal(hasBattleEarlyFinalizeLock(battleId), true);
  assert.equal(acquireBattleEarlyFinalizeLock(battleId), false);
  releaseBattleEarlyFinalizeLock(battleId);
  assert.equal(hasBattleEarlyFinalizeLock(battleId), false);
});

test('battle finalization readiness keeps report window behavior stable', () => {
  const battle = { endsAt: '2026-01-01T00:00:00.000Z' };
  const endsAtMs = new Date(battle.endsAt).getTime();

  assert.equal(shouldFinalizeBattleNow(battle, { nowMs: endsAtMs - 1 }), false);
  assert.equal(shouldFinalizeBattleNow(battle, { nowMs: endsAtMs + 1 }), false);
  assert.equal(shouldFinalizeBattleNow(battle, {
    nowMs: endsAtMs + 1,
    allParticipantsReported: true,
  }), true);
  assert.equal(shouldFinalizeBattleNow(battle, {
    nowMs: endsAtMs + BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000,
  }), true);
});
