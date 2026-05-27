const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyCommentUserNicknames,
  buildCommentNicknameMap,
  createNewsUserStore,
} = require('../services/news/newsUserStore');

function createSupabaseStub({ users = [], updateResult = null } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      from(table) {
        const query = {
          select(fields) {
            calls.push(['select', table, fields]);
            return query;
          },
          eq(field, value) {
            calls.push(['eq', field, value]);
            query.eqValue = value;
            return query;
          },
          in(field, values) {
            calls.push(['in', field, values]);
            query.inValues = values;
            return Promise.resolve({ data: users.filter((row) => values.includes(row.id)), error: null });
          },
          update(payload) {
            calls.push(['update', table, payload]);
            query.updatePayload = payload;
            query.isUpdate = true;
            return query;
          },
          maybeSingle() {
            const found = users.find((row) => row.id === query.eqValue) || null;
            return Promise.resolve({ data: query.isUpdate ? (updateResult || found) : found, error: null });
          },
        };
        return query;
      },
    },
  };
}

test('news user store maps comment nicknames from row nickname or data fallback', () => {
  const rows = [
    { id: 'u1', nickname: 'Ada', data: {} },
    { id: 'u2', data: { nickname: 'Grace' } },
  ];
  const nickById = buildCommentNicknameMap(rows);
  assert.equal(nickById.get('u1'), 'Ada');
  assert.equal(nickById.get('u2'), 'Grace');

  const comments = [{ user: 'u1' }, { user: { id: 'u2' } }, { user: null }];
  assert.deepEqual(applyCommentUserNicknames(comments, rows), [
    { user: { _id: 'u1', nickname: 'Ada' } },
    { user: { _id: 'u2', nickname: 'Grace' } },
    { user: null },
  ]);
});

test('news user store reads and updates user data through old query shape', async () => {
  const stub = createSupabaseStub({
    users: [{ id: 'u1', nickname: 'Ada', email: 'a@test.test', data: { k: 1 } }],
    updateResult: { id: 'u1', data: { k: 1, achievementStats: { totalNewsLikes: 1 } } },
  });
  const store = createNewsUserStore({ getSupabaseClient: () => stub.client });

  assert.deepEqual(await store.getUserRowById({ _id: 'u1' }), {
    id: 'u1',
    nickname: 'Ada',
    email: 'a@test.test',
    data: { k: 1 },
  });
  assert.deepEqual(await store.updateUserDataById('u1', { achievementStats: { totalNewsLikes: 1 } }), {
    id: 'u1',
    data: { k: 1, achievementStats: { totalNewsLikes: 1 } },
  });
  assert.equal(stub.calls.some((call) => call[0] === 'update' && call[1] === 'users'), true);
});

test('news user store hydrates comment users from unique ids', async () => {
  const stub = createSupabaseStub({
    users: [
      { id: 'u1', nickname: 'Ada', data: {} },
      { id: 'u2', nickname: '', data: { nickname: 'Grace' } },
    ],
  });
  const store = createNewsUserStore({ getSupabaseClient: () => stub.client });
  const comments = [{ user: 'u1' }, { user: { _id: 'u2' } }, { user: 'u1' }];

  assert.deepEqual(await store.hydrateCommentUsers(comments), [
    { user: { _id: 'u1', nickname: 'Ada' } },
    { user: { _id: 'u2', nickname: 'Grace' } },
    { user: { _id: 'u1', nickname: 'Ada' } },
  ]);
  assert.deepEqual(stub.calls.find((call) => call[0] === 'in'), ['in', 'id', ['u1', 'u2']]);
});
