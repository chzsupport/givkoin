const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthProfileUpdate } = require('../services/auth/authProfileUpdate');

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

test('auth profile update writes changed fields and returns safe user', async () => {
  const calls = [];
  const rows = [
    {
      id: 'user-1',
      email: 'user@example.com',
      data: {
        gender: 'male',
        k: 10,
      },
    },
    {
      id: 'user-1',
      email: 'user@example.com',
      data: {
        gender: 'female',
        birthDate: '2000-01-01',
        preferredAgeFrom: 25,
        k: 10,
      },
    },
  ];
  const profile = createAuthProfileUpdate({
    getSupabaseClient: () => createSupabase(calls),
    getUserRowById: async () => rows.shift() || null,
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  const result = await profile.updateAuthProfile({
    userId: 'user-1',
    gender: 'female',
    birthDate: '2000-01-01',
    preferredAgeFrom: 25,
    language: 'en',
  });

  assert.equal(result.ok, true);
  assert.equal(result.user.id, 'user-1');
  assert.equal(result.user.gender, 'female');
  assert.equal(result.user.k, 10);

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[1], 'users');
  assert.equal(updateCall[2].updated_at, '2026-05-26T12:00:00.000Z');
  assert.equal(updateCall[2].language, 'en');
  assert.equal(updateCall[2].data.gender, 'female');
  assert.equal(updateCall[2].data.birthDate, '2000-01-01');
  assert.equal(updateCall[2].data.preferredAgeFrom, 25);
  assert.equal(updateCall[2].data.k, 10);
});

test('auth profile update keeps explicit zero-like age values', async () => {
  const calls = [];
  const profile = createAuthProfileUpdate({
    getSupabaseClient: () => createSupabase(calls),
    getUserRowById: async () => ({ id: 'user-1', data: {} }),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  await profile.updateAuthProfile({
    userId: 'user-1',
    preferredAgeFrom: 0,
    preferredAgeTo: 0,
  });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].data.preferredAgeFrom, 0);
  assert.equal(updateCall[2].data.preferredAgeTo, 0);
  assert.equal(Object.hasOwn(updateCall[2], 'language'), false);
});

test('auth profile update returns not found without writes', async () => {
  const calls = [];
  const profile = createAuthProfileUpdate({
    getSupabaseClient: () => createSupabase(calls),
    getUserRowById: async () => null,
  });

  assert.deepEqual(await profile.updateAuthProfile({
    userId: 'missing',
    gender: 'female',
  }), {
    ok: false,
    reason: 'not_found',
  });
  assert.deepEqual(calls, []);
});
