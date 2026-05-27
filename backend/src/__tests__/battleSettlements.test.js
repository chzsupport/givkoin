const test = require('node:test');
const assert = require('node:assert/strict');

const { buildBattleSettlementFinishOptions } = require('../services/battle/battleSettlements');

test('battle settlement finish options keep final settlement contract', () => {
  const attendance = [{ user: 'u1', damage: 100 }];
  const options = buildBattleSettlementFinishOptions({
    attendance,
    attendanceCount: 1,
    totalLightDamage: 123,
    totalDarknessDamage: 456,
    finalReportWindowClosedAt: '2026-01-01T00:10:00.000Z',
  });

  assert.deepEqual(options, {
    attendance,
    attendanceCount: 1,
    absoluteLightDamage: 123,
    absoluteDarknessDamage: 456,
    endedAt: '2026-01-01T00:10:00.000Z',
    deferSideEffects: true,
  });
});

test('battle settlement finish options normalize missing values', () => {
  const options = buildBattleSettlementFinishOptions({});

  assert.deepEqual(options, {
    attendance: [],
    attendanceCount: 0,
    absoluteLightDamage: 0,
    absoluteDarknessDamage: 0,
    endedAt: null,
    deferSideEffects: true,
  });
});
