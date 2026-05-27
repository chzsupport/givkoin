const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildNewsDailyCounterFromRows,
  createNewsEngagementStore,
  getNewsDailyCounterValue,
  normalizeDailyCounter,
} = require('../services/news/newsEngagementStore');

test('news engagement store normalizes counters and values', () => {
  assert.deepEqual(normalizeDailyCounter({ likes: '2', comments: -1, reposts: 'bad' }), {
    likes: 2,
    comments: 0,
    reposts: 0,
  });
  assert.equal(getNewsDailyCounterValue({ likes: 3 }, 'like'), 3);
  assert.equal(getNewsDailyCounterValue({ likes: 3 }, 'bad'), 0);
});

test('news engagement store builds daily counter from interaction rows', () => {
  const now = new Date('2026-05-27T10:00:00.000Z');
  assert.deepEqual(buildNewsDailyCounterFromRows({
    userId: { _id: 'u1' },
    dateKey: '2026-05-27',
    now,
    rows: [
      { type: 'like' },
      { type: 'comment' },
      { type: 'repost' },
      { type: 'unknown' },
    ],
  }), {
    _id: 'news_daily_counter:u1:2026-05-27',
    user: 'u1',
    dateKey: '2026-05-27',
    likes: 1,
    comments: 1,
    reposts: 1,
    createdAt: now,
    updatedAt: now,
  });
});

test('news engagement store ensures adjusts and reads marks', async () => {
  const docs = new Map();
  const calls = [];
  const rows = [
    { type: 'like', post: 'p1', active: true },
    { type: 'like', post: 'p2', active: false },
    { type: 'repost', post: { _id: 'p3' } },
  ];
  const store = createNewsEngagementStore({
    viewBucketLimit: 5,
    getModelDocById: async (model, id) => docs.get(`${model}:${id}`) || null,
    upsertModelDoc: async (model, id, doc) => {
      calls.push(['upsert', model, id, doc]);
      docs.set(`${model}:${id}`, doc);
      return doc;
    },
    updateExistingModelDoc: async (model, existing, patch) => {
      calls.push(['update', model, existing._id, patch]);
      const next = { ...existing, ...patch };
      docs.set(`${model}:${existing._id}`, next);
      return next;
    },
    listDocsByModel: async (model, query) => {
      calls.push(['list', model, query]);
      return rows.filter((row) => !query.dataEq?.type || row.type === query.dataEq.type);
    },
  });

  const counter = await store.ensureNewsDailyCounter({
    userId: 'u1',
    dateKey: '2026-05-27',
    now: new Date('2026-05-27T10:00:00.000Z'),
  });
  assert.equal(counter._id, 'news_daily_counter:u1:2026-05-27');
  assert.deepEqual(await store.getNewsDailyCounterForUser({
    userId: 'u1',
    dateKey: '2026-05-27',
  }), counter);

  const adjusted = await store.adjustNewsDailyCounter({
    userId: 'u1',
    type: 'like',
    dateKey: '2026-05-27',
    delta: 2,
    now: new Date('2026-05-27T10:01:00.000Z'),
  });
  assert.equal(adjusted.likes, 2);

  assert.deepEqual(await store.getNewsInteractionMarksForUser({
    userId: 'u1',
    now: new Date('2026-05-27T10:00:00.000Z'),
  }), {
    likedPostIds: ['p1'],
    repostedPostIds: ['p3'],
  });
  assert.equal(calls.some((call) => call[0] === 'list' && call[2].limit === 5), true);
});

test('news engagement store reads comment windows and view buckets by old ids', async () => {
  const docs = new Map([
    ['NewsCommentWindow:news_comment_window:u1:p1', { _id: 'news_comment_window:u1:p1' }],
    ['NewsViewBucket:news_view:u1:2026-05-27', { _id: 'news_view:u1:2026-05-27' }],
  ]);
  const store = createNewsEngagementStore({
    getModelDocById: async (model, id) => docs.get(`${model}:${id}`) || null,
  });

  assert.deepEqual(await store.getCommentWindowForUser('u1', 'p1'), { _id: 'news_comment_window:u1:p1' });
  assert.deepEqual(await store.getNewsViewBucketForUser('u1', '2026-05-27'), { _id: 'news_view:u1:2026-05-27' });
});
