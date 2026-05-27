const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsViewService } = require('../services/news/newsViewService');
const { buildNewsViewBucketId, getNewsViewDateKey } = require('../services/news/newsCommon');

function uniqueIds(values, limit = 500) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))).slice(0, limit);
}

test('news view service saves only allowed unseen posts and last read marker', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const dateKey = getNewsViewDateKey(now);
  const activityCalls = [];
  const writes = [];
  const service = createNewsViewService({
    findPublishedPostsByIds: async () => {
      throw new Error('allowed ids should skip published lookup');
    },
    getNewsViewBucketForUser: async (userId, dayKey) => {
      assert.equal(userId, 'u1');
      assert.equal(dayKey, dateKey);
      return {
        postIds: ['p1'],
        lastReadPostId: 'old',
        lastReadUpdatedAt: '2026-05-26T10:00:00.000Z',
      };
    },
    normalizeViewBucketPostIds: uniqueIds,
    recordActivity: async (payload) => {
      activityCalls.push(payload);
    },
    upsertModelDoc: async (model, id, doc) => {
      writes.push({ model, id, doc });
      return doc;
    },
    viewBucketLimit: 5,
  });

  const result = await service.saveViewsForUser({
    userId: 'u1',
    postIds: ['p1', 'p2', 'p3', 'p2'],
    lastReadPostId: 'p2',
    allowedPostIds: ['p1', 'p2'],
    now,
  });

  assert.deepEqual(result, { saved: 1, alreadyViewed: 1, lastReadPostId: 'p2' });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].model, 'NewsViewBucket');
  assert.equal(writes[0].id, buildNewsViewBucketId('u1', dateKey));
  assert.deepEqual(writes[0].doc.postIds, ['p1', 'p2']);
  assert.equal(writes[0].doc.lastReadPostId, 'p2');
  assert.equal(writes[0].doc.lastReadUpdatedAt, now.toISOString());
  assert.deepEqual(activityCalls, [{
    userId: 'u1',
    type: 'news_view',
    minutes: 0,
    meta: { postId: 'p2', dateKey },
    createdAt: now,
  }]);
});

test('news view service checks published posts when no signed allow-list is supplied', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const writes = [];
  const service = createNewsViewService({
    findPublishedPostsByIds: async (ids) => {
      assert.deepEqual(ids, ['p1', 'p2', 'p3']);
      return [{ _id: 'p2' }, { _id: 'p3' }];
    },
    getNewsViewBucketForUser: async () => ({ postIds: ['p2'] }),
    normalizeViewBucketPostIds: uniqueIds,
    recordActivity: async () => { },
    upsertModelDoc: async (model, id, doc) => {
      writes.push({ model, id, doc });
      return doc;
    },
    viewBucketLimit: 5,
  });

  const result = await service.saveViewsForUser({
    userId: 'u1',
    postIds: ['p1', 'p2'],
    lastReadPostId: 'p3',
    now,
  });

  assert.deepEqual(result, { saved: 0, alreadyViewed: 1, lastReadPostId: 'p3' });
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].doc.postIds, ['p2']);
  assert.equal(writes[0].doc.lastReadPostId, 'p3');
});

test('news view service returns empty result without user or requested posts', async () => {
  const service = createNewsViewService({
    findPublishedPostsByIds: async () => [],
    getNewsViewBucketForUser: async () => null,
    normalizeViewBucketPostIds: uniqueIds,
    recordActivity: async () => { },
    upsertModelDoc: async () => null,
  });

  assert.deepEqual(await service.saveViewsForUser({ userId: '', postIds: ['p1'] }), { saved: 0, alreadyViewed: 0 });
  assert.deepEqual(await service.saveViewsForUser({ userId: 'u1', postIds: [] }), { saved: 0, alreadyViewed: 0 });
});
