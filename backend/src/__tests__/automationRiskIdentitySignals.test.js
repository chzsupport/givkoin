const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateIdentitySignals,
} = require('../services/automationRisk/automationRiskIdentitySignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');
const {
  buildSignalMaps,
} = require('../services/automationRisk/automationRiskSignalMaps');

test('automation risk identity signals detect shared device and linked sanctions', () => {
  const user = {
    _id: 'u1',
    lastDeviceId: 'device-a',
    lastFingerprint: 'fp-a',
  };
  const users = [
    user,
    { _id: 'u2', lastDeviceId: 'device-a', status: 'banned' },
    { _id: 'u3', lastDeviceId: 'device-a', status: 'active' },
  ];
  const ctx = createRiskContext(user, new Date('2026-05-26T00:00:00.000Z'));

  evaluateIdentitySignals(ctx, {
    usersById: new Map(users.map((row) => [row._id, row])),
    maps: buildSignalMaps(users),
    referralsByInviter: new Map(),
    existingCaseByUser: new Map([['u3', { status: 'penalized' }]]),
  });

  assert.equal(ctx.signals.has('shared_device:device-a'), true);
  assert.equal(ctx.signals.has('linked_banned_account'), true);
  assert.equal(ctx.signals.has('linked_penalized_account'), true);
  assert.deepEqual(Array.from(ctx.relatedUsers).sort(), ['u2', 'u3']);
});

test('automation risk identity signals detect normalized email nickname and referral cluster', () => {
  const user = {
    _id: 'u1',
    emailNormalized: 'same@gmail.com',
    nicknameNormalized: 'hero',
    referredBy: 'inviter',
  };
  const users = [
    user,
    { _id: 'u2', emailNormalized: 'same@gmail.com', nicknameNormalized: 'hero' },
    { _id: 'u3', emailNormalized: 'other@gmail.com', nicknameNormalized: 'hero' },
  ];
  const ctx = createRiskContext(user, new Date('2026-05-26T00:00:00.000Z'));

  evaluateIdentitySignals(ctx, {
    usersById: new Map(users.map((row) => [row._id, row])),
    maps: buildSignalMaps(users),
    referralsByInviter: new Map([['inviter', new Set(['u1', 'u2', 'u3'])]]),
    existingCaseByUser: new Map(),
  });

  assert.equal(ctx.signals.has('email_normalized_collision'), true);
  assert.equal(ctx.signals.has('nickname_normalized_collision'), true);
  assert.equal(ctx.signals.has('referral_cluster:inviter'), true);
  assert.equal(ctx.evidence.find((row) => row.signal === 'referral_cluster:inviter').meta.invitees, 3);
});
