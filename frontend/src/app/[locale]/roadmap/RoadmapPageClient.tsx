'use client';

import Link from 'next/link';
import { Map } from 'lucide-react';
import { PageBackground } from '@/components/PageBackground';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import HtmlOrTextContent from '@/components/HtmlOrTextContent';
import { PageTitle } from '@/components/PageTitle';
import { FloatingSideAds } from '@/components/FloatingSideAds';
import { useFloatingSideAds } from '@/hooks/useFloatingSideAds';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedText, type LocalizedText } from '@/i18n/localizedContent';

type RoadmapPageClientProps = {
  roadmapHtml: LocalizedText;
};

export default function RoadmapPageClient({ roadmapHtml }: RoadmapPageClientProps) {
  const { adHeight, adWidth, isDesktop, pageRef, leftAdRef, rightAdRef } = useFloatingSideAds();
  const { language, t, localePath } = useI18n();
  const localizedRoadmap = getLocalizedText(roadmapHtml, language);

  return (
    <div ref={pageRef} className="relative w-full text-slate-200 font-sans selection:bg-yellow-500/30">
      <PageBackground />

      <FloatingSideAds
        adHeight={adHeight}
        adWidth={adWidth}
        isDesktop={isDesktop}
        leftAdRef={leftAdRef}
        page="roadmap"
        rightAdRef={rightAdRef}
        leftPlacement="roadmap_sidebar_left"
        rightPlacement="roadmap_sidebar_right"
      />

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper page="roadmap" placement="roadmap_header" strategy="mobile_tablet_adaptive" />
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
              title={t('nav.roadmap')}
              Icon={Map}
              gradientClassName="from-white via-slate-200 to-cyan-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
              className="w-fit mx-auto mb-4"
            />
            <div className="page-content-reading rounded-2xl border border-white/10 bg-neutral-900/50 p-6 pt-4 backdrop-blur-xl shadow-lg shadow-black/20">
              <HtmlOrTextContent
                content={localizedRoadmap}
                emptyState={t('static_pages.coming_soon_roadmap')}
                className="text-secondary text-white/70"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
