const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFinishedBattleSummaryFromUsers,
  normalizeBattleUserId,
} = require('../services/battle/battleFinishedSummary');

test('finished battle summary ranks players and keeps top player field names stable', () => {
  const battle = {
    attendance: [
      { user: 'u1', damage: 100 },
      { user: 'u2', damage: 250 },
      { user: 'u3', damage: 50 },
    ],
  };
  const userRows = [
    { id: 'u1', nickname: 'One', email: 'one@test.local', data: { treeBranch: 'north' } },
    { id: 'u2', nickname: 'Two', email: 'two@test.local', data: { treeBranch: 'north' } },
    { id: 'u3', nickname: 'Three', email: 'three@test.local', data: { treeBranch: 'south' } },
  ];

  const summary = buildFinishedBattleSummaryFromUsers(battle, userRows);

  assert.equal(summary.usersById.size, 3);
  assert.deepEqual(battle.summaryTopPlayer, {
    userId: 'u2',
    nickname: 'Two',
    damage: 250,
  });
  assert.equal(battle.attendance[0].finalRank, 2);
  assert.equal(battle.attendance[1].finalRank, 1);
  assert.equal(battle.attendance[2].finalRank, 3);
  assert.equal(battle.attendance[0].finalBranchAvgDamageOther, 250);
  assert.equal(battle.attendance[1].finalBranchAvgDamageOther, 100);
  assert.equal(battle.attendance[2].finalBranchAvgDamageOther, null);
});

test('finished battle summary handles empty attendance', () => {
  const battle = { attendance: [] };
  const summary = buildFinishedBattleSummaryFromUsers(battle, []);

  assert.equal(summary.usersById.size, 0);
  assert.equal(battle.summaryTopPlayer, null);
});

test('battle user id normalization keeps old string conversion behavior', () => {
  assert.equal(normalizeBattleUserId(null), '');
  assert.equal(normalizeBattleUserId(123), '123');
  assert.equal(normalizeBattleUserId('u1'), 'u1');
});
