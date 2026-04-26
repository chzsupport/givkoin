import {
  DEFAULT_SITE_LANGUAGE,
  normalizeSiteLanguage,
  SITE_LANGUAGES,
  SITE_LANGUAGE_LOCALES,
  SITE_LANGUAGE_NAMES,
  type SiteLanguage,
} from './locales';

export type { SiteLanguage } from './locales';
export { normalizeSiteLanguage } from './locales';

export const SITE_LANGUAGE_STORAGE_KEY = 'NEXT_LOCALE';
export const SITE_LANGUAGE_COOKIE_KEY = 'NEXT_LOCALE';
export const LEGACY_SITE_LANGUAGE_COOKIE_KEY = 'givkoin_site_language';
export const SUPPORTED_SITE_LANGUAGES: SiteLanguage[] = [...SITE_LANGUAGES];
const LEGACY_SITE_LANGUAGE_STORAGE_KEY = 'givkoin_language';

function readCookie(name: string) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

function detectLocaleFromPathname(pathname: string) {
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  if (pathname === '/ru' || pathname.startsWith('/ru/')) return 'ru';
  return '';
}

export function detectPreferredSiteLanguage(): SiteLanguage {
  if (typeof window === 'undefined') return DEFAULT_SITE_LANGUAGE;

  const pathnameLocale = detectLocaleFromPathname(window.location.pathname);
  if (pathnameLocale) return normalizeSiteLanguage(pathnameLocale);

  const nextLocale = readCookie(SITE_LANGUAGE_COOKIE_KEY);
  if (nextLocale) return normalizeSiteLanguage(nextLocale);

  const legacyCookieLocale = readCookie(LEGACY_SITE_LANGUAGE_COOKIE_KEY);
  if (legacyCookieLocale) return normalizeSiteLanguage(legacyCookieLocale);

  try {
    const stored = window.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY);
    if (stored) return normalizeSiteLanguage(stored);
    const legacyStored = window.localStorage.getItem(LEGACY_SITE_LANGUAGE_STORAGE_KEY);
    if (legacyStored) return normalizeSiteLanguage(legacyStored);
  } catch {
  }

  const browserLanguage = String(window.navigator.language || '').toLowerCase();
  if (browserLanguage.startsWith('en')) return 'en';
  return DEFAULT_SITE_LANGUAGE;
}

export function persistSiteLanguage(language: SiteLanguage) {
  const normalized = normalizeSiteLanguage(language);

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SITE_LANGUAGE_STORAGE_KEY, normalized);
      window.localStorage.setItem(LEGACY_SITE_LANGUAGE_COOKIE_KEY, normalized);
    } catch {
    }
  }

  if (typeof document !== 'undefined') {
    document.cookie = `${SITE_LANGUAGE_COOKIE_KEY}=${normalized}; path=/; max-age=31536000; samesite=lax`;
    document.cookie = `${LEGACY_SITE_LANGUAGE_COOKIE_KEY}=${normalized}; path=/; max-age=31536000; samesite=lax`;
  }
}

export function getSiteLanguage(): SiteLanguage {
  if (typeof window === 'undefined') return DEFAULT_SITE_LANGUAGE;

  const pathnameLocale = detectLocaleFromPathname(window.location.pathname);
  if (pathnameLocale) return normalizeSiteLanguage(pathnameLocale);

  const nextLocale = readCookie(SITE_LANGUAGE_COOKIE_KEY);
  if (nextLocale) return normalizeSiteLanguage(nextLocale);

  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement.lang;
    if (htmlLang) return normalizeSiteLanguage(htmlLang);
  }

  try {
    const stored = window.localStorage.getItem(SITE_LANGUAGE_STORAGE_KEY);
    if (stored) return normalizeSiteLanguage(stored);
    const legacyStored = window.localStorage.getItem(LEGACY_SITE_LANGUAGE_STORAGE_KEY);
    if (legacyStored) return normalizeSiteLanguage(legacyStored);
  } catch {
  }

  return detectPreferredSiteLanguage();
}

export function getSiteLanguageName(language: SiteLanguage, displayLanguage: SiteLanguage = DEFAULT_SITE_LANGUAGE) {
  return SITE_LANGUAGE_NAMES[normalizeSiteLanguage(language)][normalizeSiteLanguage(displayLanguage)];
}

export function getSiteLanguageLocale(language: SiteLanguage = DEFAULT_SITE_LANGUAGE) {
  return SITE_LANGUAGE_LOCALES[normalizeSiteLanguage(language)];
}
