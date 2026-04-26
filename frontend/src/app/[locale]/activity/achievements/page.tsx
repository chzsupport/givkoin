'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { apiGet } from '@/utils/api';
import { PageTitle } from '@/components/PageTitle';
import { FloatingSideAds } from '@/components/FloatingSideAds';
import { useFloatingSideAds } from '@/hooks/useFloatingSideAds';
import { useI18n } from '@/context/I18nContext';
import {
  getGeneralAchievementCatalog,
  getSpiritualAchievementCatalog,
  type AchievementCatalogItem,
  type AchievementGroup,
} from '@/lib/achievementCatalog';

export default function ActivityAchievementsPage() {
  const { language, localePath, t } = useI18n();
  const [earnedIds, setEarnedIds] = useState<Set<number>>(() => new Set());
  const { adHeight, adWidth, isDesktop, pageRef, leftAdRef, rightAdRef } = useFloatingSideAds();
  const [activeGroup, setActiveGroup] = useState<AchievementGroup>('general');

  const achievements = useMemo<AchievementCatalogItem[]>(
    () => (activeGroup === 'spiritual'
      ? getSpiritualAchievementCatalog(language)
      : getGeneralAchievementCatalog(language)),
    [activeGroup, language],
  );

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = selectedId ? achievements.find((a) => a.id === selectedId) : null;

  useEffect(() => {
    setSelectedId(null);
  }, [activeGroup]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ ok: boolean; achievements: Array<{ achievementId: number }> }>('/achievements/my');
        if (cancelled) return;
        const ids = new Set<number>();
        (data?.achievements || []).forEach((row) => {
          const n = Number(row?.achievementId);
          if (Number.isFinite(n)) ids.add(n);
        });
        setEarnedIds(ids);
      } catch {
        if (!cancelled) setEarnedIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      ref={pageRef}
      className="relative w-full bg-[#050510] text-slate-200 font-sans selection:bg-emerald-500/30"
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#050510] to-[#050510]" />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <FloatingSideAds
        adHeight={adHeight}
        adWidth={adWidth}
        isDesktop={isDesktop}
        leftAdRef={leftAdRef}
        page="activity_achievements"
        rightAdRef={rightAdRef}
        leftPlacement="activity_achievements_sidebar_left"
        rightPlacement="activity_achievements_sidebar_right"
      />

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="activity_achievements"
              placement="activity_achievements_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          <header className="mb-3 flex-shrink-0">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={localePath('/cabinet/activity')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('common.back')}
              </Link>

              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-tiny text-white/70">
                {t('achievements_page.total')}: <span className="font-bold text-white">{achievements.length}</span>
              </div>
            </div>

            <div className="mt-3">
              <PageTitle
                title={t('achievements_page.title')}
                Icon={Trophy}
                gradientClassName="from-emerald-200 via-emerald-400 to-cyan-400"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-300"
              />
            </div>
          </header>

          <div className="mb-4 flex justify-center">
            <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => setActiveGroup('general')}
                className={`px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest transition-all ${activeGroup === 'general'
                  ? 'bg-emerald-500/25 text-emerald-100 border border-emerald-400/30'
                  : 'text-white/55 hover:text-white/80'
                  }`}
              >
                {t('achievements_page.general')}
              </button>
              <button
                type="button"
                onClick={() => setActiveGroup('spiritual')}
                className={`px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest transition-all ${activeGroup === 'spiritual'
                  ? 'bg-cyan-500/25 text-cyan-100 border border-cyan-400/30'
                  : 'text-white/55 hover:text-white/80'
                  }`}
              >
                {t('achievements_page.spiritual')}
              </button>
            </div>
          </div>

          <div className="text-tiny text-white/60 mb-4 text-center">
            {activeGroup === 'spiritual'
              ? t('achievements_page.spiritual_desc')
              : t('achievements_page.general_desc')}
          </div>

          <div className="pr-1">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {achievements.map((achievement, index) => {
                const showInlineAd = !isDesktop && (index + 1) % 10 === 0;
                const adIndex = Math.floor((index + 1) / 10);
                const earned = earnedIds.has(achievement.id);

                return (
                  <div key={achievement.id} className="contents">
                    <button
                      type="button"
                      onClick={() => setSelectedId(achievement.id)}
                      className={`text-left rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-md transition-all hover:bg-white/5 hover:border-white/20 active:scale-[0.99] ${earned ? '' : 'opacity-60 grayscale'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0">
                          <div className={`h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5 ${earned ? '' : 'opacity-80'}`}>
                            <Image
                              src={achievement.imageSrc}
                              alt={achievement.title}
                              width={64}
                              height={64}
                              className="h-16 w-16 object-cover"
                            />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-lg font-bold text-white leading-snug">{achievement.title}</div>
                          <div className="text-xs text-white/60 mt-1 leading-relaxed">{achievement.description}</div>
                        </div>
                      </div>
                    </button>

                    {showInlineAd && (
                      <div className="sm:col-span-2 lg:col-span-3 flex justify-center">
                        <AdaptiveAdWrapper
                          page="activity_achievements"
                          placement={`activity_achievements_inline_${adIndex}`}
                          strategy="mobile_tablet_adaptive"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {(() => {
            const earned = earnedIds.has(selected.id);
            return (
              <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#070716] shadow-2xl">
                <div className="flex items-start justify-between gap-3 p-4 border-b border-white/10">
                  <div className="min-w-0">
                    <div className="text-lg font-extrabold text-white leading-snug">{selected.title}</div>
                    <div className="text-xs text-white/60 mt-1 leading-relaxed">{selected.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                    aria-label={t('common.close')}
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-5 flex items-center justify-center">
                  <div className={`rounded-2xl overflow-hidden border border-white/10 bg-white/5 ${earned ? '' : 'opacity-70 grayscale'}`}>
                    <Image
                      src={selected.imageSrc}
                      alt={selected.title}
                      width={256}
                      height={256}
                      className="h-64 w-64 object-cover"
                      priority
                    />
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
