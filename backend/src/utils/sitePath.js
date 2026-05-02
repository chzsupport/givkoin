const LOCALE_PREFIX_RE = /^\/(en|ru)(?=\/|$)/i;

function stripTrailingSlash(path) {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

function stripLocalePrefix(path) {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const withoutLocale = withLeadingSlash.replace(LOCALE_PREFIX_RE, '') || '/';
  return stripTrailingSlash(withoutLocale.startsWith('/') ? withoutLocale : `/${withoutLocale}`) || '/';
}

function normalizeSitePath(path) {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const pathnameOnly = raw.split('?')[0].split('#')[0] || '/';
  return stripLocalePrefix(pathnameOnly) || '/';
}

function pathStartsWith(path, target) {
  const normalizedPath = normalizeSitePath(path);
  const normalizedTarget = normalizeSitePath(target);
  if (normalizedTarget === '/') return normalizedPath === '/';
  return normalizedPath === normalizedTarget || normalizedPath.startsWith(`${normalizedTarget}/`);
}

module.exports = {
  normalizeSitePath,
  pathStartsWith,
  stripLocalePrefix,
};
