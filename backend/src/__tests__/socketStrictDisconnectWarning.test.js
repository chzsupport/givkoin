const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildStrictDisconnectWarningPatch,
    buildWarningNotification,
    CONNECTION_WARNING_WINDOW_DAYS,
} = require('../services/socket/socketStrictDisconnectWarning');

test('socket strict disconnect warning keeps first warning without life penalty', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const result = buildStrictDisconnectWarningPatch({ lives: 5 }, 'chat-1', { now });

    assert.equal(result.warningCount30Days, 1);
    assert.equal(result.lifeDeducted, false);
    assert.equal(result.patch.lives, undefined);
    assert.deepEqual(result.patch.connectionWarnings, [
        { warnedAt: '2026-05-26T12:00:00.000Z', chatId: 'chat-1' },
    ]);
});

test('socket strict disconnect warning deducts life on second recent warning', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const result = buildStrictDisconnectWarningPatch({
        lives: 3,
        connectionWarnings: [
            { warnedAt: '2026-05-01T12:00:00.000Z', chatId: 'old-recent' },
        ],
    }, 'chat-2', { now });

    assert.equal(result.warningCount30Days, 2);
    assert.equal(result.lifeDeducted, true);
    assert.equal(result.patch.lives, 2);
    assert.deepEqual(result.patch.connectionWarnings.map((warning) => warning.chatId), ['old-recent', 'chat-2']);
});

test('socket strict disconnect warning drops stale and invalid warnings', () => {
    const now = new Date('2026-05-26T12:00:00.000Z');
    const staleDate = new Date(now.getTime() - (CONNECTION_WARNING_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString();
    const result = buildStrictDisconnectWarningPatch({
        lives: 5,
        connectionWarnings: [
            { warnedAt: staleDate, chatId: 'stale' },
            { warnedAt: 'not-a-date', chatId: 'broken' },
        ],
    }, 'chat-3', { now });

    assert.equal(result.warningCount30Days, 1);
    assert.equal(result.lifeDeducted, false);
    assert.deepEqual(result.patch.connectionWarnings.map((warning) => warning.chatId), ['chat-3']);
});

test('socket strict disconnect warning notification text keeps ru and en branches', () => {
    const ruPenalty = buildWarningNotification('ru', true);
    const enWarning = buildWarningNotification('en', false);

    assert.equal(ruPenalty.title, 'Снята 1 жизнь');
    assert.match(ruPenalty.message, /второй раз/);
    assert.equal(enWarning.title, 'Chat warning');
    assert.match(enWarning.message, /first time/);
});
