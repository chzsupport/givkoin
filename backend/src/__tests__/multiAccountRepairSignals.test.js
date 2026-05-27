const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendRepairNote,
  buildSignalsFromUserState,
  sameStringArray,
  sanitizeStoredMultiAccountSignals,
} = require('../services/multiAccount/repairSignals');

test('multi-account repair signals append repair note once', () => {
  const first = appendRepairNote('old note', 'repair_tag', '2026-05-25T00:00:00.000Z');
  const second = appendRepairNote(first, 'repair_tag', '2026-05-25T01:00:00.000Z');

  assert.equal(first, 'old note\n[2026-05-25T00:00:00.000Z] repair_tag');
  assert.equal(second, first);
});

test('multi-account repair signals compare arrays as unique trimmed strings', () => {
  assert.equal(sameStringArray([' b ', 'a', 'a'], ['a', 'b']), true);
  assert.equal(sameStringArray(['a'], ['a', 'b']), false);
});

test('multi-account repair signals rebuild current signals from user and data fallback', () => {
  const signals = buildSignalsFromUserState({
    email: 'User.Name+tag@gmail.com',
    lastIp: ' 10.0.0.1 ',
    data: {
      lastDeviceId: 'Device-1',
      lastFingerprint: 'Finger-1',
      lastWeakFingerprint: 'Weak-1',
      lastProfileKey: 'Profile-1',
      lastClientProfile: { platform: 'Win32' },
      lastIpIntel: { isVpn: true },
    },
  });

  assert.equal(signals.ip, '10.0.0.1');
  assert.equal(signals.deviceId, 'device-1');
  assert.equal(signals.fingerprint, 'finger-1');
  assert.equal(signals.weakFingerprint, 'weak-1');
  assert.equal(signals.profileKey, 'profile-1');
  assert.equal(signals.emailNormalized, 'username@gmail.com');
  assert.deepEqual(signals.ipIntel, { isVpn: true });
});

test('multi-account repair signals remove stale stored signals without evidence', () => {
  const signals = sanitizeStoredMultiAccountSignals([
    'shared_device_id',
    'shared_device:device-1',
    'shared_fingerprint',
    'shared_fingerprint:finger-1',
    'shared_profile_key',
    'shared_weak_fingerprint',
    'shared_weak_fingerprint:weak-1',
    'shared_ip',
    'email_normalized_collision',
    'network_vpn',
  ], [
    { type: 'device' },
    { type: 'weak_fingerprint' },
  ], {
    _id: 'user-1',
    email: 'user@gmail.com',
  }, [
    { _id: 'user-2', email: 'other@gmail.com' },
  ]);

  assert.deepEqual(signals, [
    'shared_device_id',
    'shared_device:device-1',
    'shared_weak_fingerprint',
    'shared_weak_fingerprint:weak-1',
    'network_vpn',
  ]);
});

test('multi-account repair signals keep email signal when group email still matches', () => {
  const signals = sanitizeStoredMultiAccountSignals([
    'email_normalized_collision',
  ], [], {
    _id: 'user-1',
    email: 'User.Name+tag@gmail.com',
  }, [
    { _id: 'user-2', email: 'username@gmail.com' },
  ]);

  assert.deepEqual(signals, ['email_normalized_collision']);
});
