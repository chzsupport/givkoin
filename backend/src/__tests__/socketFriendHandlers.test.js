const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildIncomingFriendInvitePayload,
    getUserChatStatus,
    getUserLanguage,
    getUserNickname,
    isUserRoomOnline,
    resolveFriendTargetId,
} = require('../services/socket/socketFriendHandlers');

test('socket friend handlers resolve friend target with legacy typo fallback', () => {
    assert.equal(resolveFriendTargetId({ friendId: 1, otherId: 2, oderId: 3 }), '1');
    assert.equal(resolveFriendTargetId({ otherId: 2, oderId: 3 }), '2');
    assert.equal(resolveFriendTargetId({ oderId: 3 }), '3');
    assert.equal(resolveFriendTargetId({}), '');
});

test('socket friend handlers read user language with ru fallback', () => {
    assert.equal(getUserLanguage({ language: 'en' }), 'en');
    assert.equal(getUserLanguage({ data: { language: 'en' } }), 'en');
    assert.equal(getUserLanguage({ language: 'de' }), 'ru');
    assert.equal(getUserLanguage(null), 'ru');
});

test('socket friend handlers read nickname and chat status from row data', () => {
    assert.equal(getUserNickname({ nickname: '  Top  ', data: { nickname: 'Data' } }), 'Top');
    assert.equal(getUserNickname({ data: { nickname: 'Data' } }), 'Data');
    assert.equal(getUserNickname({ data: { nickname: '' } }, 'Друг'), 'Друг');
    assert.equal(getUserChatStatus({ data: { chatStatus: 'busy' } }), 'busy');
    assert.equal(getUserChatStatus({ data: {} }), 'available');
});

test('socket friend handlers detect online user room', () => {
    const io = {
        sockets: {
            adapter: {
                rooms: new Map([
                    ['user-1', { size: 1 }],
                    ['user-2', { size: 0 }],
                ]),
            },
        },
    };

    assert.equal(isUserRoomOnline(io, '1'), true);
    assert.equal(isUserRoomOnline(io, '2'), false);
    assert.equal(isUserRoomOnline(io, '3'), false);
});

test('socket friend handlers build friend invite payload', () => {
    assert.deepEqual(buildIncomingFriendInvitePayload('u1', 'Лада'), {
        callerId: 'u1',
        source: 'friend',
        callerName: 'Лада',
    });
});
