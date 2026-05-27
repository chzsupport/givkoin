const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findBattleByStatusFallbackFromRows,
  listScheduledBattlesFromRows,
} = require('../services/battle/battleLookup');

test('battle lookup fallback picks latest or earliest battle by status', () => {
  const rows = [
    { _id: 'old', status: 'active', startsAt: '2026-01-01T00:00:00.000Z' },
    { _id: 'new', status: 'active', startsAt: '2026-01-02T00:00:00.000Z' },
    { _id: 'scheduled', status: 'scheduled', startsAt: '2026-01-03T00:00:00.000Z' },
  ];

  assert.equal(findBattleByStatusFallbackFromRows(rows, 'active', 'desc')._id, 'new');
  assert.equal(findBattleByStatusFallbackFromRows(rows, 'active', 'asc')._id, 'old');
  assert.equal(findBattleByStatusFallbackFromRows(rows, 'finished', 'desc'), null);
});

test('battle scheduled lookup keeps manual schedule first and can include auto', () => {
  const rows = [
    { _id: 'manual-late', status: 'scheduled', scheduleSource: 'manual', startsAt: '2026-01-03T00:00:00.000Z' },
    { _id: 'auto', status: 'scheduled', scheduleSource: 'auto', startsAt: '2026-01-01T00:00:00.000Z' },
    { _id: 'manual-early', status: 'scheduled', scheduleSource: 'manual', startsAt: '2026-01-02T00:00:00.000Z' },
    { _id: 'active', status: 'active', startsAt: '2026-01-01T00:00:00.000Z' },
  ];

  assert.deepEqual(
    listScheduledBattlesFromRows(rows, { includeAuto: false }).map((row) => row._id),
    ['manual-early', 'manual-late']
  );
  assert.deepEqual(
    listScheduledBattlesFromRows(rows, { includeAuto: true }).map((row) => row._id),
    ['auto', 'manual-early', 'manual-late']
  );
});
