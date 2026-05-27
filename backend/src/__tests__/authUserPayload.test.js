const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSafeUserFromRow,
  mapEntityRowToAuthUser,
} = require('../services/auth/authUserPayload');

test('auth user payload keeps old user response fields', () => {
  const row = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    nickname: 'Vityaz',
    status: 'active',
    email_confirmed: true,
    email_confirmed_at: '2026-05-01T00:00:00.000Z',
    access_restricted_until: null,
    access_restriction_reason: null,
    language: 'ru',
    last_seen_at: '2026-05-02T00:00:00.000Z',
    last_online_at: '2026-05-02T01:00:00.000Z',
    last_ip: '127.0.0.1',
    last_device_id: 'device-1',
    last_fingerprint: 'fingerprint-1',
    created_at: '2026-05-01T00:00:00.000Z',
    updated_at: '2026-05-02T00:00:00.000Z',
    data: {
      k: 12,
      lumens: 34,
      lastProfileKey: 'profile-1',
      lastClientProfile: { timezone: 'Asia/Qyzylorda' },
    },
  };

  assert.deepEqual(buildSafeUserFromRow(row), {
    k: 12,
    lumens: 34,
    lastProfileKey: 'profile-1',
    lastClientProfile: { timezone: 'Asia/Qyzylorda' },
    _id: 'user-1',
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    nickname: 'Vityaz',
    status: 'active',
    emailConfirmed: true,
    emailConfirmedAt: '2026-05-01T00:00:00.000Z',
    accessRestrictedUntil: null,
    accessRestrictionReason: null,
    language: 'ru',
    lastSeenAt: '2026-05-02T00:00:00.000Z',
    lastOnlineAt: '2026-05-02T01:00:00.000Z',
    lastIp: '127.0.0.1',
    lastDeviceId: 'device-1',
    lastFingerprint: 'fingerprint-1',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-02T00:00:00.000Z',
  });
});

test('auth user payload maps entity row for auth response', () => {
  assert.deepEqual(mapEntityRowToAuthUser({
    id: 'entity-1',
    name: 'Light',
    avatar_url: '/entity.png',
    stage: 2,
    mood: 'happy',
    satiety_until: '2026-05-03T00:00:00.000Z',
    created_at: '2026-05-01T00:00:00.000Z',
  }), {
    _id: 'entity-1',
    id: 'entity-1',
    name: 'Light',
    avatarUrl: '/entity.png',
    stage: 2,
    mood: 'happy',
    satietyUntil: '2026-05-03T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
  });

  assert.equal(buildSafeUserFromRow(null), null);
  assert.equal(mapEntityRowToAuthUser(null), null);
});
