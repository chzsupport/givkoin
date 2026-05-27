const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsCommentService } = require('../services/news/newsCommentService');

function createBaseDeps(overrides = {}) {
  const calls = [];
  const deps = {
    clearNewsCommentsCache: () => calls.push(['clearComments']),
    commentEditWindowMs: 60 * 60 * 1000,
    deleteModelDoc: async (model, id) => {
      calls.push(['delete', model, id]);
      return true;
    },
    getModelDocById: async (model, id) => {
      if (model === 'NewsPost') return { _id: id, status: 'published' };
      if (model === 'NewsInteraction') {
        return {
          _id: id,
          post: 'p1',
          type: 'comment',
          user: 'u1',
          content: 'old text',
          createdAt: new Date('2026-05-27T10:00:00.000Z'),
        };
      }
      return null;
    },
    getOrLoadPage: async (key, loader) => {
      calls.push(['getOrLoadPage', key]);
      return { value: await loader() };
    },
    hydrateCommentUsers: async (comments) => {
      calls.push(['hydrate', comments.length]);
      return comments;
    },
    incrementPostStats: async (postId, delta) => {
      calls.push(['stats', postId, delta]);
      return {};
    },
    listDocsByModelBeforeCursor: async () => [],
    makePageCacheKey: (prefix, payload) => `${prefix}:${JSON.stringify(payload)}`,
    updateCachedNewsFeedPostStats: (postId, delta) => calls.push(['cacheStats', postId, delta]),
    updateModelDoc: async (model, id, patch) => {
      calls.push(['update', model, id, patch]);
      return {
        _id: id,
        post: 'p1',
        type: 'comment',
        user: { _id: 'u1', nickname: 'Knight' },
        content: patch.content,
        createdAt: new Date('2026-05-27T10:00:00.000Z'),
        updatedAt: patch.updatedAt,
      };
    },
    warmPage: (key) => calls.push(['warmPage', key]),
    ...overrides,
  };
  return { calls, service: createNewsCommentService(deps) };
}

test('news comment service rejects missing or unpublished post', async () => {
  const { service } = createBaseDeps({
    getModelDocById: async () => ({ _id: 'p1', status: 'draft' }),
  });

  const result = await service.listCommentsForPost({
    postId: 'p1',
    limit: 5,
    userLang: 'ru',
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { message: 'Пост не найден или не опубликован' });
});

test('news comment service lists comments and warms next page', async () => {
  const rows = [
    {
      _id: 'c2',
      id: 'c2',
      post: 'p1',
      type: 'comment',
      content: 'second',
      createdAt: '2026-05-27T10:01:00.000Z',
      created_at: '2026-05-27T10:01:00.000Z',
      user: { _id: 'u2', nickname: 'Reader' },
    },
    {
      _id: 'c1',
      id: 'c1',
      post: 'p1',
      type: 'comment',
      content: 'first',
      createdAt: '2026-05-27T10:00:00.000Z',
      created_at: '2026-05-27T10:00:00.000Z',
      user: { _id: 'u1', nickname: 'Author' },
    },
  ];
  const { calls, service } = createBaseDeps({
    listDocsByModelBeforeCursor: async () => rows,
  });

  const result = await service.listCommentsForPost({
    postId: 'p1',
    limit: 1,
    userLang: 'ru',
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.comments.length, 1);
  assert.equal(result.body.comments[0].content, 'second');
  assert.equal(result.body.hasMore, true);
  assert.equal(typeof result.body.nextCursor, 'string');
  assert.equal(calls.some((call) => call[0] === 'hydrate' && call[1] === 1), true);
  assert.equal(calls.some((call) => call[0] === 'warmPage'), true);
});

test('news comment service rejects editing another user comment', async () => {
  const { service } = createBaseDeps({
    getModelDocById: async (model, id) => {
      if (model === 'NewsInteraction') {
        return {
          _id: id,
          post: 'p1',
          type: 'comment',
          user: 'other',
          createdAt: new Date('2026-05-27T10:00:00.000Z'),
        };
      }
      return null;
    },
  });

  const result = await service.updateCommentForUser({
    postId: 'p1',
    commentId: 'c1',
    content: 'new',
    userId: 'u1',
    userLang: 'ru',
    nowMs: new Date('2026-05-27T10:10:00.000Z').getTime(),
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { message: 'Можно редактировать только свой комментарий' });
});

test('news comment service edits own comment and clears cache', async () => {
  const { calls, service } = createBaseDeps();

  const result = await service.updateCommentForUser({
    postId: 'p1',
    commentId: 'c1',
    content: ' new text ',
    userId: 'u1',
    userLang: 'ru',
    nowMs: new Date('2026-05-27T10:10:00.000Z').getTime(),
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.comment.content, 'new text');
  assert.equal(calls.some((call) => call[0] === 'update' && call[3].content === 'new text'), true);
  assert.equal(calls.some((call) => call[0] === 'clearComments'), true);
});

test('news comment service deletes comment and returns audit event', async () => {
  const { calls, service } = createBaseDeps();

  const result = await service.deleteCommentForAdmin({
    postId: 'p1',
    commentId: 'c1',
    userLang: 'ru',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.deepEqual(result.audit, {
    event: 'news.comment.delete',
    payload: { postId: 'p1', commentId: 'c1' },
  });
  assert.equal(calls.some((call) => call[0] === 'delete' && call[1] === 'NewsInteraction'), true);
  assert.equal(calls.some((call) => call[0] === 'stats' && call[2].comments === -1), true);
  assert.equal(calls.some((call) => call[0] === 'cacheStats' && call[2].comments === -1), true);
});
