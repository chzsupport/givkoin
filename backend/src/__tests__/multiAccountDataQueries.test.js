const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createMultiAccountDataQueries,
} = require('../services/multiAccount/dataQueries');

function createQuery(rows, calls) {
  const query = {
    select(value) { calls.push(['select', value]); return query; },
    in(field, value) { calls.push(['in', field, value]); return query; },
    eq(field, value) { calls.push(['eq', field, value]); return query; },
    order(field, options) { calls.push(['order', field, options]); return query; },
    range(from, to) { calls.push(['range', from, to]); return query; },
    limit(value) { calls.push(['limit', value]); return query; },
    gte(field, value) { calls.push(['gte', field, value]); return query; },
    or(value) { calls.push(['or', value]); return query; },
    then(resolve, reject) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return query;
}

function createSupabase(rowsByTable, calls) {
  return {
    from(table) {
      calls.push(['from', table]);
      return createQuery(rowsByTable[table] || [], calls);
    },
  };
}

test('multi-account data queries normalize user sessions', async () => {
  const calls = [];
  const queries = createMultiAccountDataQueries({
    getSupabaseClient: () => createSupabase({
      user_sessions: [{
        user_id: ' user-1 ',
        session_id: ' session-1 ',
        ip: '10.0.0.1',
        device_id: 'device-1',
        fingerprint: 'finger-1',
        meta: {
          weakFingerprint: 'weak-1',
          profileKey: 'profile-1',
          clientProfile: {
            platform: 'Win32',
            languages: ['ru', 'ru', 'en'],
            screen: { width: 1920, height: 1080 },
          },
        },
        started_at: '2026-05-25T10:00:00.000Z',
        last_seen_at: '2026-05-25T10:05:00.000Z',
        ended_at: null,
        is_active: true,
        revoked_at: null,
        revoke_reason: '',
      }],
    }, calls),
  });

  const rows = await queries.listUserSessionsByUserIds(['user-1', '', 'user-1'], {
    since: '2026-05-25T00:00:00.000Z',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].userId, 'user-1');
  assert.equal(rows[0].sessionId, 'session-1');
  assert.equal(rows[0].clientProfile.platform, 'Win32');
  assert.deepEqual(rows[0].clientProfile.languages, ['ru', 'en']);
  assert.equal(rows[0].isActive, true);
  assert.equal(calls.some((row) => row[0] === 'or' && row[1].includes('started_at.gte.2026-05-25T00:00:00.000Z')), true);
});

test('multi-account data queries read battle documents by page', async () => {
  const calls = [];
  const queries = createMultiAccountDataQueries({
    listDocsByModel: async (model, options) => {
      calls.push([model, options]);
      return [{
        _id: 'battle-1',
        status: 'finished',
        createdAt: '',
        updatedAt: '2026-05-25T10:00:00.000Z',
      }];
    },
  });

  const rows = await queries.listBattleDocsSince('2026-05-25T00:00:00.000Z');

  assert.equal(rows[0]._id, 'battle-1');
  assert.equal(rows[0].createdAt, null);
  assert.equal(rows[0].updatedAt, '2026-05-25T10:00:00.000Z');
  assert.deepEqual(calls[0], ['Battle', {
    columnGte: { updated_at: '2026-05-25T00:00:00.000Z' },
    limit: 500,
    offset: 0,
  }]);
});

test('multi-account data queries normalize rewards, shares, and signal history', async () => {
  const calls = [];
  const queries = createMultiAccountDataQueries({
    getSupabaseClient: () => createSupabase({
      transactions: [{
        id: 'tx-1',
        user_id: 'user-1',
        related_entity: 'battle-1',
        amount: '12.3456',
        currency: 'K',
        description: 'reward',
        occurred_at: null,
        created_at: '2026-05-25T10:00:00.000Z',
      }],
      activity_logs: [{
        user_id: 'user-1',
        meta: { recipientId: 'user-2', amountLm: '7.1234' },
        created_at: '2026-05-25T11:00:00.000Z',
      }],
      auth_signal_history: [{
        id: 'signal-1',
        user_id: 'user-1',
        ip: '10.0.0.1',
        device_id: 'device-1',
        fingerprint: 'finger-1',
        weak_fingerprint: 'weak-1',
        user_agent: 'agent',
        ip_intel: { isVpn: true },
        meta: {
          profileKey: 'profile-1',
          clientProfile: { platform: 'Win32', screen: { width: 1 } },
        },
        created_at: '2026-05-25T12:00:00.000Z',
      }],
    }, calls),
  });

  const rewards = await queries.listBattleRewardTransactionsByUserIds(['user-1'], {
    since: '2026-05-25T00:00:00.000Z',
  });
  const shares = await queries.listSolarShareActivitiesByUserIds(['user-1']);
  const history = await queries.listSignalHistoryByIps(['10.0.0.1']);

  assert.deepEqual(rewards[0], {
    id: 'tx-1',
    userId: 'user-1',
    battleId: 'battle-1',
    amount: 12.346,
    currency: 'K',
    description: 'reward',
    occurredAt: '2026-05-25T10:00:00.000Z',
  });
  assert.deepEqual(shares[0], {
    userId: 'user-1',
    recipientId: 'user-2',
    amountLm: 7.123,
    createdAt: '2026-05-25T11:00:00.000Z',
  });
  assert.equal(history[0].id, 'signal-1');
  assert.equal(history[0].clientProfile.platform, 'Win32');
  assert.deepEqual(history[0].ipIntel, { isVpn: true });
  assert.equal(calls.some((row) => row[0] === 'eq' && row[1] === 'type' && row[2] === 'battle'), true);
  assert.equal(calls.some((row) => row[0] === 'eq' && row[1] === 'type' && row[2] === 'solar_share'), true);
});
