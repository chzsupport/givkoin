const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsInteractionService } = require('../services/news/newsInteractionService');

function createBaseDeps(overrides = {}) {
  const calls = [];
  const deps = {
    adjustNewsDailyCounter: async (payload) => {
      calls.push(['adjustCounter', payload]);
      return {};
    },
    awardRadianceForActivity: (payload) => {
      calls.push(['radiance', payload]);
      return Promise.resolve();
    },
    clearNewsCommentsCache: () => calls.push(['clearComments']),
    commentLimitPerDay: 72,
    commentReward: 1,
    commentsPerPostLimit: 3,
    commentWindowMs: 24 * 60 * 60 * 1000,
    creditK: async (payload) => {
      calls.push(['creditK', payload]);
      return { k: 123 };
    },
    deleteModelDoc: async (model, id) => {
      calls.push(['delete', model, id]);
      return true;
    },
    ensureNewsDailyCounter: async () => ({ likes: 0, comments: 0, reposts: 0 }),
    getCommentWindowForUser: async () => null,
    getModelDocById: async () => null,
    getNewsDailyCounterValue: (counter, type) => Math.max(0, Number(counter?.[`${type}s`]) || 0),
    incrementPostStats: async (postId, delta) => {
      calls.push(['postStats', postId, delta]);
      return {};
    },
    insertModelDoc: async (model, doc) => {
      calls.push(['insert', model, doc]);
      return { _id: 'comment1', ...doc };
    },
    likeLimitPerDay: 24,
    likeReward: 0.5,
    repostChannels: new Set(['telegram']),
    repostLimitPerDay: 24,
    repostReward: 1.5,
    saveViewsForUser: async () => ({ saved: 1, alreadyViewed: 0 }),
    scheduleNewsInteractionSideEffects: (payload) => calls.push(['sideEffects', payload]),
    updateCachedNewsFeedPostStats: (postId, delta) => calls.push(['cacheStats', postId, delta]),
    updateExistingModelDoc: async (model, existing, patch) => {
      calls.push(['updateExisting', model, existing, patch]);
      return { ...existing, ...patch };
    },
    upsertModelDoc: async (model, id, doc) => {
      calls.push(['upsert', model, id, doc]);
      return { _id: id, ...doc };
    },
    ...overrides,
  };
  return { calls, service: createNewsInteractionService(deps) };
}

test('news interaction service saves a new like with old reward and side effects', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { calls, service } = createBaseDeps();

  const result = await service.handleNewsInteraction({
    userId: 'u1',
    postId: 'p1',
    post: { _id: 'p1' },
    type: 'like',
    userLang: 'ru',
    now,
  });

  assert.deepEqual(result.body, { ok: true, liked: true, awarded: 0.5, k: 123 });
  assert.equal(calls.some((call) => call[0] === 'upsert' && call[1] === 'NewsInteraction' && call[3].type === 'like'), true);
  assert.equal(calls.some((call) => call[0] === 'postStats' && call[2].likes === 1), true);
  assert.equal(calls.some((call) => call[0] === 'radiance' && call[1].activityType === 'news_like'), true);
  assert.equal(calls.some((call) => call[0] === 'sideEffects' && call[1].type === 'like'), true);
});

test('news interaction service toggles an existing active like without reward', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { calls, service } = createBaseDeps({
    getModelDocById: async () => ({ _id: 'news_like:u1:p1', active: true }),
  });

  const result = await service.handleNewsInteraction({
    userId: 'u1',
    postId: 'p1',
    post: { _id: 'p1' },
    type: 'like',
    userLang: 'ru',
    now,
  });

  assert.deepEqual(result.body, { ok: true, liked: false, removed: true, awarded: 0 });
  assert.equal(calls.some((call) => call[0] === 'updateExisting' && call[3].active === false), true);
  assert.equal(calls.some((call) => call[0] === 'creditK'), false);
});

test('news interaction service keeps daily comment limit message', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { calls, service } = createBaseDeps({
    ensureNewsDailyCounter: async () => ({ comments: 72 }),
  });

  const result = await service.handleNewsInteraction({
    userId: 'u1',
    postId: 'p1',
    post: { _id: 'p1' },
    type: 'comment',
    content: 'hello',
    userLang: 'ru',
    now,
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { message: 'Дневной лимит комментариев исчерпан' });
  assert.equal(calls.some((call) => call[0] === 'insert'), false);
});

test('news interaction service creates comment response with old author fallback', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { calls, service } = createBaseDeps();

  const result = await service.handleNewsInteraction({
    userId: 'u1',
    postId: 'p1',
    post: { _id: 'p1' },
    type: 'comment',
    content: ' hello ',
    userLang: 'ru',
    now,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.comment.content, 'hello');
  assert.equal(result.body.comment.authorName, 'Пользователь');
  assert.equal(calls.some((call) => call[0] === 'clearComments'), true);
  assert.equal(calls.some((call) => call[0] === 'sideEffects' && call[1].type === 'comment'), true);
});

test('news interaction service rejects invalid repost channel', async () => {
  const { service } = createBaseDeps();

  const result = await service.handleNewsInteraction({
    userId: 'u1',
    postId: 'p1',
    post: { _id: 'p1' },
    type: 'repost',
    channel: 'unknown',
    userLang: 'ru',
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { message: 'Не выбрана сеть для репоста' });
});
