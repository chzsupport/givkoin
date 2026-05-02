const LOCALE_PREFIX_RE = /^\/(en|ru)(?=\/|$)/i;

function stripTrailingSlash(path: string) {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

export function stripLocalePrefix(path: string) {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const withLeadingSlash = raw.startsWith('/') ? raw : `/${raw}`;
  const withoutLocale = withLeadingSlash.replace(LOCALE_PREFIX_RE, '') || '/';
  return stripTrailingSlash(withoutLocale.startsWith('/') ? withoutLocale : `/${withoutLocale}`) || '/';
}

export function normalizeSitePath(path: string) {
  const raw = String(path || '').trim();
  if (!raw) return '/';
  const pathnameOnly = raw.split('?')[0].split('#')[0] || '/';
  const normalized = stripLocalePrefix(pathnameOnly);
  return normalized || '/';
}

export function pathStartsWith(path: string, target: string) {
  const normalizedPath = normalizeSitePath(path);
  const normalizedTarget = normalizeSitePath(target);
  if (normalizedTarget === '/') return normalizedPath === '/';
  return normalizedPath === normalizedTarget || normalizedPath.startsWith(`${normalizedTarget}/`);
}
