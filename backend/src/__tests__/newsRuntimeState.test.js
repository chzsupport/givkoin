const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsRuntimeState } = require('../services/news/newsRuntimeState');

test('news runtime state caches categories until ttl expires', async () => {
  let calls = 0;
  const runtime = createNewsRuntimeState({ categoriesTtlMs: 1000, feedTtlMs: 1000, scheduledPublishSweepIntervalMs: 1000 });

  const first = await runtime.loadNewsCategories(async () => {
    calls += 1;
    return ['a'];
  }, 1000);
  const second = await runtime.loadNewsCategories(async () => {
    calls += 1;
    return ['b'];
  }, 1500);
  const third = await runtime.loadNewsCategories(async () => {
    calls += 1;
    return ['c'];
  }, 2501);

  assert.deepEqual(first, ['a']);
  assert.deepEqual(second, ['a']);
  assert.deepEqual(third, ['c']);
  assert.equal(calls, 2);
});

test('news runtime state invalidates feed and updates cached feed items', async () => {
  const cleared = [];
  const runtime = createNewsRuntimeState({
    categoriesTtlMs: 1000,
    feedTtlMs: 1000,
    scheduledPublishSweepIntervalMs: 1000,
    clearPageCacheByPrefix: (prefix) => cleared.push(prefix),
  });

  await runtime.loadNewsFeed(async () => [{ _id: 'p1', likes: 0 }], 1000);
  runtime.updateCachedNewsFeed((post) => ({ ...post, likes: post.likes + 1 }));
  assert.deepEqual(runtime.getCachedNewsFeed(1001), [{ _id: 'p1', likes: 1 }]);

  runtime.invalidateNewsFeedRuntimeState();
  assert.equal(runtime.getCachedNewsFeed(1002), null);
  assert.deepEqual(cleared, ['news:posts:']);
});

test('news runtime state throttles scheduled publish sweep and resets after failure', async () => {
  const runtime = createNewsRuntimeState({ categoriesTtlMs: 1000, feedTtlMs: 1000, scheduledPublishSweepIntervalMs: 1000 });

  assert.deepEqual(await runtime.runScheduledNewsPublishSweep(async () => ({ modifiedCount: 1 }), new Date(1000)), { modifiedCount: 1 });
  assert.equal(await runtime.runScheduledNewsPublishSweep(async () => ({ modifiedCount: 2 }), new Date(1500)), null);

  await assert.rejects(
    runtime.runScheduledNewsPublishSweep(async () => {
      throw new Error('boom');
    }, new Date(2501)),
    /boom/
  );
  assert.deepEqual(await runtime.runScheduledNewsPublishSweep(async () => ({ modifiedCount: 3 }), new Date(2600)), { modifiedCount: 3 });
});
