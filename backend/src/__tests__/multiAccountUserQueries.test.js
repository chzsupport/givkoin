const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMultiAccountUserQueries,
} = require('../services/multiAccount/userQueries');

function createSupabase(rows, calls) {
  return {
    from(table) {
      calls.push(['from', table]);
      const query = {
        select(value) {
          calls.push(['select', value]);
          return query;
        },
        range(from, to) {
          calls.push(['range', from, to]);
          return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
        },
        in(field, values) {
          calls.push(['in', field, values]);
          return Promise.resolve({
            data: rows.filter((row) => values.includes(String(row.id))),
            error: null,
          });
        },
      };
      return query;
    },
  };
}

test('multi-account user queries read raw user pages with clamped range', async () => {
  const calls = [];
  const queries = createMultiAccountUserQueries({
    getSupabaseClient: () => createSupabase([
      { id: 'user-1' },
      { id: 'user-2' },
      { id: 'user-3' },
    ], calls),
  });

  assert.deepEqual(await queries.listUsersPage({ from: -10, limit: 2 }), [
    { id: 'user-1' },
    { id: 'user-2' },
  ]);
  assert.deepEqual(calls.find((row) => row[0] === 'range'), ['range', 0, 1]);
});

test('multi-account user queries load detailed users by unique ids', async () => {
  const calls = [];
  const queries = createMultiAccountUserQueries({
    getSupabaseClient: () => createSupabase([
      {
        id: 'user-1',
        email: 'one@example.com',
        role: 'user',
        email_confirmed: true,
        data: { lastWeakFingerprint: 'weak-1' },
      },
      {
        id: 'user-2',
        email: 'two@example.com',
        role: 'user',
        data: {},
      },
    ], calls),
  });

  const rows = await queries.getUsersByIdsDetailed(['user-1', 'user-1', '', 'user-2']);
  assert.deepEqual(rows.map((row) => row._id), ['user-1', 'user-2']);
  assert.equal(rows[0].emailConfirmed, true);
  assert.equal(rows[0].lastWeakFingerprint, 'weak-1');
  assert.deepEqual(calls.find((row) => row[0] === 'in'), ['in', 'id', ['user-1', 'user-2']]);

  const map = await queries.getUserMapByIds(['user-2']);
  assert.equal(map.get('user-2').email, 'two@example.com');
});

test('multi-account user queries find matching users by signals and keep filters', async () => {
  const calls = [];
  const queries = createMultiAccountUserQueries({
    getSupabaseClient: () => createSupabase([
      {
        id: 'user-1',
        email: 'self@example.com',
        role: 'user',
        last_ip: '10.0.0.1',
        data: {},
      },
      {
        id: 'user-2',
        email: 'two@example.com',
        role: 'user',
        last_ip: '',
        data: { lastWeakFingerprint: 'weak-1' },
      },
      {
        id: 'user-3',
        email: 'n.a.m.e+alias@gmail.com',
        role: 'user',
        data: {},
      },
      {
        id: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
        last_ip: '10.0.0.1',
        data: {},
      },
      {
        id: 'user-4',
        email: 'four@example.com',
        role: 'user',
        data: {},
      },
    ], calls),
  });

  const rows = await queries.findUsersBySignals({
    ip: '10.0.0.1',
    weakFingerprint: 'weak-1',
    emailNormalized: 'name@gmail.com',
  }, {
    excludeUserId: 'user-1',
    limit: 10,
  });

  assert.deepEqual(rows.map((row) => row._id), ['user-2', 'user-3']);

  const withAdmins = await queries.findUsersBySignals({
    ip: '10.0.0.1',
  }, {
    excludeUserId: 'user-1',
    roles: [],
  });

  assert.deepEqual(withAdmins.map((row) => row._id), ['admin-1']);
});

test('multi-account user queries return empty list without usable signals', async () => {
  const calls = [];
  const queries = createMultiAccountUserQueries({
    getSupabaseClient: () => createSupabase([{ id: 'user-1' }], calls),
  });

  assert.deepEqual(await queries.findUsersBySignals({}), []);
  assert.deepEqual(calls, []);
});
