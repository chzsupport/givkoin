const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyStatsDelta,
  decodeCommentCursor,
  encodeCommentCursor,
  mapCommentDto,
  normalizeNewsPostStatus,
  normalizeNewsTranslations,
  normalizePostStats,
  paginateFeedPosts,
} = require('../services/news/newsPostFormatting');

test('news post formatting keeps comment dto fallback author name', () => {
  const dto = mapCommentDto({
    _id: 'comment-1',
    post: 'post-1',
    content: 'Text',
    createdAt: '2026-05-27T10:00:00.000Z',
    user: { _id: 'user-1' },
  }, 'en');

  assert.deepEqual(dto, {
    id: 'comment-1',
    postId: 'post-1',
    content: 'Text',
    createdAt: '2026-05-27T10:00:00.000Z',
    authorId: 'user-1',
    authorName: 'User',
  });
});

test('news post formatting normalizes stats and deltas without negatives', () => {
  assert.deepEqual(normalizePostStats({ stats: { likes: '2', comments: -5, reposts: 'x' } }).stats, {
    likes: 2,
    comments: 0,
    reposts: 0,
  });
  assert.deepEqual(applyStatsDelta({ likes: 1, comments: 0, reposts: 2 }, { likes: 2, comments: -5, reposts: -1 }), {
    likes: 3,
    comments: 0,
    reposts: 1,
  });
});

test('news post formatting keeps status and translation normalization', () => {
  assert.equal(normalizeNewsPostStatus('published'), 'published');
  assert.equal(normalizeNewsPostStatus('bad', 'draft'), 'draft');
  assert.deepEqual(normalizeNewsTranslations({
    en: {
      title: '  Hello  ',
      content: 'Body',
    },
  }, {
    en: {
      old: 'keep',
    },
  }), {
    en: {
      old: 'keep',
      title: 'Hello',
      content: 'Body',
    },
  });
});

test('news post formatting paginates feed after cursor', () => {
  const posts = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }, { _id: 'd' }];
  assert.deepEqual(paginateFeedPosts(posts, {
    cursor: 'b',
    defaultLimit: 2,
    limit: 2,
    maxLimit: 25,
  }), {
    items: [{ _id: 'c' }, { _id: 'd' }],
    nextCursor: null,
    hasMore: false,
  });
});

test('news post formatting encodes and decodes comment cursor', () => {
  const cursor = encodeCommentCursor({ createdAt: '2026-05-27T10:00:00.000Z', _id: 'comment-1' });
  assert.deepEqual(decodeCommentCursor(cursor), {
    createdAt: '2026-05-27T10:00:00.000Z',
    id: 'comment-1',
  });
  assert.equal(decodeCommentCursor('bad'), null);
});
