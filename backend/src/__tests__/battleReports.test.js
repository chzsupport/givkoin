const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinalizedAttendanceEntry,
  buildLatestFinalReportsMap,
  mergeReportedState,
  normalizeReportedState,
  normalizeUniqueIds,
  normalizeVoiceResults,
  normalizeWeakZoneHitsMap,
} = require('../services/battle/battleReports');

test('battle report normalization clamps counters and keeps known ids unique', () => {
  const normalized = normalizeReportedState({
    intervalSeconds: 30,
    shotsByWeapon: { 1: 2.9, weapon2: '3', 3: -4 },
    hitsByWeapon: { 1: 1, weapon2: 2, weapon3: 3 },
    hits: 4.8,
    damage: 123.9,
    sparkIds: ['a', 'a', '', 'b'],
    weakZoneHitsById: { zone1: 2.8, zone2: -1, '': 9 },
    voiceResults: [
      { id: 'voice1', text: 'СТОЙ', acted: 1, success: true },
      { id: 'voice1', text: 'СТРЕЛЯЙ', acted: true, success: true },
      { id: 'voice2', text: 'bad', acted: false, success: false },
    ],
  });

  assert.equal(normalized.intervalSeconds, 30);
  assert.deepEqual(normalized.shotsByWeapon, { 1: 2, 2: 3, 3: 0 });
  assert.deepEqual(normalized.hitsByWeapon, { 1: 1, 2: 2, 3: 3 });
  assert.equal(normalized.hits, 4);
  assert.equal(normalized.damageDelta, 123);
  assert.deepEqual(normalized.sparkIds, ['a', 'b']);
  assert.deepEqual(normalized.weakZoneHitsById, { zone1: 2 });
  assert.deepEqual(normalized.voiceResults, [
    { id: 'voice1', text: 'СТОЙ', acted: true, success: true },
    { id: 'voice2', text: 'СТРЕЛЯЙ', acted: false, success: false },
  ]);
});

test('battle report merge adds heartbeat chunks without duplicating ids', () => {
  const merged = mergeReportedState(
    {
      shotsByWeapon: { 1: 1, 2: 1, 3: 0 },
      hitsByWeapon: { 1: 1, 2: 0, 3: 0 },
      hits: 1,
      damage: 100,
      sparkIds: ['s1'],
      weakZoneHitsById: { z1: 1 },
      voiceResults: [{ id: 'v1', text: 'СТОЙ', acted: true, success: true }],
      baddieDestroyedIds: ['b1'],
    },
    {
      shotsByWeapon: { 1: 2, 2: 0, 3: 1 },
      hitsByWeapon: { 1: 2, 2: 0, 3: 1 },
      hits: 3,
      damageDelta: 300,
      sparkIds: ['s1', 's2'],
      weakZoneHitsById: { z1: 2, z2: 1 },
      voiceResults: [{ id: 'v1', text: 'СТРЕЛЯЙ', acted: true, success: false }],
      baddieDestroyedIds: ['b1', 'b2'],
    },
    60
  );

  assert.deepEqual(merged.shotsByWeapon, { 1: 3, 2: 1, 3: 1 });
  assert.deepEqual(merged.hitsByWeapon, { 1: 3, 2: 0, 3: 1 });
  assert.equal(merged.hits, 4);
  assert.equal(merged.damageDelta, 400);
  assert.deepEqual(merged.sparkIds, ['s1', 's2']);
  assert.deepEqual(merged.weakZoneHitsById, { z1: 3, z2: 1 });
  assert.deepEqual(merged.voiceResults, [{ id: 'v1', text: 'СТРЕЛЯЙ', acted: true, success: false }]);
  assert.deepEqual(merged.baddieDestroyedIds, ['b1', 'b2']);
});

test('latest final report map keeps the highest sequence for each user', () => {
  const first = { userId: 'u1', reportSequence: 1, value: 'old' };
  const second = { user: 'u1', reportSequence: 3, value: 'new' };
  const other = { userId: 'u2', reportSequence: 2, value: 'other' };

  const map = buildLatestFinalReportsMap([first, other, second]);

  assert.equal(map.get('u1'), second);
  assert.equal(map.get('u2'), other);
  assert.equal(map.size, 2);
});

test('finalized attendance entry merges final report and keeps reward fields stable', () => {
  const row = {
    user: 'u1',
    syncIntervalSeconds: 60,
    lastAcceptedReportSequence: 1,
    reported: {
      damage: 100,
      hits: 1,
      totalShots: 2,
      voiceResults: [{ id: 'v1', text: 'СТРЕЛЯЙ', success: true }],
    },
  };
  const finalReport = {
    reportSequence: 2,
    acceptedAt: '2026-01-01T00:05:00.000Z',
    report: {
      damageDelta: 900,
      hits: 2,
      totalShots: 3,
      sparkIds: ['s1'],
      weakZoneHitsById: { z1: 1 },
      voiceResults: [{ id: 'v2', text: 'СТОЙ', success: false }],
      baddieDestroyedIds: ['b1'],
      baddieDamage: 4,
    },
  };

  const next = buildFinalizedAttendanceEntry(row, finalReport);

  assert.equal(next.damage, 1000);
  assert.equal(next.totalShots, 0);
  assert.equal(next.totalHits, 3);
  assert.deepEqual(next.sparkIds, ['s1']);
  assert.equal(next.weakZoneHits, 1);
  assert.equal(next.nonWeakZoneHits, 2);
  assert.equal(next.voiceCommandsSuccess, 1);
  assert.equal(next.voiceCommandsTotalAttempts, 2);
  assert.deepEqual(next.voiceCommandsHistory, [true, false]);
  assert.deepEqual(next.baddieDestroyedIds, ['b1']);
  assert.equal(next.darknessDamageFromBaddies, 4);
  assert.equal(next.finalReportAt, '2026-01-01T00:05:00.000Z');
  assert.equal(next.lastAcceptedReportSequence, 2);
  assert.equal(next.finalReportLate, false);
  assert.equal(next.finalReportHasPayload, true);
  assert.equal(next.personalDataSource, 'final_report');
  assert.equal(next.rewardK, 12);
});

test('finalized attendance entry keeps empty report fallback stable', () => {
  const next = buildFinalizedAttendanceEntry({ user: 'u1' }, null);

  assert.equal(next.damage, 0);
  assert.equal(next.totalShots, 0);
  assert.equal(next.totalHits, 0);
  assert.deepEqual(next.sparkIds, []);
  assert.equal(next.finalReportLate, true);
  assert.equal(next.finalReportHasPayload, false);
  assert.equal(next.personalDataSource, 'none');
  assert.equal(next.rewardK, 11);
});

test('battle report small helpers keep limits stable', () => {
  assert.deepEqual(normalizeUniqueIds(['a', 'a', 'b', 'c'], { limit: 2 }), ['a', 'b']);
  assert.deepEqual(normalizeWeakZoneHitsMap({ a: 1, b: 2, c: 3 }, { limit: 2 }), { a: 1, b: 2 });
  assert.deepEqual(normalizeVoiceResults([
    { id: 'v1', text: 'СТОЙ' },
    { id: 'v2', text: 'wrong' },
  ], { limit: 2 }), [
    { id: 'v1', text: 'СТОЙ', acted: false, success: false },
    { id: 'v2', text: 'СТРЕЛЯЙ', acted: false, success: false },
  ]);
});
