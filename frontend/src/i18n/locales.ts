export type SiteLanguage = 'ru' | 'en';

export const SITE_LANGUAGES = ['ru', 'en'] as const satisfies readonly SiteLanguage[];
export const DEFAULT_SITE_LANGUAGE: SiteLanguage = 'ru';

export const SITE_LANGUAGE_NAMES: Record<SiteLanguage, Record<SiteLanguage, string>> = {
  ru: {
    ru: 'Русский',
    en: 'Russian',
  },
  en: {
    ru: 'Английский',
    en: 'English',
  },
};

export const SITE_LANGUAGE_LOCALES: Record<SiteLanguage, string> = {
  ru: 'ru-RU',
  en: 'en-US',
};

export function normalizeSiteLanguage(value: unknown): SiteLanguage {
  return value === 'en' ? 'en' : 'ru';
}

export function isSiteLanguage(value: unknown): value is SiteLanguage {
  return value === 'ru' || value === 'en';
}

