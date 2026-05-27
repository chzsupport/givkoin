const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildChatPreparingPayload,
    buildNewMessagePayload,
    getMessageLanguagePair,
    isChatParticipant,
} = require('../services/socket/socketChatMessaging');

test('socket chat messaging detects participant by normalized string id', () => {
    const context = { participants: ['1', '2'] };

    assert.equal(isChatParticipant(context, 1), true);
    assert.equal(isChatParticipant(context, '2'), true);
    assert.equal(isChatParticipant(context, 3), false);
    assert.equal(isChatParticipant(null, 1), false);
});

test('socket chat messaging picks source and target languages with ru fallback', () => {
    const context = {
        participants: ['u1', 'u2'],
        participantLanguages: { u1: 'en' },
    };

    assert.deepEqual(getMessageLanguagePair(context, 'u1'), {
        partnerId: 'u2',
        sourceLang: 'en',
        targetLang: 'ru',
    });

    assert.deepEqual(getMessageLanguagePair(context, 'u2'), {
        partnerId: 'u1',
        sourceLang: 'ru',
        targetLang: 'en',
    });
});

test('socket chat messaging builds preparing payload', () => {
    assert.deepEqual(
        buildChatPreparingPayload(123, {
            countdownSeconds: 15,
            readyAt: '2026-05-26T10:00:15.000Z',
        }),
        {
            chatId: '123',
            countdownSeconds: 15,
            readyAt: '2026-05-26T10:00:15.000Z',
        }
    );
});

test('socket chat messaging builds public new message payload', () => {
    assert.deepEqual(
        buildNewMessagePayload({
            _id: 'msg-1',
            senderId: 'other',
            originalText: 'Привет',
            translatedText: 'Hello',
            createdAt: '2026-05-26T10:00:00.000Z',
            hidden: 'ignore',
        }, 'u1'),
        {
            _id: 'msg-1',
            senderId: 'u1',
            originalText: 'Привет',
            translatedText: 'Hello',
            createdAt: '2026-05-26T10:00:00.000Z',
        }
    );
});
