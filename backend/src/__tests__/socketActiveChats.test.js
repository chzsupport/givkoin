const test = require('node:test');
const assert = require('node:assert/strict');

const {
    clearUsersActiveChat,
    deleteUserActiveChat,
    getUserActiveChat,
    hasUserActiveChat,
    resetActiveChats,
    setUserActiveChat,
} = require('../services/socket/socketActiveChats');

test('socket active chats set get and delete one user chat', () => {
    resetActiveChats();

    assert.equal(setUserActiveChat(42, 100), '100');
    assert.equal(getUserActiveChat('42'), '100');
    assert.equal(hasUserActiveChat(42), true);
    assert.equal(deleteUserActiveChat('42'), true);
    assert.equal(getUserActiveChat(42), null);
    assert.equal(hasUserActiveChat(42), false);
    assert.equal(deleteUserActiveChat('42'), false);
});

test('socket active chats clear several users and reset remaining state', () => {
    resetActiveChats();

    setUserActiveChat('u1', 'chat-1');
    setUserActiveChat('u2', 'chat-1');
    setUserActiveChat('u3', 'chat-2');

    assert.equal(clearUsersActiveChat(['u1', 'u2', 'missing']), 2);
    assert.equal(getUserActiveChat('u1'), null);
    assert.equal(getUserActiveChat('u2'), null);
    assert.equal(getUserActiveChat('u3'), 'chat-2');

    assert.equal(resetActiveChats(), 1);
    assert.equal(getUserActiveChat('u3'), null);
});

test('socket active chats ignore empty user or chat ids', () => {
    resetActiveChats();

    assert.equal(setUserActiveChat('', 'chat-1'), null);
    assert.equal(setUserActiveChat('u1', ''), null);
    assert.equal(getUserActiveChat('u1'), null);
    assert.equal(resetActiveChats(), 0);
});
