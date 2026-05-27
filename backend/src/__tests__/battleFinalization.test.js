const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinalizedAttendanceFromReports,
  computeFinalizedBattleDamageTotals,
} = require('../services/battle/battleFinalization');

test('battle finalization merges runtime attendance with latest final report', async () => {
  const updatedAttendance = await buildFinalizedAttendanceFromReports({
    runtimeAttendance: [{
      user: 'u1',
      syncIntervalSeconds: 60,
      lastAcceptedReportSequence: 1,
      reported: {
        damage: 100,
        hits: 1,
      },
    }],
    storedAttendance: [{ user: 'stored-only' }],
    runtimeFinalReports: [{
      userId: 'u1',
      reportSequence: 2,
      acceptedAt: '2026-01-01T00:05:00.000Z',
      report: {
        damageDelta: 900,
        hits: 2,
        baddieDamage: 4,
      },
    }],
  });

  assert.equal(updatedAttendance.length, 1);
  assert.equal(updatedAttendance[0].user, 'u1');
  assert.equal(updatedAttendance[0].damage, 1000);
  assert.equal(updatedAttendance[0].totalHits, 3);
  assert.equal(updatedAttendance[0].darknessDamageFromBaddies, 4);
  assert.equal(updatedAttendance[0].lastAcceptedReportSequence, 2);
});

test('battle finalization damage totals keep old force math stable', () => {
  const totals = computeFinalizedBattleDamageTotals({
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-01T00:00:10.000Z',
    activeUsersCountSnapshot: 2,
  }, [
    { damage: 100, darknessDamageFromBaddies: 5 },
    { damage: 50, darknessDamageFromBaddies: 2 },
  ], new Date('2026-01-01T00:00:10.000Z'));

  assert.deepEqual(totals, {
    forceTotals: {
      guardianDamage: 1000,
      darknessBaseDamage: 1000,
      darknessDamageFromBaddies: 7,
    },
    totalDarknessDamage: 1007,
    totalLightDamage: 1150,
    totalPlayerDamage: 150,
  });
});
