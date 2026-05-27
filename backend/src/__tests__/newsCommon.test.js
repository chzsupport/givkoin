const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNewsCommentWindowId,
  buildNewsDailyCounterId,
  buildNewsLikeInteractionId,
  buildNewsRepostInteractionId,
  buildNewsViewBucketId,
  getNewsDailyCounterField,
  getNewsViewDateKey,
  getUserData,
  normalizeLang,
  pickLang,
  toId,
} = require('../services/news/newsCommon');

test('news common helpers keep language and id behavior stable', () => {
  assert.equal(normalizeLang('EN-us'), 'en');
  assert.equal(normalizeLang('ru'), 'ru');
  assert.equal(pickLang('en', 'Привет', 'Hello'), 'Hello');
  assert.equal(toId({ _id: { value: 42 } }), '42');
  assert.equal(toId({ toString: () => 'custom-id' }), 'custom-id');
  assert.equal(toId({}), '');
});

test('news common helpers build old document ids', () => {
  assert.equal(buildNewsViewBucketId('u1', '2026-05-27'), 'news_view:u1:2026-05-27');
  assert.equal(buildNewsDailyCounterId('u1', '2026-05-27'), 'news_daily_counter:u1:2026-05-27');
  assert.equal(buildNewsCommentWindowId({ id: 'u1' }, { _id: 'p1' }), 'news_comment_window:u1:p1');
  assert.equal(buildNewsLikeInteractionId('u1', 'p1'), 'news_like:u1:p1');
  assert.equal(buildNewsRepostInteractionId('u1', 'p1'), 'news_repost:u1:p1');
});

test('news common helpers keep counters and user data stable', () => {
  assert.equal(getNewsDailyCounterField('like'), 'likes');
  assert.equal(getNewsDailyCounterField('comment'), 'comments');
  assert.equal(getNewsDailyCounterField('repost'), 'reposts');
  assert.equal(getNewsDailyCounterField('other'), '');
  assert.deepEqual(getUserData({ data: { nickname: 'Ada' } }), { nickname: 'Ada' });
  assert.deepEqual(getUserData({ data: null }), {});
});

test('news view date key keeps the one minute midnight grace rule', () => {
  const normal = new Date(Date.UTC(2026, 4, 27, 12, 0, 0));
  assert.equal(getNewsViewDateKey(normal), '2026-05-27');
});
