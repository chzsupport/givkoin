const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNewsUserCardFromCounter,
  isRecentNewsLastRead,
} = require('../services/news/newsUserCard');

test('news user card keeps recent last read rule', () => {
  assert.equal(isRecentNewsLastRead('2026-05-27T10:00:00.000Z', 60_000, Date.parse('2026-05-27T10:00:30.000Z')), true);
  assert.equal(isRecentNewsLastRead('2026-05-27T10:00:00.000Z', 60_000, Date.parse('2026-05-27T10:02:00.000Z')), false);
  assert.equal(isRecentNewsLastRead(null, 60_000, Date.parse('2026-05-27T10:00:00.000Z')), false);
});

test('news user card builds old limits and used fields', () => {
  const card = buildNewsUserCardFromCounter({
    likes: '2',
    comments: 5,
    reposts: 1,
  }, '2026-05-27', {
    commentsPerPost: 3,
    dailyCommentsLimit: 72,
    dailyLikesLimit: 24,
    dailyRepostsLimit: 24,
    lastReadTtlMs: 60_000,
    nowMs: Date.parse('2026-05-27T10:00:30.000Z'),
    normalizeViewBucketPostIds: (ids) => ids,
    extra: {
      likedPostIds: ['p1', { id: 'p2' }, 'p1'],
      repostedPostIds: ['p3', ''],
      viewedPostIds: ['p4'],
      lastReadPostId: { _id: 'p5' },
      lastReadUpdatedAt: '2026-05-27T10:00:00.000Z',
    },
  });

  assert.deepEqual(card, {
    dateKey: '2026-05-27',
    likesPerPost: 1,
    repostsPerPost: 1,
    commentsPerPost: 3,
    dailyLikesLimit: 24,
    dailyCommentsLimit: 72,
    dailyRepostsLimit: 24,
    dailyLikesUsed: 2,
    dailyCommentsUsed: 5,
    dailyRepostsUsed: 1,
    dailyLikesLeft: 22,
    dailyCommentsLeft: 67,
    dailyRepostsLeft: 23,
    likedPostIds: ['p1', 'p2'],
    repostedPostIds: ['p3'],
    viewedPostIds: ['p4'],
    lastReadPostId: 'p5',
  });
});
