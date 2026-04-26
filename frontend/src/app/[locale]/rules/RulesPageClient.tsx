'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { FloatingSideAds } from '@/components/FloatingSideAds';
import HtmlOrTextContent from '@/components/HtmlOrTextContent';
import { PageBackground } from '@/components/PageBackground';
import { PageTitle } from '@/components/PageTitle';
import { useFloatingSideAds } from '@/hooks/useFloatingSideAds';
import type { PageTextBundle } from '@/utils/pageTextStore';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedText } from '@/i18n/localizedContent';

type RulesTab = 'battle' | 'site' | 'communication';

type RulesPageClientProps = {
  rules: PageTextBundle['rules'];
};

const HTML_TAG_PATTERN = /<\/?[a-z][\s\S]*>/i;

export default function RulesPageClient({ rules }: RulesPageClientProps) {
  const [activeTab, setActiveTab] = useState<RulesTab>('battle');
  const { adHeight, adWidth, isDesktop, pageRef, leftAdRef, rightAdRef } = useFloatingSideAds();
  const { language, t, localePath } = useI18n();
  const activeContent = activeTab === 'battle'
    ? rules.battle
    : activeTab === 'site'
      ? rules.site
      : rules.communication;
  const localizedContent = getLocalizedText(activeContent, language);
  const activeContentIsHtml = HTML_TAG_PATTERN.test(localizedContent.trim());
  const contentClassName = activeContentIsHtml
    ? 'mt-6 text-white/70'
    : 'mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-white/70';

  return (
    <div ref={pageRef} className="relative w-full text-slate-200 font-sans selection:bg-yellow-500/30">
      <PageBackground />

      <FloatingSideAds
        adHeight={adHeight}
        adWidth={adWidth}
        isDesktop={isDesktop}
        leftAdRef={leftAdRef}
        page="rules"
        rightAdRef={rightAdRef}
        leftPlacement="rules_sidebar_left"
        rightPlacement="rules_sidebar_right"
      />

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper page="rules" placement="rules_header" strategy="mobile_tablet_adaptive" />
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
              title={t('nav.rules')}
              Icon={ScrollText}
              gradientClassName="from-white via-slate-200 to-emerald-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-200"
              className="w-fit mx-auto mb-6"
            />
            <div className="page-content-expanded rounded-2xl border border-white/10 bg-neutral-900/50 p-4 sm:p-6 backdrop-blur-xl shadow-lg shadow-black/20">
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('battle')}
                  className={`px-4 py-2 rounded-xl text-tiny font-bold uppercase tracking-widest transition-all ${activeTab === 'battle'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5 border border-white/10'}`}
                >
                  {t('battle.rules')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('site')}
                  className={`px-4 py-2 rounded-xl text-tiny font-bold uppercase tracking-widest transition-all ${activeTab === 'site'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5 border border-white/10'}`}
                >
                  {t('rules.site_rules')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('communication')}
                  className={`px-4 py-2 rounded-xl text-tiny font-bold uppercase tracking-widest transition-all ${activeTab === 'communication'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5 border border-white/10'}`}
                >
                  {t('rules.communication_rules')}
                </button>
              </div>

              <div className={contentClassName}>
                <HtmlOrTextContent content={localizedContent} className="text-secondary text-white/70" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
