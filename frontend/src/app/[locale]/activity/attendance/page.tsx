'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import DailyStreakCalendar from '@/components/cabinet/DailyStreakCalendar';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { Calendar } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export default function ActivityAttendancePage() {
  const { t, localePath } = useI18n();
  const [windowWidth, setWindowWidth] = useState(0);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      setWindowWidth(w);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-amber-500/30`}
    >
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-[#050510] to-[#050510]" />
        <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex flex-1 min-h-0">
        <StickySideAdRail adSlot={sideAdSlot} page="activity_attendance" placement="activity_attendance_sidebar_left" />

        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="activity_attendance"
              placement="activity_attendance_header"
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
              <div className="w-[1px]" />
            </div>

            <div className="mt-3">
              <PageTitle
                title={t('activity_attendance.title')}
                Icon={Calendar}
                gradientClassName="from-amber-200 via-amber-400 to-orange-500"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-amber-200"
              />
            </div>
          </header>

          <div className="min-h-0 flex flex-col items-center pt-6">
            <div className="page-content-wide space-y-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
                  <div className="text-tiny uppercase tracking-[0.35em] text-amber-200/80">{t('activity_attendance.day_essence_title')}</div>
                  <div className="mt-4 space-y-3 text-sm text-white/70">
                    <div>{t('activity_attendance.day_essence_step1')}</div>
                    <div>{t('activity_attendance.day_essence_step2')}</div>
                    <div>{t('activity_attendance.day_essence_note')}</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
                  <div className="text-tiny uppercase tracking-[0.35em] text-emerald-200/80">{t('activity_attendance.day_route_title')}</div>
                  <div className="mt-4 grid gap-2">
                    <Link href={localePath('/tree')} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 hover:bg-white/10 transition-colors">
                      {t('activity_attendance.route_tree')}
                    </Link>
                    <Link href={localePath('/bridges')} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 hover:bg-white/10 transition-colors">
                      {t('activity_attendance.route_bridges')}
                    </Link>
                    <Link href={localePath('/fortune/roulette')} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75 hover:bg-white/10 transition-colors">
                      {t('activity_attendance.route_roulette')}
                    </Link>
                  </div>
                  <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
                    {t('activity_attendance.missed_day_note')}
                  </div>
                </div>
              </div>

              <DailyStreakCalendar enableWelcomeModal={false} displayMode="full" />
            </div>
          </div>
        </div>

        <StickySideAdRail adSlot={sideAdSlot} page="activity_attendance" placement="activity_attendance_sidebar_right" />
      </div>
    </div>
  );
}
