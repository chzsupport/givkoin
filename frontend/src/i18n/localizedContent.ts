import { normalizeSiteLanguage, type SiteLanguage } from './siteLanguage';

export type LocalizedText = {
  ru: string;
  en: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function getByPath(value: unknown, path: string): unknown {
  const parts = String(path || '').split('.').filter(Boolean);
  let current: unknown = value;

  for (const part of parts) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[part];
  }

  return current;
}

export function normalizeLocalizedText(value: unknown): LocalizedText {
  if (typeof value === 'string') {
    return {
      ru: value,
      en: '',
    };
  }

  const record = asRecord(value);
  return {
    ru: typeof record?.ru === 'string' ? record.ru : '',
    en: typeof record?.en === 'string' ? record.en : '',
  };
}

export function getLocalizedText(value: unknown, language: SiteLanguage | string = 'ru'): string {
  const localized = normalizeLocalizedText(value);
  const normalizedLanguage = normalizeSiteLanguage(language);
  if (normalizedLanguage === 'en' && localized.en.trim()) {
    return localized.en;
  }
  return localized.ru;
}

export function getLocalizedField(
  baseValue: unknown,
  translations: unknown,
  field: string,
  language: SiteLanguage | string = 'ru',
): string {
  const normalizedLanguage = normalizeSiteLanguage(language);
  const source = asRecord(translations);
  const translated = asRecord(source?.en);
  const fallback = typeof baseValue === 'string' ? baseValue : String(baseValue ?? '');

  if (normalizedLanguage === 'en') {
    const value = getByPath(translated, field);
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }

  return fallback;
}
