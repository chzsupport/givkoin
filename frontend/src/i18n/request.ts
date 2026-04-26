import {getRequestConfig} from 'next-intl/server';

import {DEFAULT_SITE_LANGUAGE, isSiteLanguage} from './locales';

export default getRequestConfig(async ({requestLocale}) => {
  const requested = await requestLocale;
  const locale = isSiteLanguage(requested) ? requested : DEFAULT_SITE_LANGUAGE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});

