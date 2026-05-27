const test = require('node:test');
const assert = require('node:assert/strict');

const {
    clearChatPreparationTimeout,
    clearChatWaitingTimeout,
    deleteChatPreparationTimeout,
    getChatPreparationTimeout,
    getChatWaitingTimeout,
    resetChatTimeouts,
    setChatPreparationTimeout,
    setChatWaitingTimeout,
} = require('../services/socket/socketChatTimeouts');

function createLongTimeout() {
    return setTimeout(() => {}, 60 * 1000);
}

test('socket chat timeouts set and clear waiting timeout', () => {
    resetChatTimeouts();
    const timeoutId = createLongTimeout();

    assert.equal(setChatWaitingTimeout('chat-1', timeoutId), timeoutId);
    assert.equal(getChatWaitingTimeout('chat-1'), timeoutId);
    assert.equal(clearChatWaitingTimeout('chat-1'), true);
    assert.equal(getChatWaitingTimeout('chat-1'), null);
    assert.equal(clearChatWaitingTimeout('chat-1'), false);
});

test('socket chat timeouts set and clear preparation timeout', () => {
    resetChatTimeouts();
    const timeoutId = createLongTimeout();

    assert.equal(setChatPreparationTimeout(42, timeoutId), timeoutId);
    assert.equal(getChatPreparationTimeout('42'), timeoutId);
    assert.equal(clearChatPreparationTimeout(42), true);
    assert.equal(getChatPreparationTimeout(42), null);
    assert.equal(clearChatPreparationTimeout(42), false);
});

test('socket chat timeouts delete preparation record without clearing timer', () => {
    resetChatTimeouts();
    const timeoutId = createLongTimeout();

    assert.equal(setChatPreparationTimeout('chat-2', timeoutId), timeoutId);
    assert.equal(deleteChatPreparationTimeout('chat-2'), true);
    assert.equal(getChatPreparationTimeout('chat-2'), null);
    assert.equal(deleteChatPreparationTimeout('chat-2'), false);

    clearTimeout(timeoutId);
});

test('socket chat timeouts reset clears waiting and preparation timers', () => {
    resetChatTimeouts();

    setChatWaitingTimeout('chat-1', createLongTimeout());
    setChatPreparationTimeout('chat-2', createLongTimeout());

    assert.equal(resetChatTimeouts(), 2);
    assert.equal(getChatWaitingTimeout('chat-1'), null);
    assert.equal(getChatPreparationTimeout('chat-2'), null);
});
