const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildOnlineStatusPatch,
    buildTimestampPatch,
    normalizeStatusUserIds,
} = require('../services/socket/socketUserStatus');

test('socket user status normalizes ids and removes duplicates', () => {
    assert.deepEqual(normalizeStatusUserIds(['u1', 'u2', 'u1', '', null, 42]), ['u1', 'u2', '42']);
    assert.deepEqual(normalizeStatusUserIds('u3'), ['u3']);
});

test('socket user status builds online patch for active chat', () => {
    assert.deepEqual(buildOnlineStatusPatch('in_chat'), {
        chatStatus: 'in_chat',
        isSearching: false,
        searchStartedAt: 0,
    });
});

test('socket user status keeps available patch shape with undefined search fields', () => {
    assert.deepEqual(buildOnlineStatusPatch('available'), {
        chatStatus: 'available',
        isSearching: undefined,
        searchStartedAt: undefined,
    });
});

test('socket user status builds timestamp patch for a chosen field', () => {
    assert.deepEqual(
        buildTimestampPatch('lastSeenAt', new Date('2026-05-26T12:00:00.000Z')),
        { lastSeenAt: '2026-05-26T12:00:00.000Z' }
    );
    assert.equal(buildTimestampPatch('', new Date('2026-05-26T12:00:00.000Z')), null);
});
