const test = require('node:test');
const assert = require('node:assert/strict');

const { createNewsAdminService } = require('../services/news/newsAdminService');
const {
  buildNewsPostCreatePayload,
  buildNewsPostUpdatePatch,
} = require('../services/news/newsPostAdminPayload');

function createBaseDeps(overrides = {}) {
  const calls = [];
  const docs = new Map();
  const deps = {
    buildNewsPostCreatePayload,
    buildNewsPostUpdatePatch,
    deleteModelDoc: async (model, id) => {
      calls.push(['deleteModel', model, id]);
      return true;
    },
    deleteNewsPostTotally: async (id) => {
      calls.push(['deletePostTotally', id]);
      if (id === 'missing') {
        const err = new Error('missing');
        err.status = 404;
        throw err;
      }
      return true;
    },
    getModelDocById: async (model, id) => docs.get(`${model}:${id}`) || null,
    insertModelDoc: async (model, doc) => {
      calls.push(['insert', model, doc]);
      const saved = { _id: `${model.toLowerCase()}1`, ...doc };
      docs.set(`${model}:${saved._id}`, saved);
      return saved;
    },
    listModelDocs: async (model) => {
      calls.push(['list', model]);
      return [];
    },
    updateModelDoc: async (model, id, patch) => {
      calls.push(['update', model, id, patch]);
      const existing = docs.get(`${model}:${id}`);
      if (!existing) return null;
      const saved = { ...existing, ...patch };
      docs.set(`${model}:${id}`, saved);
      return saved;
    },
    ...overrides,
  };
  return {
    calls,
    docs,
    service: createNewsAdminService(deps),
  };
}

test('news admin service keeps category duplicate message', async () => {
  const { service } = createBaseDeps({
    listModelDocs: async () => [{ name: 'Main', slug: 'main' }],
  });

  const result = await service.createCategory({
    body: { name: 'Main', slug: 'other' },
    userLang: 'ru',
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { message: 'Такая категория уже есть' });
});

test('news admin service creates category with old audit payload', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { calls, service } = createBaseDeps();

  const result = await service.createCategory({
    body: { name: 'Main', slug: 'main' },
    userLang: 'ru',
    now,
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.name, 'Main');
  assert.deepEqual(result.audit, {
    event: 'news.category.create',
    payload: { categoryId: 'newscategory1', name: 'Main', slug: 'main' },
  });
  assert.deepEqual(result.flags, { invalidateCategories: true });
  assert.equal(calls.some((call) => call[0] === 'insert' && call[1] === 'NewsCategory'), true);
});

test('news admin service creates post with old publish audit fields', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { service } = createBaseDeps();

  const result = await service.createPost({
    body: {
      title: 'Title',
      content: 'Body',
      status: 'published',
      categoryId: 'cat1',
    },
    userLang: 'ru',
    now,
  });

  assert.equal(result.status, 201);
  assert.equal(result.body.status, 'published');
  assert.deepEqual(result.audit, {
    event: 'news.post.create',
    payload: {
      postId: 'newspost1',
      status: 'published',
      scheduledAt: null,
      categoryId: 'cat1',
    },
  });
  assert.deepEqual(result.flags, { invalidateFeed: true });
});

test('news admin service keeps already deleted post response', async () => {
  const { service } = createBaseDeps();

  const result = await service.deletePost({
    id: 'missing',
    userLang: 'ru',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { message: 'Пост уже удален' });
  assert.deepEqual(result.flags, { invalidateFeed: true });
  assert.equal(result.audit, undefined);
});

test('news admin service bulk delete deduplicates ids and keeps missing list', async () => {
  const { calls, service } = createBaseDeps();

  const result = await service.deletePostsBulk({
    ids: ['p1', 'p1', 'missing', '', null],
    userLang: 'ru',
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    message: 'Выбранные посты удалены',
    deleted: ['p1'],
    missing: ['missing'],
  });
  assert.deepEqual(result.audit, [
    { event: 'news.post.delete', payload: { postId: 'p1', bulk: true } },
  ]);
  assert.equal(calls.filter((call) => call[0] === 'deletePostTotally').length, 2);
});

test('news admin service publishes post with saved fallback', async () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const { docs, service } = createBaseDeps({
    updateModelDoc: async () => null,
  });
  docs.set('NewsPost:p1', { _id: 'p1', status: 'scheduled', scheduledAt: now });

  const result = await service.publishPost({
    id: 'p1',
    userLang: 'ru',
    now,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'published');
  assert.equal(result.body.scheduledAt, null);
  assert.deepEqual(result.audit, {
    event: 'news.post.publish',
    payload: { postId: 'p1' },
  });
});
