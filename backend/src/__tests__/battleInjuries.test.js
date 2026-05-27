const test = require('node:test');
const assert = require('node:assert/strict');

const { pickPriorityInjuryBranchNameFromRows } = require('../services/battle/battleInjuries');

test('battle injury branch picker counts active absent users only', () => {
  const now = new Date('2026-01-04T00:00:00.000Z');
  const battle = {
    attendance: [{ user: 'joined-user' }],
  };
  const rows = [
    {
      id: 'joined-user',
      email: 'joined@test.local',
      status: 'active',
      email_confirmed: true,
      role: 'user',
      last_online_at: '2026-01-03T23:00:00.000Z',
      data: { treeBranch: 'joined', quietWatchPassed: true },
    },
    {
      id: 'north-1',
      email: 'north1@test.local',
      status: 'active',
      email_confirmed: true,
      role: 'user',
      last_online_at: '2026-01-03T23:00:00.000Z',
      data: { treeBranch: 'north', quietWatchPassed: true },
    },
    {
      id: 'north-2',
      email: 'north2@test.local',
      status: 'active',
      email_confirmed: true,
      role: 'user',
      last_seen_at: '2026-01-03T22:00:00.000Z',
      data: { treeBranch: 'north', quietWatchPassed: true },
    },
    {
      id: 'south-1',
      email: 'south@test.local',
      status: 'active',
      email_confirmed: true,
      role: 'user',
      last_online_at: '2026-01-03T23:00:00.000Z',
      data: { treeBranch: 'south', quietWatchPassed: true },
    },
    {
      id: 'admin-1',
      email: 'root@admin.test',
      status: 'active',
      email_confirmed: true,
      role: 'user',
      last_online_at: '2026-01-03T23:00:00.000Z',
      data: { treeBranch: 'south', quietWatchPassed: true },
    },
    {
      id: 'old-1',
      email: 'old@test.local',
      status: 'active',
      email_confirmed: true,
      role: 'user',
      last_online_at: '2025-12-01T00:00:00.000Z',
      data: { treeBranch: 'south', quietWatchPassed: true },
    },
  ];

  const branch = pickPriorityInjuryBranchNameFromRows(battle, rows, now, { random: () => 0 });

  assert.equal(branch, 'north');
});

test('battle injury branch picker returns null without eligible users', () => {
  const branch = pickPriorityInjuryBranchNameFromRows(
    { attendance: [] },
    [{ id: 'u1', status: 'blocked', data: { treeBranch: 'north' } }],
    new Date('2026-01-04T00:00:00.000Z')
  );

  assert.equal(branch, null);
});
