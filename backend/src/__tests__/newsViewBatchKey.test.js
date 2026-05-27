const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createNewsViewBatchKey,
  normalizeViewBucketPostIds,
  parseNewsViewBatchKey,
} = require('../services/news/newsViewBatchKey');

test('news view batch key roundtrips unique post ids for the same user', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const key = createNewsViewBatchKey({
    userId: { _id: 'user-1' },
    postIds: ['post-1', { id: 'post-2' }, 'post-1', null],
    now,
    secret: 'test-secret',
    ttlMs: 60000,
  });

  assert.deepEqual(parseNewsViewBatchKey(key, 'user-1', {
    nowMs: now.getTime() + 1000,
    secret: 'test-secret',
  }), ['post-1', 'post-2']);
});

test('news view batch key rejects wrong users expired keys and bad signatures', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const key = createNewsViewBatchKey({
    userId: 'user-1',
    postIds: ['post-1'],
    now,
    secret: 'test-secret',
    ttlMs: 1000,
  });

  assert.equal(parseNewsViewBatchKey(key, 'user-2', { nowMs: now.getTime(), secret: 'test-secret' }), null);
  assert.equal(parseNewsViewBatchKey(key, 'user-1', { nowMs: now.getTime() + 2000, secret: 'test-secret' }), null);
  assert.equal(parseNewsViewBatchKey(`${key}broken`, 'user-1', { nowMs: now.getTime(), secret: 'test-secret' }), null);
});

test('news view bucket ids keep unique newest ids inside the limit', () => {
  assert.deepEqual(normalizeViewBucketPostIds(['a', 'b', 'a', { id: 'c' }, 'd'], 3), ['b', 'c', 'd']);
});
