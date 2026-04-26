const CONTENT_LANGUAGES = ['ru', 'en'];
const DEFAULT_CONTENT_LANGUAGE = 'ru';

function asRecord(value) {
  return value && typeof value === 'object' ? value : null;
}

function normalizeContentLanguage(value) {
  return value === 'en' ? 'en' : DEFAULT_CONTENT_LANGUAGE;
}

function createLocalizedText(ru = '', en = '') {
  return {
    ru: typeof ru === 'string' ? ru : '',
    en: typeof en === 'string' ? en : '',
  };
}

function normalizeLocalizedTextInput(value, fallbackRu = '') {
  if (typeof value === 'string') {
    return createLocalizedText(value, '');
  }

  const source = asRecord(value) || {};
  return createLocalizedText(
    typeof source.ru === 'string' ? source.ru : fallbackRu,
    typeof source.en === 'string' ? source.en : ''
  );
}

function buildLocalizedText(baseValue, translatedValue) {
  return createLocalizedText(
    typeof baseValue === 'string' ? baseValue : '',
    typeof translatedValue === 'string' ? translatedValue : ''
  );
}

function getLocalizedText(value, language = DEFAULT_CONTENT_LANGUAGE, fallbackLanguage = DEFAULT_CONTENT_LANGUAGE) {
  const localized = typeof value === 'string'
    ? createLocalizedText(value, '')
    : normalizeLocalizedTextInput(value);
  const targetLanguage = normalizeContentLanguage(language);
  const safeFallbackLanguage = normalizeContentLanguage(fallbackLanguage);

  const directValue = localized[targetLanguage];
  if (typeof directValue === 'string' && directValue.trim()) {
    return directValue;
  }

  const fallbackValue = localized[safeFallbackLanguage];
  if (typeof fallbackValue === 'string' && fallbackValue.trim()) {
    return fallbackValue;
  }

  return localized.ru || localized.en || '';
}

module.exports = {
  CONTENT_LANGUAGES,
  DEFAULT_CONTENT_LANGUAGE,
  normalizeContentLanguage,
  createLocalizedText,
  normalizeLocalizedTextInput,
  buildLocalizedText,
  getLocalizedText,
};
