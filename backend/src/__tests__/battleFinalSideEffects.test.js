const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeBattleFinalSideEffectDelay,
  getBattleResultKey,
} = require('../services/battle/battleFinalSideEffects');

test('battle final side effect result key keeps old result names', () => {
  assert.equal(getBattleResultKey({ lightDamage: 10, darknessDamage: 10 }), 'draw');
  assert.equal(getBattleResultKey({ lightDamage: 11, darknessDamage: 10 }), 'light');
  assert.equal(getBattleResultKey({ lightDamage: 9, darknessDamage: 10 }), 'dark');
});

test('battle final side effect delay spreads by batch count', () => {
  assert.equal(computeBattleFinalSideEffectDelay({ attendanceCount: 0, spreadMs: 1000, batchSize: 100 }), 1000);
  assert.equal(computeBattleFinalSideEffectDelay({ attendanceCount: 100, spreadMs: 1000, batchSize: 100 }), 1000);
  assert.equal(computeBattleFinalSideEffectDelay({ attendanceCount: 250, spreadMs: 900, batchSize: 100 }), 300);
});
