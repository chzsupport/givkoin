export type ContentLanguage = 'ru' | 'en';

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

export function emptyLocalizedText(): LocalizedText {
  return {
    ru: '',
    en: '',
  };
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

export function mergeLocalizedText(nextValue: unknown, currentValue: unknown): LocalizedText {
  const current = normalizeLocalizedText(currentValue);

  if (typeof nextValue === 'string') {
    return {
      ru: nextValue,
      en: current.en,
    };
  }

  const nextRecord = asRecord(nextValue);
  if (!nextRecord) {
    return current;
  }

  return {
    ru: typeof nextRecord.ru === 'string' ? nextRecord.ru : current.ru,
    en: typeof nextRecord.en === 'string' ? nextRecord.en : current.en,
  };
}

export function getLocalizedTextValue(value: unknown, language: ContentLanguage): string {
  return normalizeLocalizedText(value)[language];
}

export function updateLocalizedTextValue(
  value: unknown,
  language: ContentLanguage,
  nextText: string,
): LocalizedText {
  const normalized = normalizeLocalizedText(value);
  return {
    ...normalized,
    [language]: nextText,
  };
}

export function getTranslatedField(baseValue: unknown, translations: unknown, field: string): LocalizedText {
  const source = asRecord(translations);
  const en = asRecord(source?.en);

  return {
    ru: typeof baseValue === 'string' ? baseValue : String(baseValue ?? ''),
    en: typeof getByPath(en, field) === 'string' ? String(getByPath(en, field)) : '',
  };
}