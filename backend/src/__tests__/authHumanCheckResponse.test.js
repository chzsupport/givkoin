const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const {
  sendHumanCheckBlockedResponse,
  sendHumanCheckExpiredResponse,
  sendHumanCheckFailResponse,
  sendHumanCheckStatusMissingResponse,
} = require('../controllers/auth/authHumanCheckResponse');

function createResponse() {
  const state = {
    body: null,
    statusCode: null,
  };

  return {
    json(body) {
      state.body = body;
      return state;
    },
    status(statusCode) {
      state.statusCode = statusCode;
      return this;
    },
    state,
  };
}

test('human check response keeps status missing user message', () => {
  const res = createResponse();

  sendHumanCheckStatusMissingResponse({
    requestedLang: 'en',
    result: { status: 404 },
    res,
  });

  assert.equal(res.state.statusCode, 404);
  assert.deepEqual(res.state.body, { message: 'User not found' });
});

test('human check response keeps expired challenge message', () => {
  const res = createResponse();

  sendHumanCheckExpiredResponse({
    requestedLang: 'ru',
    result: { status: 410 },
    res,
  });

  assert.equal(res.state.statusCode, 410);
  assert.deepEqual(res.state.body, {
    message: 'Проверка устарела. Обновите страницу и попробуйте снова.',
  });
});

test('human check response clears cookie on blocked pass result', () => {
  const res = createResponse();
  let cleared = false;

  sendHumanCheckBlockedResponse({
    clearAuthCookie: () => {
      cleared = true;
    },
    requestedLang: 'en',
    result: { blockedUntil: '2026-05-27T10:00:00.000Z' },
    res,
  });

  assert.equal(cleared, true);
  assert.equal(res.state.statusCode, 403);
  assert.deepEqual(res.state.body, {
    message: 'Access is temporarily closed after a failed check',
    humanCheckBlocked: true,
    blockedUntil: '2026-05-27T10:00:00.000Z',
  });
});

test('human check response keeps failed challenge message', () => {
  const res = createResponse();
  let cleared = false;

  sendHumanCheckFailResponse({
    clearAuthCookie: () => {
      cleared = true;
    },
    requestedLang: 'ru',
    result: { blocked: false, challengeFailed: true, attemptsLeft: 2 },
    res,
  });

  assert.equal(cleared, true);
  assert.equal(res.state.statusCode, null);
  assert.deepEqual(res.state.body, {
    blocked: false,
    challengeFailed: true,
    attemptsLeft: 2,
    message: 'Проверка не пройдена. Сейчас вы будете выведены из аккаунта.',
  });
});
