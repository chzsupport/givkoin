const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNewsPostCreatePayload,
  buildNewsPostUpdatePatch,
} = require('../services/news/newsPostAdminPayload');

test('news post admin payload builds draft post with normalized fields', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const result = buildNewsPostCreatePayload({
    title: '  Title  ',
    content: '  Body  ',
    mediaUrl: '  https://example.test/pic.png  ',
    categoryId: 'cat1',
    translations: { en: { title: ' Hi ', content: ' Text ' } },
  }, { now });

  assert.equal(result.error, null);
  assert.equal(result.finalStatus, 'draft');
  assert.equal(result.categoryId, 'cat1');
  assert.equal(result.payload.title, 'Title');
  assert.equal(result.payload.content, '  Body  ');
  assert.equal(result.payload.mediaUrl, 'https://example.test/pic.png');
  assert.equal(result.payload.category, 'cat1');
  assert.equal(result.payload.status, 'draft');
  assert.equal(result.payload.scheduledAt, null);
  assert.equal(result.payload.publishedAt, null);
  assert.deepEqual(result.payload.stats, { likes: 0, comments: 0, reposts: 0 });
});

test('news post admin payload publishes scheduled post immediately when time is due', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const result = buildNewsPostCreatePayload({
    title: 'Title',
    content: 'Body',
    status: 'scheduled',
    scheduledAt: '2026-05-27T09:59:00.000Z',
  }, { now });

  assert.equal(result.error, null);
  assert.equal(result.finalStatus, 'published');
  assert.equal(result.payload.status, 'published');
  assert.equal(result.payload.scheduledAt, null);
  assert.equal(result.payload.publishedAt, now);
});

test('news post admin payload rejects missing text and invalid scheduled date', () => {
  assert.equal(buildNewsPostCreatePayload({ title: '', content: 'Body' }).error, 'missing_required');
  assert.equal(buildNewsPostCreatePayload({
    title: 'Title',
    content: 'Body',
    status: 'scheduled',
    scheduledAt: 'bad-date',
  }).error, 'invalid_scheduled_at');
});

test('news post admin payload builds update patch without losing old publish date', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const oldPublishedAt = '2026-05-26T10:00:00.000Z';
  const result = buildNewsPostUpdatePatch({
    status: 'scheduled',
    scheduledAt: '2026-05-27T11:00:00.000Z',
    publishedAt: oldPublishedAt,
    translations: { ru: { title: 'Старый' } },
  }, {
    content: '  New body  ',
    scheduledAt: '2026-05-27T09:00:00.000Z',
    translations: { en: { title: ' New ' } },
  }, { now });

  assert.equal(result.error, null);
  assert.equal(result.patch.status, 'published');
  assert.equal(result.patch.scheduledAt, null);
  assert.equal(result.patch.publishedAt, oldPublishedAt);
  assert.equal(result.patch.content, '  New body  ');
  assert.equal(result.patch.updatedAt, now);
  assert.deepEqual(result.patch.translations.en, { title: 'New' });
});

test('news post admin payload clears published date when moving post to draft', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  const result = buildNewsPostUpdatePatch({
    status: 'published',
    publishedAt: '2026-05-26T10:00:00.000Z',
  }, {
    status: 'draft',
  }, { now });

  assert.equal(result.error, null);
  assert.equal(result.patch.status, 'draft');
  assert.equal(result.patch.scheduledAt, null);
  assert.equal(result.patch.publishedAt, null);
});
