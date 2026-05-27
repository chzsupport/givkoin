const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildScheduledBattleDocument,
  buildScheduledBattlePatch,
} = require('../services/battle/battleSchedule');

test('scheduled battle document keeps default fields stable', () => {
  const doc = buildScheduledBattleDocument({
    startsAt: '2026-01-01T00:00:00.000Z',
    durationSeconds: 120,
    durationLocked: true,
    scheduleSource: 'manual',
    scheduledIntervalHours: 6,
  });

  assert.equal(doc.status, 'scheduled');
  assert.equal(doc.startsAt.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(doc.endsAt.toISOString(), '2026-01-01T00:02:00.000Z');
  assert.equal(doc.durationSeconds, 120);
  assert.equal(doc.durationLocked, true);
  assert.equal(doc.scheduleSource, 'manual');
  assert.equal(doc.scheduledIntervalHours, 6);
  assert.deepEqual(doc.attendance, []);
  assert.deepEqual(doc.injuries, []);
  assert.equal(doc.summaryTopPlayer, null);
});

test('scheduled battle patch keeps old fallback duration behavior', () => {
  const patch = buildScheduledBattlePatch(
    {
      startsAt: '2026-01-01T00:00:00.000Z',
      durationSeconds: 300,
    },
    {
      startsAt: '2026-01-01T01:00:00.000Z',
      durationSeconds: 0,
      durationLocked: false,
      scheduledIntervalHours: null,
    }
  );

  assert.equal(patch.startsAt.toISOString(), '2026-01-01T01:00:00.000Z');
  assert.equal(patch.durationSeconds, 300);
  assert.equal(patch.endsAt.toISOString(), '2026-01-01T01:05:00.000Z');
  assert.equal(patch.durationLocked, false);
  assert.equal(patch.scheduledIntervalHours, null);
});

test('scheduled battle patch rejects invalid start time', () => {
  assert.throws(
    () => buildScheduledBattlePatch({ startsAt: '2026-01-01T00:00:00.000Z' }, { startsAt: 'bad-date' }),
    /Battle start time is invalid/
  );
});
