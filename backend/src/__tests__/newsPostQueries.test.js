const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsPostQueries } = require('../services/news/newsPostQueries');

test('news post queries list posts by status sorted newest first', async () => {
  const queries = createNewsPostQueries({
    feedLimit: 100,
    listModelDocs: async () => [
      { _id: 'old', status: 'published', publishedAt: '2026-05-26T10:00:00.000Z', stats: { likes: '1' } },
      { _id: 'draft', status: 'draft', publishedAt: '2026-05-28T10:00:00.000Z' },
      { _id: 'new', status: 'published', publishedAt: '2026-05-27T10:00:00.000Z', stats: { comments: '2' } },
    ],
    listDocsByModel: async () => [],
  });

  assert.deepEqual(await queries.listNewsPosts({ status: 'published', limit: 1 }), [
    { _id: 'new', status: 'published', publishedAt: '2026-05-27T10:00:00.000Z', stats: { likes: 0, comments: 2, reposts: 0 } },
  ]);
});

test('news post queries find published posts by unique ids', async () => {
  let capturedQuery = null;
  const queries = createNewsPostQueries({
    feedLimit: 100,
    listModelDocs: async () => [],
    listDocsByModel: async (_model, query) => {
      capturedQuery = query;
      return [{ _id: 'p1', stats: { reposts: '3' } }];
    },
  });

  assert.deepEqual(await queries.findPublishedPostsByIds(['p1', { _id: 'p2' }, 'p1']), [
    { _id: 'p1', stats: { likes: 0, comments: 0, reposts: 3 } },
  ]);
  assert.deepEqual(capturedQuery, {
    ids: ['p1', 'p2'],
    dataEq: { status: 'published' },
    limit: 2,
  });
});

test('news post queries load posts with all status by default', async () => {
  const queries = createNewsPostQueries({
    feedLimit: 100,
    listModelDocs: async () => [
      { _id: 'p1', status: 'draft', createdAt: '2026-05-27T10:00:00.000Z' },
    ],
    listDocsByModel: async () => [],
  });

  assert.equal((await queries.loadPostsWithStats()).length, 1);
});
