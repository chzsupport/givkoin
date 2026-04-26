import type { SiteLanguage } from './siteLanguage';

export type TranslationsDict = Record<string, string>;

export const TRANSLATIONS: Record<SiteLanguage, TranslationsDict> = {
  ru: {
    loading: 'Загрузка...',
    login: 'Вход',
    join: 'Присоединиться',
    footer_about: 'О нас',
    footer_rules: 'Правила',
    footer_feedback: 'Обратная связь',
    footer_roadmap: 'Дорожная карта',
    contact_us: 'Связаться с нами',
    contact_title: 'Связаться с нами',
    contact_subtitle_prefix: 'Мы откроем ваше почтовое приложение. Получатель:',
    close: 'Закрыть',
    how_to_contact: 'Как с вами связаться?',
    message: 'Сообщение',
    cancel: 'Отмена',
    write: 'Написать',
    language_switcher_label: 'Язык сайта',
    server_unavailable_title: 'Сервер временно недоступен',
    server_unavailable_body: 'Связь с сервером потеряна. Пока соединение не восстановится, сайт заблокирован.',
    check_again: 'Проверить снова',
  },
  en: {
    loading: 'Loading...',
    login: 'Sign in',
    join: 'Join',
    footer_about: 'About us',
    footer_rules: 'Rules',
    footer_feedback: 'Feedback',
    footer_roadmap: 'Roadmap',
    contact_us: 'Contact us',
    contact_title: 'Contact us',
    contact_subtitle_prefix: 'We will open your email app. Recipient:',
    close: 'Close',
    how_to_contact: 'How can we reach you?',
    message: 'Message',
    cancel: 'Cancel',
    write: 'Write',
    language_switcher_label: 'Site language',
    server_unavailable_title: 'Server is temporarily unavailable',
    server_unavailable_body: 'Connection to the server is lost. The site is unavailable until it is restored.',
    check_again: 'Check again',
  },
};

export function tFor(lang: string, key: string) {
  const normalizedLang = lang === 'en' ? 'en' : 'ru';
  return TRANSLATIONS[normalizedLang]?.[key] ?? TRANSLATIONS.ru[key] ?? key;
}
