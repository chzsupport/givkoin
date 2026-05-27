const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { sendLoginErrorResponse } = require('../controllers/auth/authLoginResponse');

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

test('auth login response keeps bad credentials shape', () => {
  const res = createResponse();

  sendLoginErrorResponse({
    loginResult: { reason: 'bad_credentials' },
    requestedLang: 'ru',
    res,
  });

  assert.equal(res.state.statusCode, 401);
  assert.deepEqual(res.state.body, { message: 'Неверный email или пароль' });
});

test('auth login response keeps temporary restriction timestamp', () => {
  const res = createResponse();

  sendLoginErrorResponse({
    loginResult: {
      reason: 'temporary_restriction_active',
      blockedUntil: '2026-05-27T10:00:00.000Z',
    },
    requestedLang: 'en',
    res,
  });

  assert.equal(res.state.statusCode, 403);
  assert.equal(res.state.body.blockedUntil, '2026-05-27T10:00:00.000Z');
  assert.equal(
    res.state.body.message,
    'Access is restricted due to a multi-account review. The restriction is active until 2026-05-27T10:00:00.000Z.'
  );
});

test('auth login response clears cookie on single device conflict', () => {
  const res = createResponse();
  let cleared = false;

  sendLoginErrorResponse({
    clearAuthCookie: () => {
      cleared = true;
    },
    loginResult: { reason: 'single_device_conflict' },
    requestedLang: 'ru',
    res,
  });

  assert.equal(cleared, true);
  assert.equal(res.state.statusCode, 409);
  assert.deepEqual(res.state.body, {
    message: 'Обнаружен вход с другого устройства. Все сеансы этого аккаунта завершены. Войдите заново только на одном устройстве.',
  });
});
