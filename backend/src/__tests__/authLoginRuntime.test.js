const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthLoginRuntime } = require('../services/auth/authLoginRuntime');

function createSupabase(calls) {
  return {
    from(table) {
      calls.push(['from', table]);

      const query = {
        update(payload) {
          calls.push(['update', table, payload]);
          return query;
        },
        eq(field, value) {
          calls.push(['eq', table, field, value]);
          return query;
        },
      };

      return query;
    },
  };
}

test('auth login runtime writes current login state and records signals', async () => {
  const calls = [];
  const runtime = createAuthLoginRuntime({
    getSupabaseClient: () => createSupabase(calls),
    handlePostLoginMultiAccount: async (payload) => {
      calls.push(['multi', payload]);
      return { frozen: false };
    },
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    recordSignalHistory: async (payload) => calls.push(['history', payload]),
  });

  const result = await runtime.recordLoginRuntimeState({
    user: {
      _id: 'user-1',
      lastIp: 'old-ip',
      lastDeviceId: 'old-device',
      lastFingerprint: 'old-fp',
    },
    userRow: {
      data: {
        lastWeakFingerprint: 'old-weak',
        lastClientProfile: { old: true },
        k: 10,
      },
    },
    client: {
      ip: '1.2.3.4',
      deviceId: 'device-1',
      fingerprint: 'fp-1',
      weakFingerprint: 'weak-1',
    },
    loginSignalContext: {
      signals: { email: 'user@example.com' },
      profileKey: 'profile-1',
      clientProfile: { screen: 'wide' },
    },
    loginIpIntel: { risk: 'low' },
    req: { id: 'req-1' },
  });

  assert.deepEqual(result, {
    loginSignals: { email: 'user@example.com' },
    multiAccountResult: { frozen: false },
  });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].last_online_at, '2026-05-26T12:00:00.000Z');
  assert.equal(updateCall[2].last_ip, '1.2.3.4');
  assert.equal(updateCall[2].last_device_id, 'device-1');
  assert.equal(updateCall[2].last_fingerprint, 'fp-1');
  assert.equal(updateCall[2].data.k, 10);
  assert.equal(updateCall[2].data.lastWeakFingerprint, 'weak-1');
  assert.equal(updateCall[2].data.lastProfileKey, 'profile-1');
  assert.deepEqual(updateCall[2].data.lastClientProfile, { screen: 'wide' });
  assert.deepEqual(updateCall[2].data.lastIpIntel, { risk: 'low' });

  const historyCall = calls.find((row) => row[0] === 'history');
  assert.equal(historyCall[1].userId, 'user-1');
  assert.equal(historyCall[1].eventType, 'login');
  assert.deepEqual(historyCall[1].meta.clientProfile, { screen: 'wide' });

  const multiCall = calls.find((row) => row[0] === 'multi');
  assert.equal(multiCall[1].user._id, 'user-1');
  assert.deepEqual(multiCall[1].signals, { email: 'user@example.com' });
});

test('auth login runtime keeps old fallback values when client data is missing', async () => {
  const calls = [];
  const runtime = createAuthLoginRuntime({
    getSupabaseClient: () => createSupabase(calls),
    handlePostLoginMultiAccount: async () => ({ frozen: true, groupId: 'group-1' }),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    recordSignalHistory: async (payload) => calls.push(['history', payload]),
  });

  const result = await runtime.recordLoginRuntimeState({
    user: {
      _id: 'user-1',
      lastIp: 'old-ip',
      lastDeviceId: 'old-device',
      lastFingerprint: 'old-fp',
    },
    userRow: {
      data: {
        lastWeakFingerprint: 'old-weak',
        lastProfileKey: 'old-profile',
        lastClientProfile: { old: true },
        lastIpIntel: { old: 'intel' },
      },
    },
    client: {},
    loginSignalContext: { signals: {} },
    loginIpIntel: null,
  });

  assert.deepEqual(result.multiAccountResult, { frozen: true, groupId: 'group-1' });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].last_ip, 'old-ip');
  assert.equal(updateCall[2].last_device_id, 'old-device');
  assert.equal(updateCall[2].last_fingerprint, 'old-fp');
  assert.equal(updateCall[2].data.lastWeakFingerprint, 'old-weak');
  assert.equal(updateCall[2].data.lastProfileKey, 'old-profile');
  assert.deepEqual(updateCall[2].data.lastClientProfile, { old: true });
  assert.deepEqual(updateCall[2].data.lastIpIntel, { old: 'intel' });
});
