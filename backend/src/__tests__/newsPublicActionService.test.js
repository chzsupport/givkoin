const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsPublicActionService } = require('../services/news/newsPublicActionService');

function createBaseDeps(overrides = {}) {
  const calls = [];
  const deps = {
    getModelDocById: async (model, id) => {
      calls.push(['getDoc', model, id]);
      return { _id: id, status: 'published' };
    },
    handleNewsInteraction: async (payload) => {
      calls.push(['interaction', payload]);
      return { status: 200, body: { ok: true, type: payload.type } };
    },
    parseNewsViewBatchKey: (key, userId) => {
      calls.push(['parseViewKey', key, userId]);
      return key === 'good-key' ? ['p1'] : null;
    },
    saveViewsForUser: async (payload) => {
      calls.push(['saveViews', payload]);
      return { saved: payload.postIds.length, alreadyViewed: 0 };
    },
    ...overrides,
  };
  return {
    calls,
    service: createNewsPublicActionService(deps),
  };
}

test('news public action service requires auth for views', async () => {
  const { service } = createBaseDeps();

  const result = await service.recordViewsForUser({
    userLang: 'ru',
  });

  assert.equal(result.status, 401);
  assert.deepEqual(result.body, { message: 'Требуется авторизация' });
});

test('news public action service rejects invalid view token', async () => {
  const { service } = createBaseDeps();

  const result = await service.recordViewsForUser({
    userId: 'u1',
    viewBatchKey: 'bad-key',
    userLang: 'ru',
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { message: 'Неверная метка просмотра' });
});

test('news public action service saves views with allowed ids', async () => {
  const { calls, service } = createBaseDeps();

  const result = await service.recordViewsForUser({
    userId: 'u1',
    postIds: ['p1', 'p2'],
    lastReadPostId: 'p2',
    viewBatchKey: 'good-key',
    userLang: 'ru',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { saved: 2, alreadyViewed: 0 });
  assert.equal(calls.some((call) => call[0] === 'saveViews' && call[1].allowedPostIds[0] === 'p1'), true);
});

test('news public action service rejects invalid interaction type', async () => {
  const { service } = createBaseDeps();

  const result = await service.handlePostInteraction({
    userId: 'u1',
    postId: 'p1',
    type: 'bad',
    userLang: 'ru',
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { message: 'Некорректный тип действия' });
});

test('news public action service checks published post before interaction', async () => {
  const { service } = createBaseDeps({
    getModelDocById: async () => ({ _id: 'p1', status: 'draft' }),
  });

  const result = await service.handlePostInteraction({
    userId: 'u1',
    postId: 'p1',
    type: 'like',
    userLang: 'ru',
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { message: 'Пост не найден или не опубликован' });
});

test('news public action service delegates valid interaction', async () => {
  const { calls, service } = createBaseDeps();

  const result = await service.handlePostInteraction({
    userId: 'u1',
    postId: 'p1',
    type: 'like',
    userLang: 'ru',
    userNickname: 'Knight',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true, type: 'like' });
  assert.equal(calls.some((call) => call[0] === 'interaction' && call[1].userNickname === 'Knight'), true);
});
