const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';

const {
  buildSignals,
  sanitizeRewardRollbackEntries,
} = require('../services/multiAccountService');
const {
  riskLevelByScore,
} = require('../services/automationRiskService');

test('automation security normalizes Gmail aliases for anti-farm matching', () => {
  const signals = buildSignals({
    email: 'Test.User+promo@Gmail.com',
    ip: '  192.168.0.1 ',
    deviceId: ' DEVICE-1 ',
    fingerprint: ' FINGER-1 ',
  });

  assert.equal(signals.emailRaw, 'Test.User+promo@Gmail.com');
  assert.equal(signals.emailNormalized, 'testuser@gmail.com');
  assert.equal(signals.ip, '192.168.0.1');
  assert.equal(signals.deviceId, 'device-1');
  assert.equal(signals.fingerprint, 'finger-1');
});

test('automation security keeps non-Gmail local part unchanged except case and spaces', () => {
  const signals = buildSignals({
    email: ' Name.Surname+promo@yandex.ru ',
  });

  assert.equal(signals.emailNormalized, 'name.surname+promo@yandex.ru');
});

test('automation risk score boundaries stay stable', () => {
  assert.equal(riskLevelByScore(0), 'low');
  assert.equal(riskLevelByScore(29.99), 'low');
  assert.equal(riskLevelByScore(30), 'medium');
  assert.equal(riskLevelByScore(60), 'high');
  assert.equal(riskLevelByScore(90), 'critical');
});

test('automation reward rollback keeps only rewards tied to battle evidence', () => {
  const evidence = [
    {
      signal: 'parallel_battle',
      details: {
        battles: [{ battleId: 'battle-1' }],
      },
    },
  ];
  const userMap = new Map([
    ['user-1', { email: 'one@example.com', nickname: 'One' }],
  ]);

  const rows = sanitizeRewardRollbackEntries([
    {
      id: 'tx-1',
      userId: 'user-1',
      battleId: 'battle-1',
      amount: 10,
      currency: 'K',
      status: 'pending',
      occurredAt: '2026-05-24T10:00:00.000Z',
    },
    {
      id: 'tx-2',
      userId: 'user-1',
      battleId: 'battle-1',
      amount: 5,
      currency: 'K',
      status: 'pending',
      occurredAt: '2026-05-24T10:10:00.000Z',
    },
    {
      id: 'tx-ignored',
      userId: 'user-1',
      battleId: 'battle-2',
      amount: 99,
      currency: 'K',
      status: 'pending',
      occurredAt: '2026-05-24T11:00:00.000Z',
    },
  ], evidence, userMap);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].userEmail, 'one@example.com');
  assert.equal(rows[0].battleId, 'battle-1');
  assert.equal(rows[0].amount, 15);
  assert.equal(rows[0].transactionCount, 2);
  assert.deepEqual(rows[0].transactionIds, ['tx-1', 'tx-2']);
});

test('automation reward rollback returns empty list without battle evidence', () => {
  const rows = sanitizeRewardRollbackEntries([
    {
      id: 'tx-1',
      userId: 'user-1',
      battleId: 'battle-1',
      amount: 10,
    },
  ], [], new Map());

  assert.deepEqual(rows, []);
});
