const DEFAULT_REQUEST_LANGUAGE = 'ru';

function normalizeRequestLanguage(value) {
  return value === 'en' ? 'en' : DEFAULT_REQUEST_LANGUAGE;
}

function readRequestHeader(req, name) {
  if (!req) return '';
  if (typeof req.get === 'function') {
    const value = req.get(name);
    if (value) return String(value);
  }

  const headers = req.headers || {};
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()];
  return direct ? String(direct) : '';
}

function readCookie(req, name) {
  if (!req?.cookies) return '';
  if (typeof req.cookies.get === 'function') {
    const value = req.cookies.get(name)?.value;
    return value ? String(value) : '';
  }
  const value = req.cookies[name];
  return value ? String(value) : '';
}

function getRequestLanguage(req, options = {}) {
  const fallback = normalizeRequestLanguage(options.fallback || DEFAULT_REQUEST_LANGUAGE);

  const headerLanguage = readRequestHeader(req, 'x-site-language');
  if (headerLanguage) return normalizeRequestLanguage(headerLanguage);

  const bodyLanguage = req?.body?.siteLanguage || req?.body?.language;
  if (bodyLanguage) return normalizeRequestLanguage(bodyLanguage);

  const queryLanguage = req?.query?.siteLanguage || req?.query?.language;
  if (queryLanguage) return normalizeRequestLanguage(queryLanguage);

  const cookieLanguage = readCookie(req, 'NEXT_LOCALE') || readCookie(req, 'givkoin_site_language');
  if (cookieLanguage) return normalizeRequestLanguage(cookieLanguage);

  const userLanguage = req?.user?.siteLanguage || req?.user?.language || req?.user?.data?.language;
  if (userLanguage) return normalizeRequestLanguage(userLanguage);

  return fallback;
}

function pickRequestLanguage(req, ru, en, options = {}) {
  return getRequestLanguage(req, options) === 'en' ? en : ru;
}

function getSocketLanguage(socket, fallback = DEFAULT_REQUEST_LANGUAGE) {
  const source =
    socket?.data?.siteLanguage ||
    socket?.handshake?.auth?.siteLanguage ||
    socket?.handshake?.headers?.['x-site-language'] ||
    socket?.handshake?.headers?.['X-Site-Language'];
  return normalizeRequestLanguage(source || fallback);
}

module.exports = {
  DEFAULT_REQUEST_LANGUAGE,
  normalizeRequestLanguage,
  getRequestLanguage,
  pickRequestLanguage,
  getSocketLanguage,
};
