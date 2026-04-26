'use client';

import {createContext, startTransition, useContext, useEffect, useMemo} from 'react';
import {useSearchParams} from 'next/navigation';
import {useLocale, useTranslations} from 'next-intl';

import {usePathname, useRouter} from '@/i18n/navigation';
import {normalizeSiteLanguage, persistSiteLanguage} from '@/i18n/siteLanguage';

function stripLocalePrefix(pathname: string): string {
  if (pathname === '/ru' || pathname === '/en') return '/';
  if (pathname.startsWith('/ru/')) return pathname.slice(3) || '/';
  if (pathname.startsWith('/en/')) return pathname.slice(3) || '/';
  return pathname || '/';
}

type I18nContextValue = {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, fallback?: string) => string;
  localePath: (path: string) => string;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const language = normalizeSiteLanguage(useLocale());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const translate = useTranslations();

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language;
    persistSiteLanguage(language);
  }, [language]);

  const setLanguage = (lang: string) => {
    const normalized = normalizeSiteLanguage(lang);
    if (normalized === language) return;

    const qs = searchParams?.toString();
    const nextUrl = qs ? `${pathname || '/'}?${qs}` : (pathname || '/');

    persistSiteLanguage(normalized);
    startTransition(() => {
      router.replace(nextUrl, { locale: normalized });
    });
  };

  const t = useMemo(() => {
    return (key: string, fb?: string): string => {
      try {
        return translate(key as never);
      } catch {
        return fb ?? key;
      }
    };
  }, [translate]);

  const localePath = useMemo(() => {
    return (path: string): string => {
      const raw = String(path || '/');
      if (/^(?:https?:|mailto:|tel:)/.test(raw)) return raw;

      const suffixMatch = raw.match(/([?#].*)$/);
      const suffix = suffixMatch?.[1] || '';
      const pathnameOnly = suffix ? raw.slice(0, -suffix.length) : raw;
      const normalizedPath = raw.startsWith('/') ? raw : `/${raw}`;
      const cleanPath = stripLocalePrefix(pathnameOnly.startsWith('/') ? pathnameOnly : normalizedPath);
      return cleanPath === '/' ? `/${language}${suffix}` : `/${language}${cleanPath}${suffix}`;
    };
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, localePath }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
