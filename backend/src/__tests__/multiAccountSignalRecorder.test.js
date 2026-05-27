const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSignalRecorder,
} = require('../services/multiAccount/signalRecorder');

test('multi-account signal recorder skips incomplete records', async () => {
  const calls = [];
  const recorder = createSignalRecorder({
    createSignalHistoryEntry: async (payload) => calls.push(payload),
  });

  assert.equal(await recorder.recordSignalHistory({ userId: '', eventType: 'login' }), null);
  assert.equal(await recorder.recordSignalHistory({ userId: 'user-1', eventType: '' }), null);
  assert.deepEqual(calls, []);
});

test('multi-account signal recorder normalizes signals and keeps client profile in meta', async () => {
  const calls = [];
  const recorder = createSignalRecorder({
    createSignalHistoryEntry: async (payload) => {
      calls.push(payload);
      return { ok: true };
    },
  });

  const result = await recorder.recordSignalHistory({
    userId: 'user-1',
    eventType: 'login',
    signals: {
      ip: ' 10.0.0.1 ',
      deviceId: ' Device-1 ',
      fingerprint: ' Finger-1 ',
      weakFingerprint: ' Weak-1 ',
      profileKey: ' Profile-1 ',
      email: 'User.Name+test@gmail.com',
      clientProfile: {
        platform: 'Win32',
        languages: ['ru', 'ru', 'en'],
        screen: { width: 1920, height: 1080 },
      },
    },
    ipIntel: { isVpn: true },
    meta: { source: 'auth' },
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].userId, 'user-1');
  assert.equal(calls[0].eventType, 'login');
  assert.equal(calls[0].signals.ip, '10.0.0.1');
  assert.equal(calls[0].signals.deviceId, 'device-1');
  assert.equal(calls[0].signals.emailNormalized, 'username@gmail.com');
  assert.deepEqual(calls[0].ipIntel, { isVpn: true });
  assert.equal(calls[0].meta.source, 'auth');
  assert.equal(calls[0].meta.profileKey, 'profile-1');
  assert.equal(calls[0].meta.clientProfile.platform, 'Win32');
  assert.deepEqual(calls[0].meta.clientProfile.languages, ['ru', 'en']);
});
