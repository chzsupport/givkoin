import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { PageTitle } from '@/components/PageTitle';
import { DAILY_FULFILL_LIMIT, DAILY_WISH_LIMIT } from './constants';

export function GalaxyHeader({
  createdToday,
  fulfilledToday,
  isDesktop,
  localePath,
  t,
  userK,
}: {
  createdToday: number;
  fulfilledToday: number;
  isDesktop: boolean;
  localePath: (path: string) => string;
  t: (key: string) => string;
  userK: number;
}) {
  return (
    <>
      <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
        <AdaptiveAdWrapper
          page="galaxy"
          placement="galaxy_header"
          strategy="mobile_tablet_adaptive"
        />
      </div>

      <header className="flex flex-col gap-2 mb-4 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-shrink-0">
            <Link
              href={localePath('/tree')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
            >
              <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.to_tree')}
            </Link>
          </div>

          <div className="flex flex-1 basis-[18rem] min-w-0 justify-center sm:justify-end">
            <div className="flex items-stretch gap-1.5 sm:gap-0 bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur-xl shadow-2xl shadow-blue-900/20 max-w-full">
              <div className="flex-1 flex flex-col items-center justify-center px-2.5 lg:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="text-tiny uppercase tracking-[0.2em] text-neutral-500 font-black mb-0.5 whitespace-nowrap">{t('galaxy.balance')}</span>
                <div className="flex items-center gap-1">
                  <span className="text-secondary font-mono font-black text-blue-300">{userK.toLocaleString()}</span>
                  <span className="text-tiny font-bold text-blue-500/50 uppercase">K</span>
                </div>
              </div>

              <div className="hidden sm:block w-px my-2 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

              <div className="flex-1 flex flex-col items-center justify-center px-2.5 lg:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="text-tiny uppercase tracking-[0.2em] text-neutral-500 font-black mb-0.5 whitespace-nowrap">{t('galaxy.wishes')}</span>
                <div className="flex items-center gap-1">
                  <span className="text-secondary font-mono font-black text-purple-300">{createdToday}</span>
                  <span className="text-tiny font-bold text-purple-500/30">/</span>
                  <span className="text-tiny font-bold text-purple-500/50">{DAILY_WISH_LIMIT}</span>
                </div>
              </div>

              <div className="hidden sm:block w-px my-2 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

              <div className="flex-1 flex flex-col items-center justify-center px-2.5 lg:px-3 py-2 rounded-xl hover:bg-white/5 transition-colors">
                <span className="text-tiny uppercase tracking-[0.2em] text-neutral-500 font-black mb-0.5 whitespace-nowrap">{t('galaxy.fulfillments')}</span>
                <div className="flex items-center gap-1">
                  <span className="text-secondary font-mono font-black text-emerald-300">{fulfilledToday}</span>
                  <span className="text-tiny font-bold text-emerald-500/30">/</span>
                  <span className="text-tiny font-bold text-emerald-500/50">{DAILY_FULFILL_LIMIT}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <PageTitle
            title={t('galaxy.title')}
            Icon={Sparkles}
            gradientClassName="from-blue-200 via-fuchsia-300 to-cyan-200"
            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
          />
        </div>
      </header>
    </>
  );
}
