const AUTH_COOKIE_NAME = 'givkoin_auth';
const AUTH_COOKIE_MAX_AGE_MS = (() => {
  const parsed = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 30 * 24 * 60 * 60 * 1000;
})();

function requireEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    if (process.env.NODE_ENV === 'test') {
      return `${name.toLowerCase()}_test_value`;
    }
    throw new Error(`${name} is required`);
  }
  return value;
}

const JWT_SECRET = requireEnv('JWT_SECRET');
const JWT_EXPIRE = String(process.env.JWT_EXPIRE || '30d').trim();

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction(),
    sameSite: isProduction() ? 'none' : 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
  };
}

function issueAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
}

function clearAuthCookie(res) {
  const { httpOnly, secure, sameSite, path } = getAuthCookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly,
    secure,
    sameSite,
    path,
  });
}

module.exports = {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
  JWT_SECRET,
  JWT_EXPIRE,
  getAuthCookieOptions,
  issueAuthCookie,
  clearAuthCookie,
};

