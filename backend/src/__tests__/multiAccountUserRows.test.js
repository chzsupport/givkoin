const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getUserData,
  normalizeUserRow,
  toId,
  uniqueUsers,
} = require('../services/multiAccount/userRows');

test('multi-account user rows normalize nested ids', () => {
  assert.equal(toId('user-1'), 'user-1');
  assert.equal(toId({ _id: { value: 42 } }), '42');
  assert.equal(toId({ toString: () => 'custom-id' }), 'custom-id');
  assert.equal(toId({}), '');
});

test('multi-account user rows read data object safely', () => {
  assert.deepEqual(getUserData({ data: { k: 10 } }), { k: 10 });
  assert.deepEqual(getUserData({ data: null }), {});
});

test('multi-account user rows normalize database row without changing public keys', () => {
  const row = normalizeUserRow({
    id: 'user-1',
    email: '',
    nickname: 'Nick',
    role: 'user',
    status: '',
    email_confirmed: false,
    access_restricted_until: '2026-05-25T00:00:00.000Z',
    last_ip: '10.0.0.1',
    last_device_id: 'device-1',
    last_fingerprint: 'finger-1',
    data: {
      email: 'user@example.com',
      status: 'active',
      lastWeakFingerprint: 'weak-1',
      lastProfileKey: 'profile-1',
      lastClientProfile: { platform: 'Win32' },
      lastIpIntel: { isVpn: true },
    },
  });

  assert.equal(row._id, 'user-1');
  assert.equal(row.id, 'user-1');
  assert.equal(row.email, 'user@example.com');
  assert.equal(row.nickname, 'Nick');
  assert.equal(row.status, 'active');
  assert.equal(row.emailConfirmed, false);
  assert.equal(row.accessRestrictedUntil, '2026-05-25T00:00:00.000Z');
  assert.equal(row.lastIp, '10.0.0.1');
  assert.equal(row.lastDeviceId, 'device-1');
  assert.equal(row.lastFingerprint, 'finger-1');
  assert.equal(row.lastWeakFingerprint, 'weak-1');
  assert.equal(row.lastProfileKey, 'profile-1');
  assert.equal(row.lastClientProfile.platform, 'Win32');
  assert.deepEqual(row.lastIpIntel, { isVpn: true });
});

test('multi-account user rows keep last duplicate user', () => {
  assert.deepEqual(uniqueUsers([
    { _id: 'user-1', value: 'first' },
    { id: 'user-2', value: 'second' },
    { _id: 'user-1', value: 'last' },
    { value: 'ignored' },
  ]), [
    { _id: 'user-1', value: 'last' },
    { id: 'user-2', value: 'second' },
  ]);
});
