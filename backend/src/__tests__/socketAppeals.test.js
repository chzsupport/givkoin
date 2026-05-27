const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAppealInsertPayload,
} = require('../services/socket/socketAppeals');

test('socket appeals build document payload with pending status by default', () => {
  const payload = buildAppealInsertPayload({
    chat: 'chat-1',
    complainant: 'u1',
    againstUser: 'u2',
    reason: 'spam',
  }, {
    id: 'app-1',
    nowIso: '2026-05-25T10:00:00.000Z',
  });

  assert.deepEqual(payload, {
    id: 'app-1',
    appealData: {
      status: 'pending',
      chat: 'chat-1',
      complainant: 'u1',
      againstUser: 'u2',
      reason: 'spam',
    },
    document: {
      model: 'Appeal',
      id: 'app-1',
      data: {
        status: 'pending',
        chat: 'chat-1',
        complainant: 'u1',
        againstUser: 'u2',
        reason: 'spam',
      },
      createdAt: '2026-05-25T10:00:00.000Z',
      updatedAt: '2026-05-25T10:00:00.000Z',
    },
  });
});

test('socket appeals allow explicit status override like old spread order', () => {
  const payload = buildAppealInsertPayload({ status: 'custom' }, {
    id: 'app-2',
    nowIso: '2026-05-25T10:00:00.000Z',
  });

  assert.equal(payload.appealData.status, 'custom');
  assert.equal(payload.document.data.status, 'custom');
});
