'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { FloatingSideAds } from '@/components/FloatingSideAds';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { PageTitle } from '@/components/PageTitle';
import { HeartHandshake } from 'lucide-react';
import { apiGet, apiPost } from '@/utils/api';
import { useFloatingSideAds } from '@/hooks/useFloatingSideAds';
import { useI18n } from '@/context/I18nContext';

const STORAGE_KEY = 'givkoin_gratitude_daily_draft';
const GRATITUDE_COUNT = 3;

type GratitudeTodayResponse = {
  serverDay: string;
  completedIndexes: number[];
  rewardedCount: number;
  totalSlots: number;
  rewards?: {
    scRewardPerEntry?: number;
    starsPerEntry?: number;
    radiancePerEntry?: number;
  };
};

type GratitudeCompleteResponse = {
  ok: boolean;
  already: boolean;
  index: number;
  serverDay: string;
  completedIndexes: number[];
  awardedSc: number;
  awardedStars: number;
  user?: {
    _id?: string;
    id?: string;
    email?: string;
    nickname?: string;
    sc?: number;
    stars?: number;
  };
};

function getDraftStorageKey(serverDay: string) {
  return `${STORAGE_KEY}:${serverDay}`;
}

function loadDrafts(serverDay: string) {
  if (typeof window === 'undefined') return Array(GRATITUDE_COUNT).fill('');
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(serverDay));
    if (!raw) return Array(GRATITUDE_COUNT).fill('');
    const parsed = JSON.parse(raw);
    return Array.from({ length: GRATITUDE_COUNT }, (_, index) => String(parsed?.entries?.[index] || ''));
  } catch {
    return Array(GRATITUDE_COUNT).fill('');
  }
}

function saveDrafts(serverDay: string, entries: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getDraftStorageKey(serverDay), JSON.stringify({ entries }));
}

