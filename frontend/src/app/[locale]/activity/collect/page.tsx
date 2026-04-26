'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { CrystalHeart } from '@/components/CrystalHeart';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useCrystal } from '@/context/CrystalContext';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';
import { useBoost } from '@/context/BoostContext';
import { apiPost } from '@/utils/api';

export default function ActivityCollectPage() {
  const { t, localePath } = useI18n();
  const boost = useBoost();
  const { collectedShards, refreshStatus, collectionDisabled, collectionDisabledMessage, rewardGranted } = useCrystal();
  const [windowWidth, setWindowWidth] = useState(0);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);
  const totalShards = 12;
  const collectedCount = collectedShards.length;
  const remainingCount = Math.max(0, totalShards - collectedCount);
  const progressPercent = Math.round((collectedCount / totalShards) * 100);

  const shardSuffix = remainingCount === 1
    ? t('activity_collect.shard_suffix_one')
    : remainingCount < 5
      ? t('activity_collect.shard_suffix_few')
      : t('activity_collect.shard_suffix_many');

  const statusLabel = rewardGranted
    ? t('activity_collect.status_restored')
    : collectionDisabled
      ? t('activity_collect.status_paused')
      : t('activity_collect.status_in_progress');

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  useEffect(() => {
    // Принудительно обновляем статус при входе на страницу
    refreshStatus();
  }, [refreshStatus]);

  // Boost: double reward after all 12 shards collected
  useEffect(() => {
    if (rewardGranted) {
      boost.offerBoost({
        type: 'collect_shards_double',
        label: t('boost.collect_shards_double.label'),
        description: t('boost.collect_shards_double.description'),
        rewardText: t('boost.collect_shards_double.reward'),
        onReward: () => {
          apiPost('/boost/claim', { type: 'collect_shards_double' }).then((res: unknown) => {
            const data = res as { ok?: boolean } | null;
            if (data?.ok) refreshStatus();
          }).catch(() => {});
        },
      });
    }
  }, [boost, refreshStatus, rewardGranted]);

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-blue-500/30`}
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-[#050510] to-[#050510]" />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        <StickySideAdRail adSlot={sideAdSlot} page="activity_collect" placement="activity_collect_sidebar_left" />

        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="activity_collect"
              placement="activity_collect_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          <header className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <Link
                href={localePath('/cabinet/activity')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
              >
                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('common.back')}
              </Link>

              <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-1 text-tiny text-white/60 sm:px-4 sm:py-1.5">
                <span>{collectedShards.length}/12 {t('activity_collect.shards')}</span>
              </div>
            </div>

            <h1 className="w-fit mx-auto text-center text-h2 font-extrabold text-blue-200 tracking-tight leading-none">
              {t('activity_collect.title')}
            </h1>
          </header>

          <div className="min-h-0 flex flex-col items-center pt-8">
            <div className="page-content-wide space-y-6">
              <div className="mx-auto w-full max-w-4xl">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center backdrop-blur-xl">
                  <CrystalHeart collectedShards={collectedShards} />

                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 px-6 py-6 text-center backdrop-blur-xl">
                    <div className="text-2xl mb-2">💎</div>
                    <div className="text-secondary font-bold text-white mb-2 uppercase tracking-widest text-sm">{t('activity_collect.crystal_heart_title')}</div>
                    <p className="text-tiny text-white/60 leading-relaxed">
                      {t('activity_collect.crystal_heart_desc')}
                    </p>
                    {collectionDisabled && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-3 bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-100 text-tiny font-bold"
                      >
                        {collectionDisabledMessage || t('activity_collect.disabled_banner_default')}
                      </motion.div>
                    )}
                    {rewardGranted && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-4 p-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-200 text-tiny font-bold uppercase"
                      >
                        {t('activity_collect.reward_granted_banner')}
                      </motion.div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
                  <div className="text-tiny uppercase tracking-[0.35em] text-blue-200/80">{t('activity_collect.progress')}</div>
                  <div className="mt-3 text-3xl font-black text-white">{progressPercent}%</div>
                  <div className="mt-2 text-sm text-white/70">
                    {t('activity_collect.collected_prefix')} <span className="font-bold text-white">{collectedCount}</span> {t('activity_collect.collected_middle')} <span className="font-bold text-white">{totalShards}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-300" style={{ width: `${progressPercent}%` }} />
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
                  <div className="text-tiny uppercase tracking-[0.35em] text-emerald-200/80">{t('activity_collect.state')}</div>
                  <div className="mt-3 text-xl font-bold text-white">{statusLabel}</div>
                  <div className="mt-3 text-sm text-white/70">
                    {rewardGranted
                      ? t('activity_collect.desc_reward_granted')
                      : collectionDisabled
                        ? (collectionDisabledMessage || t('activity_collect.desc_disabled_default'))
                        : `${t('activity_collect.desc_remaining_prefix')} ${remainingCount} ${t('activity_collect.desc_remaining_middle')} ${shardSuffix}.`}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
                  <div className="text-tiny uppercase tracking-[0.35em] text-amber-200/80">{t('activity_collect.reward_total')}</div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-tiny text-white/50">K</div>
                      <div className="mt-1 text-lg font-bold text-white">+12</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-tiny text-white/50">{t('activity_collect.lumens')}</div>
                      <div className="mt-1 text-lg font-bold text-white">+12</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="text-tiny text-white/50">{t('activity_collect.star')}</div>
                      <div className="mt-1 text-lg font-bold text-white">+0.001</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <StickySideAdRail adSlot={sideAdSlot} page="activity_collect" placement="activity_collect_sidebar_right" />
      </div>
    </div>
  );
}

