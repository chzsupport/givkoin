const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const {
  sendRegistrationDuplicateErrorResponse,
  sendRegistrationErrorResponse,
} = require('../controllers/auth/authRegistrationResponse');

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

test('auth registration response keeps registration limit payload', () => {
  const res = createResponse();

  sendRegistrationErrorResponse({
    registrationResult: {
      reason: 'registration_limit',
      maxAllowed: 5,
      blockedUntil: '2026-05-27T10:00:00.000Z',
    },
    requestedLang: 'en',
    res,
  });

  assert.equal(res.state.statusCode, 429);
  assert.deepEqual(res.state.body, {
    message: 'Account limit exceeded. No more than 5 accounts are allowed for one set of signals.',
    blockedUntil: '2026-05-27T10:00:00.000Z',
  });
});

test('auth registration response keeps frozen account payload', () => {
  const res = createResponse();

  sendRegistrationErrorResponse({
    registrationResult: {
      reason: 'multi_account_frozen',
      groupId: 'group-1',
      clusterSize: 4,
    },
    requestedLang: 'ru',
    res,
  });

  assert.equal(res.state.statusCode, 403);
  assert.equal(res.state.body.groupId, 'group-1');
  assert.equal(res.state.body.clusterSize, 4);
  assert.equal(
    res.state.body.message,
    'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.'
  );
});

test('auth registration duplicate response keeps email and nickname messages', () => {
  const nicknameRes = createResponse();
  const emailRes = createResponse();

  sendRegistrationDuplicateErrorResponse({
    error: { code: 11000, keyPattern: { nickname: 1 } },
    requestedLang: 'ru',
    res: nicknameRes,
  });
  sendRegistrationDuplicateErrorResponse({
    error: { code: 11000, keyPattern: { email: 1 } },
    requestedLang: 'en',
    res: emailRes,
  });

  assert.deepEqual(nicknameRes.state.body, { message: 'Никнейм уже занят' });
  assert.deepEqual(emailRes.state.body, { message: 'A user with this email already exists' });
});
