import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';

import {LayoutWrapper} from '@/components/LayoutWrapper';
import {ActiveChatProvider} from '@/context/ActiveChatContext';
import {AuthProvider} from '@/context/AuthContext';
import {BackendStatusProvider} from '@/context/BackendStatusContext';
import {CrystalProvider} from '@/context/CrystalContext';
import {I18nProvider} from '@/context/I18nContext';
import {SocketProvider} from '@/context/SocketContext';
import {SITE_LANGUAGES, type SiteLanguage} from '@/i18n/locales';

const META: Record<SiteLanguage, {description: string}> = {
  ru: {
    description: 'Социальная вселенная GIVKOIN — защищаем и растим Древо Мироздания',
  },
  en: {
    description: 'The social universe of GIVKOIN — protect and grow the Tree of Creation',
  },
};

function normalizeLocale(locale: string): SiteLanguage {
  return locale === 'en' ? 'en' : 'ru';
}

export function generateStaticParams() {
  return SITE_LANGUAGES.map((locale) => ({locale}));
}

export async function generateMetadata({
  params,
}: {
  params: {locale: string};
}): Promise<Metadata> {
  const locale = normalizeLocale(params.locale);
  const meta = META[locale];
  const isDefault = locale === 'ru';

  return {
    metadataBase: null,
    title: 'GIVKOIN',
    description: meta.description,
    applicationName: 'GIVKOIN',
    icons: {
      icon: [
        {url: '/favicon-givkoin.svg', type: 'image/svg+xml'},
        {url: '/favicon-givkoin.png', type: 'image/png'},
      ],
      shortcut: '/favicon-givkoin.png',
      apple: '/favicon-givkoin.png',
    },
    alternates: {
      languages: {
        ru: '/ru',
        en: '/en',
        'x-default': '/ru',
      },
      canonical: isDefault ? '/ru' : '/en',
    },
    openGraph: {
      title: 'GIVKOIN',
      description: meta.description,
      siteName: 'GIVKOIN',
      locale,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'GIVKOIN',
      description: meta.description,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: {locale: string};
}) {
  if (!SITE_LANGUAGES.includes(params.locale as SiteLanguage)) {
    notFound();
  }

  const locale = normalizeLocale(params.locale);
  const messages = await getMessages({locale});

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AuthProvider>
        <BackendStatusProvider>
          <I18nProvider>
            <ActiveChatProvider>
              <CrystalProvider>
                <SocketProvider>
                  <LayoutWrapper>{children}</LayoutWrapper>
                </SocketProvider>
              </CrystalProvider>
            </ActiveChatProvider>
          </I18nProvider>
        </BackendStatusProvider>
      </AuthProvider>
    </NextIntlClientProvider>
  );
}
