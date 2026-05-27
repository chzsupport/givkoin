const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildNextRatings,
    buildPositiveRatingStats,
    buildRatingEntry,
    getChatPartnerId,
    getLikeAchievementIds,
    hasUserRated,
} = require('../services/socket/socketChatRating');

test('socket chat rating finds partner by string comparison', () => {
    const chat = { participants: [1, '2'] };

    assert.equal(getChatPartnerId(chat, '1'), '2');
    assert.equal(getChatPartnerId(chat, '2'), 1);
    assert.equal(getChatPartnerId({ participants: ['1'] }, '1'), undefined);
});

test('socket chat rating detects already rated user', () => {
    const chat = { ratings: [{ from: 1 }, { from: '2' }] };

    assert.equal(hasUserRated(chat, '1'), true);
    assert.equal(hasUserRated(chat, 2), true);
    assert.equal(hasUserRated(chat, 3), false);
    assert.equal(hasUserRated({ ratings: null }, 1), false);
});

test('socket chat rating builds rating entry and appends it', () => {
    const entry = buildRatingEntry({ from: 1, to: 2, rating: 'yes' });
    assert.deepEqual(entry, {
        from: '1',
        to: '2',
        rating: true,
    });

    assert.deepEqual(
        buildNextRatings({ ratings: [{ from: 'old' }] }, entry),
        [{ from: 'old' }, entry]
    );
    assert.deepEqual(buildNextRatings({ ratings: 'bad' }, entry), [entry]);
});

test('socket chat rating increments positive rating stats without losing fields', () => {
    assert.deepEqual(
        buildPositiveRatingStats({ totalPositiveRatingsReceived: 49, other: true }),
        {
            likes: 50,
            nextPartnerStats: {
                totalPositiveRatingsReceived: 50,
                other: true,
            },
        }
    );

    assert.deepEqual(buildPositiveRatingStats(null), {
        likes: 1,
        nextPartnerStats: {
            totalPositiveRatingsReceived: 1,
        },
    });
});

test('socket chat rating keeps like achievement thresholds', () => {
    assert.deepEqual(getLikeAchievementIds(49), []);
    assert.deepEqual(getLikeAchievementIds(50), [76]);
    assert.deepEqual(getLikeAchievementIds(100), [76, 93]);
});
