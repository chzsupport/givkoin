import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageBackground } from '@/components/PageBackground';
import { buildNoIndexMetadata } from '@/lib/seo';
import ConfirmClient from './ConfirmClient';

export const metadata: Metadata = buildNoIndexMetadata();

export default async function ConfirmPage({ params }: { params: { locale: string } }) {
  const locale = params.locale === 'en' ? 'en' : 'ru';
  const t = await getTranslations({ locale, namespace: 'confirm' });

  return (
    <>
      <PageBackground />
      <Suspense
        fallback={(
          <div className="flex min-h-[calc(100vh-theme(spacing.20))] items-center justify-center px-4 py-12">
            <div className="card-glow w-full max-w-xl backdrop-blur-xl border-white/10 bg-black/40 p-8 sm:p-10">
              <h1 className="text-h1 text-white">{t('email_confirmation')}</h1>
              <p className="mt-3 text-body text-white/70">{t('processing_link')}</p>
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 px-4 py-5 text-white/90">
                <span className="text-body text-white/70 flex items-center gap-2">⏳ {t('checking_token')}</span>
              </div>
            </div>
          </div>
        )}
      >
        <ConfirmClient />
      </Suspense>
    </>
  );
}
