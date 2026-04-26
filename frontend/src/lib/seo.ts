import type { Metadata } from 'next';

type Locale = 'ru' | 'en';

function normalizeLocale(locale: string): Locale {
  return locale === 'en' ? 'en' : 'ru';
}

function withLocale(locale: Locale, pathname = '') {
  const safePath = String(pathname || '').replace(/^\/+/, '');
  return `/${locale}${safePath ? `/${safePath}` : ''}`;
}

export function buildPublicPageMetadata(
  localeInput: string,
  pathname: string,
  title: string,
  description: string,
): Metadata {
  const locale = normalizeLocale(localeInput);

  return {
    title,
    description,
    alternates: {
      canonical: withLocale(locale, pathname),
      languages: {
        ru: withLocale('ru', pathname),
        en: withLocale('en', pathname),
        'x-default': withLocale('ru', pathname),
      },
    },
    openGraph: {
      title,
      description,
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export function buildNoIndexMetadata(title?: string): Metadata {
  return {
    ...(title ? { title } : {}),
    robots: {
      index: false,
      follow: false,
      googleBot: {
        index: false,
        follow: false,
      },
    },
  };
}
