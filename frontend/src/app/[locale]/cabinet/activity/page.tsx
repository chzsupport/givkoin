'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { PageTitle } from '@/components/PageTitle';
import { Activity } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export default function CabinetActivityPage() {
  const { t, localePath } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="w-full px-4 py-6 md:px-6 md:py-8"
    >
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 text-center">
          <PageTitle
            title={t('activity.title')}
            Icon={Activity}
            gradientClassName="from-white via-slate-200 to-emerald-200"
            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-200"
            size="h3"
            className="w-fit mx-auto"
          />
          <p className="text-tiny text-white/50 mt-1">{t('activity.center')}</p>
        </div>

        <div className="w-full grid gap-3 sm:grid-cols-2">
          <Link href={localePath('/activity/achievements')} className="group">
            <div className="relative h-28 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-900/40 via-emerald-800/20 to-transparent p-4 transition-all hover:border-emerald-400/60">
              <div className="absolute right-3 top-3 text-2xl opacity-30">🏆</div>
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <div className="text-secondary font-bold text-emerald-200">{t('landing.achievements')}</div>
                  <div className="text-tiny text-white/60">{t('activity.all_desc')}</div>
                </div>
                <div className="text-tiny uppercase tracking-widest text-emerald-200/80">{t('common.open')}</div>
              </div>
            </div>
          </Link>

          <Link href={localePath('/activity/collect')} className="group">
            <div className="relative h-28 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-900/40 via-blue-800/20 to-transparent p-4 transition-all hover:border-blue-400/60">
              <div className="absolute right-3 top-3 text-2xl opacity-30">🧺</div>
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <div className="text-secondary font-bold text-blue-200">{t('activity.collection')}</div>
                  <div className="text-tiny text-white/60">{t('activity.coming_soon')}</div>
                </div>
                <div className="text-tiny uppercase tracking-widest text-blue-200/80">{t('common.open')}</div>
              </div>
            </div>
          </Link>

          <Link href={localePath('/activity/night-shift')} className="group">
            <div className="relative h-28 rounded-xl border border-purple-500/30 bg-gradient-to-br from-purple-900/40 via-purple-800/20 to-transparent p-4 transition-all hover:border-purple-400/60">
              <div className="absolute right-3 top-3 text-2xl opacity-30">🛡️</div>
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <div className="text-secondary font-bold text-purple-200">{t('landing.night_shift')}</div>
                  <div className="text-tiny text-white/60">{t('activity.defend_tree')}</div>
                </div>
                <div className="text-tiny uppercase tracking-widest text-purple-200/80">{t('common.open')}</div>
              </div>
            </div>
          </Link>

          <Link href={localePath('/activity/attendance')} className="group">
            <div className="relative h-28 rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-900/40 via-amber-800/20 to-transparent p-4 transition-all hover:border-amber-400/60">
              <div className="absolute right-3 top-3 text-2xl opacity-30">📅</div>
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <div className="text-secondary font-bold text-amber-200">{t('activity.attendance')}</div>
                  <div className="text-tiny text-white/60">{t('activity.calendar')}</div>
                </div>
                <div className="text-tiny uppercase tracking-widest text-amber-200/80">{t('common.open')}</div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
