const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRewardRollbackEntries,
  collectRewardRollbackBattleIds,
  sanitizeRewardRollbackEntries,
} = require('../services/multiAccount/rewardRollback');

test('multi-account reward rollback collects battle ids from all supported evidence signals', () => {
  const battleIds = collectRewardRollbackBattleIds([
    { signal: 'parallel_battle', details: { battles: [{ battleId: 'battle-1' }] } },
    { signal: 'serial_battle_farming', details: { battles: [{ battleId: 'battle-2' }] } },
    { signal: 'battle_pattern', details: { users: [{ battleIds: ['battle-3', ''] }] } },
    { signal: 'battle_signature_cluster', details: { matches: [{ battleIds: ['battle-4', 'battle-1'] }] } },
    { signal: 'shared_ip', details: { battles: [{ battleId: 'ignored' }] } },
  ]);

  assert.deepEqual(Array.from(battleIds).sort(), ['battle-1', 'battle-2', 'battle-3', 'battle-4']);
});

test('multi-account reward rollback groups matching battle rewards without unrelated rewards', () => {
  const evidence = [
    { signal: 'parallel_battle', details: { battles: [{ battleId: 'battle-1' }] } },
  ];
  const userMap = new Map([
    ['user-1', { email: 'one@example.com', nickname: 'One' }],
  ]);

  const rows = sanitizeRewardRollbackEntries([
    { id: 'tx-1', userId: 'user-1', battleId: 'battle-1', amount: 10, currency: 'K', status: 'pending', occurredAt: '2026-05-24T10:00:00.000Z' },
    { id: 'tx-2', userId: 'user-1', battleId: 'battle-1', amount: 5, currency: 'K', status: 'pending', occurredAt: '2026-05-24T10:10:00.000Z' },
    { id: 'tx-ignored', userId: 'user-1', battleId: 'battle-2', amount: 99, currency: 'K', status: 'pending', occurredAt: '2026-05-24T11:00:00.000Z' },
  ], evidence, userMap);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].userEmail, 'one@example.com');
  assert.equal(rows[0].battleId, 'battle-1');
  assert.equal(rows[0].amount, 15);
  assert.equal(rows[0].transactionCount, 2);
  assert.deepEqual(rows[0].transactionIds, ['tx-1', 'tx-2']);
});

test('multi-account reward rollback builds pending entries from transactions', () => {
  const rows = buildRewardRollbackEntries([
    { id: 'tx-1', userId: 'user-1', battleId: 'battle-1', amount: 7.1254, currency: 'K', occurredAt: '2026-05-24T10:00:00.000Z' },
  ], new Map(), [
    { signal: 'parallel_battle', details: { battles: [{ battleId: 'battle-1' }] } },
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 7.125);
  assert.equal(rows[0].status, 'pending');
  assert.equal(rows[0].rolledBackAmount, 0);
});
