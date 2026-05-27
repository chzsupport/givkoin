const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const {
  buildLocalizedFrontendUrl,
  generateReferralCode,
  generateToken,
  generateUserId,
  normalizeEmailInput,
  normalizeLang,
  pickLang,
} = require('../services/auth/authHelpers');
const {
  JWT_SECRET,
} = require('../config/auth');

test('auth helpers normalize language email ids and referral code', () => {
  assert.equal(normalizeLang('en'), 'en');
  assert.equal(normalizeLang('de'), 'ru');
  assert.equal(pickLang('en', 'ru text', 'en text'), 'en text');
  assert.equal(pickLang('ru', 'ru text', 'en text'), 'ru text');
  assert.equal(normalizeEmailInput(' Test@Gmail.Com '), 'test@gmail.com');
  assert.match(generateUserId(), /^[a-f0-9]{24}$/);
  assert.match(generateReferralCode(), /^[A-HJ-NP-Z2-9]{8}$/);
});

test('auth helpers build localized links and signed tokens', () => {
  const url = buildLocalizedFrontendUrl('en', '/confirm', 'token=abc');
  const token = generateToken({ userId: 'u1' }, '1h');
  const decoded = jwt.verify(token, JWT_SECRET);

  assert.equal(url.endsWith('/en/confirm?token=abc'), true);
  assert.equal(decoded.userId, 'u1');
});
