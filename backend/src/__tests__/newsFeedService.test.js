const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsFeedService } = require('../services/news/newsFeedService');
const { paginateFeedPosts } = require('../services/news/newsPostFormatting');

function createBaseDeps(overrides = {}) {
  const calls = [];
  const deps = {
    createNewsViewBatchKey: ({ postIds }) => {
      calls.push(['viewBatchKey', postIds]);
      return `key:${postIds.join(',')}`;
    },
    getNewsUserCard: async ({ userId }) => {
      calls.push(['newsCard', userId]);
      return { dailyLikesLeft: 10 };
    },
    getOrLoadPage: async (key, loader) => {
      calls.push(['cache', key]);
      return { value: await loader() };
    },
    listNewsPosts: async (query) => {
      calls.push(['listNewsPosts', query]);
      return [];
    },
    loadPublishedPosts: async () => {
      calls.push(['loadPublishedPosts']);
      return [
        { _id: 'p1', stats: { likes: 2 } },
        { _id: 'p2' },
      ];
    },
    makePageCacheKey: (prefix, payload) => `${prefix}:${JSON.stringify(payload)}`,
    maybePublishScheduledPosts: async () => calls.push(['publishScheduled']),
    paginateFeedPosts: (posts, { limit, cursor }) => paginateFeedPosts(posts, {
      cursor,
      defaultLimit: 5,
      limit,
      maxLimit: 25,
    }),
    warmPage: (key) => calls.push(['warmPage', key]),
    ...overrides,
  };
  return {
    calls,
    service: createNewsFeedService(deps),
  };
}

test('news feed service lists published posts with card view key and warmed next page', async () => {
  const { calls, service } = createBaseDeps();

  const result = await service.listPostsPage({
    status: 'published',
    limit: 1,
    userId: 'u1',
    now: new Date('2026-05-27T10:00:00.000Z'),
  });

  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].stats, { likes: 2, comments: 0, reposts: 0 });
  assert.equal(result.nextCursor, 'p1');
  assert.equal(result.hasMore, true);
  assert.equal(result.viewBatchKey, 'key:p1');
  assert.deepEqual(result.newsCard, { dailyLikesLeft: 10 });
  assert.equal(calls.some((call) => call[0] === 'loadPublishedPosts'), true);
  assert.equal(calls.some((call) => call[0] === 'warmPage'), true);
});

test('news feed service keeps all status publish sweep before listing posts', async () => {
  const { calls, service } = createBaseDeps({
    listNewsPosts: async (query) => {
      calls.push(['listNewsPosts', query]);
      return [{ _id: 'p1', status: 'draft' }];
    },
  });

  const result = await service.listPostsPage({
    status: 'all',
    limit: 5,
    userId: 'u1',
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.viewBatchKey, null);
  assert.deepEqual(calls.slice(1, 3), [
    ['publishScheduled'],
    ['listNewsPosts', { status: 'all' }],
  ]);
});

test('news feed service returns empty page and null card on card failure', async () => {
  const { service } = createBaseDeps({
    getNewsUserCard: async () => {
      throw new Error('card failed');
    },
    loadPublishedPosts: async () => [],
  });

  const result = await service.listPostsPage({
    status: 'published',
    limit: 5,
    userId: 'u1',
  });

  assert.deepEqual(result, {
    items: [],
    nextCursor: null,
    hasMore: false,
    viewBatchKey: null,
    newsCard: null,
  });
});
