const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const { getFrontendBaseUrl } = require('../../config/env');
const {
  JWT_SECRET,
  JWT_EXPIRE,
} = require('../../config/auth');

const APP_URL = getFrontendBaseUrl();

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function generateUserId() {
  return crypto.randomBytes(12).toString('hex');
}

function normalizeEmailInput(value) {
  return String(value || '').trim().toLowerCase();
}

function generateToken(payload, expiresIn = JWT_EXPIRE) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function generateReferralCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

function buildLocalizedFrontendUrl(language, pathname, search = '') {
  const locale = normalizeLang(language);
  const base = String(APP_URL || '').replace(/\/+$/, '');
  const normalizedPath = String(pathname || '/').replace(/^\/+/, '');
  const normalizedSearch = search
    ? String(search).startsWith('?')
      ? String(search)
      : `?${String(search)}`
    : '';
  return `${base}/${locale}/${normalizedPath}${normalizedSearch}`;
}

module.exports = {
  buildLocalizedFrontendUrl,
  generateReferralCode,
  generateToken,
  generateUserId,
  normalizeEmailInput,
  normalizeLang,
  pickLang,
};
