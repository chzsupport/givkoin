const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';

const {
  createAuthClientSignals,
  normalizeClientProfile,
} = require('../services/auth/authClientSignals');

function createSignals(calls) {
  return createAuthClientSignals({
    lookupIpIntel: async (ip) => {
      calls.push(['lookupIpIntel', ip]);
      return { ip, risk: 'low' };
    },
    buildSignals: (payload) => {
      calls.push(['buildSignals', payload]);
      return { built: true, payload };
    },
    fallbackFingerprint: () => 'fallback-fingerprint',
  });
}

test('auth client signals build registration context with fallback fingerprint', async () => {
  const calls = [];
  const signals = createSignals(calls);

  const context = await signals.buildRegistrationSignalContext({
    client: {
      ip: '127.0.0.1',
      deviceId: 'device-1',
      weakFingerprint: 'weak-1',
      profileKey: 'profile-1',
      clientProfile: { timezone: 'Asia/Qyzylorda' },
      userAgent: 'agent',
    },
    req: { headers: { 'user-agent': 'agent' } },
    email: 'user@example.com',
  });

  assert.equal(context.ip, '127.0.0.1');
  assert.equal(context.deviceId, 'device-1');
  assert.equal(context.fingerprint, 'fallback-fingerprint');
  assert.equal(context.weakFingerprint, 'weak-1');
  assert.deepEqual(context.ipIntel, { ip: '127.0.0.1', risk: 'low' });
  assert.equal(context.signals.built, true);
  assert.equal(calls[1][1].email, 'user@example.com');
  assert.equal(calls[1][1].clientProfile.timezone, 'Asia/Qyzylorda');
});

test('auth client signals build login context with old payload shape', async () => {
  const calls = [];
  const signals = createSignals(calls);

  const context = await signals.buildLoginSignalContext({
    client: {
      ip: '10.0.0.1',
      deviceId: 'device-2',
      fingerprint: 'fingerprint-2',
      weakFingerprint: 'weak-2',
      profileKey: 'profile-2',
      clientProfile: null,
      userAgent: 'agent-2',
    },
    email: 'login@example.com',
  });

  assert.deepEqual(calls[0], ['lookupIpIntel', '10.0.0.1']);
  assert.equal(context.profileKey, 'profile-2');
  assert.equal(context.clientProfile, null);
  assert.equal(context.signals.payload.fingerprint, 'fingerprint-2');
  assert.equal(context.signals.payload.email, 'login@example.com');
});

test('auth client signals normalize client profile', () => {
  assert.deepEqual(normalizeClientProfile({ a: 1 }), { a: 1 });
  assert.equal(normalizeClientProfile(null), null);
  assert.equal(normalizeClientProfile('bad'), null);
});
