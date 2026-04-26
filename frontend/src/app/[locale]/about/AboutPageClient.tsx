'use client';

import Link from 'next/link';
import { Info } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { FloatingSideAds } from '@/components/FloatingSideAds';
import HtmlOrTextContent from '@/components/HtmlOrTextContent';
import { PageBackground } from '@/components/PageBackground';
import { PageTitle } from '@/components/PageTitle';
import { useFloatingSideAds } from '@/hooks/useFloatingSideAds';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedText, type LocalizedText } from '@/i18n/localizedContent';

type AboutPageClientProps = {
  content: LocalizedText;
};

export default function AboutPageClient({ content }: AboutPageClientProps) {
  const { adHeight, adWidth, isDesktop, pageRef, leftAdRef, rightAdRef } = useFloatingSideAds();
  const { language, t, localePath } = useI18n();
  const localizedContent = getLocalizedText(content, language);

  return (
    <div ref={pageRef} className="relative w-full text-slate-200 font-sans selection:bg-yellow-500/30">
      <PageBackground />

      <FloatingSideAds
        adHeight={adHeight}
        adWidth={adWidth}
        isDesktop={isDesktop}
        leftAdRef={leftAdRef}
        page="about"
        rightAdRef={rightAdRef}
        leftPlacement="about_sidebar_left"
        rightPlacement="about_sidebar_right"
      />

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper page="about" placement="about_header" strategy="mobile_tablet_adaptive" />
          </div>

          <header className="flex flex-col gap-2 mb-4 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="w-[120px] lg:w-[150px] flex-shrink-0">
                <Link
                  href={localePath('/tree')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.back_to_tree')}
                </Link>
              </div>

              <div />
            </div>
          </header>

          <div className="flex-1 min-h-0">
            <PageTitle
              title={t('nav.about')}
              Icon={Info}
              gradientClassName="from-white via-slate-200 to-cyan-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
              className="w-fit mx-auto mb-6"
            />
            <div className="page-content-reading rounded-2xl border border-white/10 bg-neutral-900/50 p-6 backdrop-blur-xl shadow-lg shadow-black/20">
              <HtmlOrTextContent
                content={localizedContent}
                emptyState={t('static_pages.coming_soon_text')}
                className="text-secondary text-white/70"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
