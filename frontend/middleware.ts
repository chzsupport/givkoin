import createMiddleware from 'next-intl/middleware';
import type {NextRequest} from 'next/server';
import {NextResponse} from 'next/server';

import {routing} from './src/i18n/routing';

const LOCALE_PREFIX_RE = /^\/(en|ru)(\/|$)/;
const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
]);

function isOpenRoute(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith('/confirm')) return true;
  return false;
}

function stripLocalePrefix(pathname: string): { locale: string; pathname: string } {
  const match = pathname.match(LOCALE_PREFIX_RE);
  if (match) {
    return { locale: match[1], pathname: pathname.slice(match[1].length + 1) || '/' };
  }
  return { locale: routing.defaultLocale, pathname };
}

function resolveLegacyLocale(req: NextRequest) {
  const value = req.cookies.get('givkoin_site_language')?.value;
  return value === 'en' ? 'en' : value === 'ru' ? 'ru' : null;
}

function applyLocaleCookies(req: NextRequest, response: NextResponse) {
  const localeMatch = req.nextUrl.pathname.match(LOCALE_PREFIX_RE);
  const locale = localeMatch?.[1] || resolveLegacyLocale(req);
  if (!locale) return response;

  response.cookies.set('NEXT_LOCALE', locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  response.cookies.set('givkoin_site_language', locale, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasLocalePrefix = LOCALE_PREFIX_RE.test(pathname);

  if (!hasLocalePrefix) {
    return applyLocaleCookies(req, intlMiddleware(req));
  }

  const { locale, pathname: cleanPath } = stripLocalePrefix(pathname);
  const sessionMarker = req.cookies.get('givkoin_session')?.value;

  if (!isOpenRoute(cleanPath) && !sessionMarker) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.search = '';
    const response = NextResponse.redirect(loginUrl);
    return applyLocaleCookies(req, response);
  }

  return applyLocaleCookies(req, intlMiddleware(req));
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)',
  ],
};

