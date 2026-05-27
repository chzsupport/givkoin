const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthUserStore } = require('../services/auth/authUserStore');

function createSupabase(rowsByTable, calls) {
  return {
    from(table) {
      const state = { table, filters: [] };
      calls.push(['from', table]);

      const query = {
        select(value) {
          calls.push(['select', table, value]);
          return query;
        },
        eq(field, value) {
          state.filters.push([field, value]);
          calls.push(['eq', table, field, value]);
          return query;
        },
        async maybeSingle() {
          const rows = rowsByTable[table] || [];
          const row = rows.find((item) => state.filters.every(([field, value]) => (
            String(item[field]) === String(value)
          )));
          return { data: row || null, error: null };
        },
      };

      return query;
    },
  };
}

test('auth user store reads user row by id', async () => {
  const calls = [];
  const store = createAuthUserStore({
    getSupabaseClient: () => createSupabase({
      users: [{ id: 'user-1', email: 'user@example.com' }],
    }, calls),
    getMoodDiagnosticsForUser: async () => null,
  });

  assert.deepEqual(await store.getUserRowById('user-1'), {
    id: 'user-1',
    email: 'user@example.com',
  });
  assert.deepEqual(calls.find((row) => row[0] === 'eq'), ['eq', 'users', 'id', 'user-1']);
});

test('auth user store maps entity and applies mood diagnostics', async () => {
  const store = createAuthUserStore({
    getSupabaseClient: () => createSupabase({
      entities: [{
        user_id: 'user-1',
        id: 'entity-1',
        name: 'Light',
        avatar_url: '/entity.png',
        stage: 2,
        mood: 'neutral',
        satiety_until: '2026-05-03T00:00:00.000Z',
        created_at: '2026-05-01T00:00:00.000Z',
      }],
    }, []),
    getMoodDiagnosticsForUser: async () => ({ mood: 'happy' }),
  });

  assert.deepEqual(await store.getAuthUserEntity('user-1'), {
    _id: 'entity-1',
    id: 'entity-1',
    name: 'Light',
    avatarUrl: '/entity.png',
    stage: 2,
    mood: 'happy',
    satietyUntil: '2026-05-03T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
  });
});

test('auth user store builds safe user with entity', async () => {
  const store = createAuthUserStore({
    getSupabaseClient: () => createSupabase({
      entities: [{
        user_id: 'user-1',
        id: 'entity-1',
        name: 'Light',
      }],
    }, []),
    getMoodDiagnosticsForUser: async () => null,
  });

  const user = await store.buildSafeUserWithEntity({
    id: 'user-1',
    email: 'user@example.com',
    email_confirmed: true,
    data: { k: 10 },
  });

  assert.equal(user.id, 'user-1');
  assert.equal(user.k, 10);
  assert.equal(user.entity.id, 'entity-1');
});