export default function PracticeGratitudePage() {
  const { updateUser } = useAuth();
  const toast = useToast();
  const { t, localePath } = useI18n();
  const { adHeight, adWidth, isDesktop, pageRef, leftAdRef, rightAdRef } = useFloatingSideAds();
  const [serverDay, setServerDay] = useState('');
  const [entries, setEntries] = useState<string[]>(Array(GRATITUDE_COUNT).fill(''));
  const [rewarded, setRewarded] = useState<boolean[]>(Array(GRATITUDE_COUNT).fill(false));
  const [isLoading, setIsLoading] = useState(true);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [rewardConfig, setRewardConfig] = useState<{ scRewardPerEntry: number; starsPerEntry: number }>({
    scRewardPerEntry: 5,
    starsPerEntry: 0.001,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await apiGet<GratitudeTodayResponse>('/practice/gratitude/today');
        if (cancelled) return;
        const nextRewarded = Array.from({ length: GRATITUDE_COUNT }, (_, index) => response.completedIndexes.includes(index));
        setServerDay(response.serverDay);
        setRewarded(nextRewarded);
        setEntries(loadDrafts(response.serverDay));
        setRewardConfig({
          scRewardPerEntry: Number(response.rewards?.scRewardPerEntry) || 5,
          starsPerEntry: Number(response.rewards?.starsPerEntry) || 0.001,
        });
      } catch {
        if (!cancelled) {
          toast.error(t('common.error'), t('practice_gratitude.failed_load'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [t, toast]);

  useEffect(() => {
    if (!serverDay) return;
    saveDrafts(serverDay, entries);
  }, [entries, serverDay]);

  const handleEntryChange = (index: number, value: string) => {
    setEntries((prev) => prev.map((entry, idx) => (idx === index ? value : entry)));
  };

  const handleEntrySave = async (index: number) => {
    const value = entries[index]?.trim();
    if (!value) {
      toast.error(t('practice_gratitude.empty_title'), t('practice_gratitude.empty_desc'));
      return;
    }
    if (!serverDay || rewarded[index] || savingIndex !== null) return;

    setSavingIndex(index);
    try {
      const response = await apiPost<GratitudeCompleteResponse>('/practice/gratitude/complete', { index });
      const nextRewarded = Array.from({ length: GRATITUDE_COUNT }, (_, idx) => response.completedIndexes.includes(idx));
      setRewarded(nextRewarded);
      if (response.user) {
        updateUser(response.user as Parameters<typeof updateUser>[0]);
      }
      if (response.already) {
        toast.success(t('practice_gratitude.already_saved_title'), t('practice_gratitude.already_saved_desc'));
      } else {
        toast.success(
          t('practice_gratitude.saved_title'),
          t('practice_gratitude.reward_format')
            .replace('{sc}', String(response.awardedSc))
            .replace('{stars}', String(response.awardedStars.toFixed(3)))
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('practice_gratitude.failed_save'));
    } finally {
      setSavingIndex(null);
    }
  };

  const rewardedCount = useMemo(() => rewarded.filter(Boolean).length, [rewarded]);

  return (
    <div
      ref={pageRef}
      className="relative w-full bg-[#050510] text-slate-200 font-sans selection:bg-indigo-500/30"
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-[#050510] to-[#050510]" />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <FloatingSideAds
        adHeight={adHeight}
        adWidth={adWidth}
        isDesktop={isDesktop}
        leftAdRef={leftAdRef}
        page="practice_gratitude"
        rightAdRef={rightAdRef}
        leftPlacement="practice_gratitude_sidebar_left"
        rightPlacement="practice_gratitude_sidebar_right"
      />

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="practice_gratitude"
              placement="practice_gratitude_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          <header className="flex flex-col gap-3 mb-2 flex-shrink-0">
            <div className="flex items-center justify-between w-full">
              <Link
                href={localePath('/practice')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('practice_gratitude.back_to_practice')}
              </Link>

              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-tiny text-white/70 sm:hidden">
                {t('practice_gratitude.completed_label')}: <span className="font-bold text-white">{rewardedCount}</span> / {GRATITUDE_COUNT}
              </div>
            </div>

            <PageTitle
              title={t('practice_gratitude.title')}
              Icon={HeartHandshake}
              gradientClassName="from-indigo-200 via-indigo-400 to-cyan-400"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-indigo-200"
              className="w-fit mx-auto"
            />

            <div className="hidden sm:flex justify-end">
              <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-tiny text-white/70">
                {t('practice_gratitude.completed_label')}: <span className="font-bold text-white">{rewardedCount}</span> / {GRATITUDE_COUNT}
              </div>
            </div>
          </header>

          <div className="flex items-start justify-center pb-2">
            <div className="w-full space-y-5 rounded-2xl border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-md">
              <div className="space-y-3 text-sm leading-relaxed text-white/70">
                <p>
                  {t('practice_gratitude.intro_p1')}
                </p>
                <p className="font-semibold text-white/80">{t('practice_gratitude.how_to_title')}</p>
                <ul className="space-y-1 list-disc pl-5">
                  <li>{t('practice_gratitude.how_to.step1')}</li>
                  <li>{t('practice_gratitude.how_to.step2')}</li>
                  <li>{t('practice_gratitude.how_to.step3')}</li>
                </ul>
              </div>

              {isLoading ? (
                <div className="py-10 text-center text-white/60">{t('common.loading')}</div>
              ) : (
                <div className="space-y-3">
                  {[
                    t('practice_gratitude.placeholders.p1'),
                    t('practice_gratitude.placeholders.p2'),
                    t('practice_gratitude.placeholders.p3'),
                  ].map((placeholder, index) => {
                    const isSaved = rewarded[index];
                    const isSaving = savingIndex === index;
                    return (
                      <div key={placeholder} className="space-y-2">
                        <textarea
                          rows={2}
                          placeholder={placeholder}
                          value={entries[index]}
                          onChange={(event) => handleEntryChange(index, event.target.value)}
                          readOnly={isSaved || isSaving}
                          className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none ${isSaved
                            ? 'border-emerald-400/30 bg-black/30 text-white/80'
                            : 'border-white/10 bg-black/40 focus:border-indigo-400/60'
                            }`}
                        />
                        <div className="flex flex-wrap items-center justify-end gap-3">
                          {isSaved && (
                            <div className="text-label text-emerald-300/80">
                              {t('practice_gratitude.reward_saved_format')
                                .replace('{sc}', String(rewardConfig.scRewardPerEntry))
                                .replace('{stars}', String(rewardConfig.starsPerEntry.toFixed(3)))}
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleEntrySave(index)}
                            disabled={isSaved || isSaving || !entries[index].trim()}
                            className={`rounded-full border px-4 py-1.5 text-tiny font-semibold uppercase tracking-widest transition-all ${isSaved
                              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200 cursor-default'
                              : 'border-white/20 bg-white/10 text-white/80 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50'
                              }`}
                          >
                            {isSaving ? t('practice_gratitude.saving') : t('common.done')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="text-tiny text-white/50 text-center">
                {t('practice_gratitude.draft_note')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

