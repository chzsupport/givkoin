const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendBattleAttendanceByUser,
  buildBattleAttendanceByUser,
} = require('../services/automationRisk/automationRiskBattleAttendance');

test('automation risk battle attendance groups entries by user id', () => {
  const since = new Date('2026-05-01T00:00:00.000Z');
  const map = buildBattleAttendanceByUser([
    {
      _id: 'b1',
      updatedAt: '2026-05-02T00:00:00.000Z',
      attendance: [
        {
          user: { _id: 'u1' },
          joinedAt: '2026-05-02T10:00:00.000Z',
          automationTelemetry: { shotTelemetryCount: 10 },
          voiceCommandsTotalAttempts: '2',
          voiceCommandsSuccess: '1',
        },
        {
          user: 'u2',
          joinedAt: '2026-05-02T11:00:00.000Z',
          automationTelemetry: { shotTelemetryCount: 5 },
        },
      ],
    },
  ], since);

  assert.equal(map.get('u1')[0].battleId, 'b1');
  assert.equal(map.get('u1')[0].voiceCommandsTotalAttempts, 2);
  assert.equal(map.get('u1')[0].voiceCommandsSuccess, 1);
  assert.equal(map.get('u2')[0].automationTelemetry.shotTelemetryCount, 5);
});

test('automation risk battle attendance skips old invalid and anonymous entries', () => {
  const since = new Date('2026-05-01T00:00:00.000Z');
  const map = buildBattleAttendanceByUser([
    {
      _id: 'b1',
      attendance: [
        { user: '', joinedAt: '2026-05-02T10:00:00.000Z' },
        { user: 'u1', joinedAt: 'bad-date' },
        { user: 'u2', joinedAt: '2026-04-30T10:00:00.000Z' },
      ],
    },
  ], since);

  assert.equal(map.size, 0);
});

test('automation risk battle attendance appends to existing map', () => {
  const since = new Date('2026-05-01T00:00:00.000Z');
  const map = new Map();

  appendBattleAttendanceByUser(map, {
    _id: 'b1',
    endsAt: '2026-05-02T00:00:00.000Z',
    attendance: [{ user: 'u1' }],
  }, since);
  appendBattleAttendanceByUser(map, {
    _id: 'b2',
    createdAt: '2026-05-03T00:00:00.000Z',
    attendance: [{ user: 'u1' }],
  }, since);

  assert.deepEqual(map.get('u1').map((row) => row.battleId), ['b1', 'b2']);
});
