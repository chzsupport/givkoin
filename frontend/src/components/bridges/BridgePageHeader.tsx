'use client';

import Link from 'next/link';
import { Zap } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { PageTitle } from '@/components/PageTitle';
import { formatUserK } from '@/utils/formatters';

type BridgePageHeaderProps = {
  t: (key: string) => string;
  localePath: (path: string) => string;
  isDesktop: boolean;
  userK: number;
  totalStones: number;
  activeBridgesCount: number;
  builtBridgesCount: number;
};

export function BridgePageHeader({
  t,
  localePath,
  isDesktop,
  userK,
  totalStones,
  activeBridgesCount,
  builtBridgesCount,
}: BridgePageHeaderProps) {
  return (
    <>
      <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
        <AdaptiveAdWrapper
          page="bridges"
          placement="bridges_header"
          strategy="mobile_tablet_adaptive"
        />
      </div>

      <header className="flex flex-col gap-2 mb-4 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-shrink-0">
            <Link
              href={localePath('/tree')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
            >
              <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.to_tree')}
            </Link>
          </div>

          <div className="flex flex-1 basis-[22rem] min-w-0 justify-center sm:justify-end">
            <div className="flex items-center justify-between lg:justify-start gap-2 sm:gap-0 bg-white/5 border border-white/10 rounded-2xl p-0.5 backdrop-blur-xl shadow-lg max-w-full">
              <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.balance')}</span>
                <span className="text-secondary font-mono font-black text-blue-300">{formatUserK(userK)} <span className="text-tiny text-blue-500/50">K</span></span>
              </div>

              <div className="w-px h-5 lg:h-6 bg-white/10" />
              <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.stones')}</span>
                <span className="text-secondary font-mono font-black text-purple-300">{totalStones.toLocaleString()}</span>
              </div>

              <div className="w-px h-5 lg:h-6 bg-white/10" />
              <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.building')}</span>
                <span className="text-secondary font-mono font-black text-yellow-400">{activeBridgesCount}</span>
              </div>

              <div className="w-px h-5 lg:h-6 bg-white/10" />
              <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.done')}</span>
                <span className="text-secondary font-mono font-black text-green-400">{builtBridgesCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center">
          <PageTitle
            title={t('bridges.title')}
            Icon={Zap}
            gradientClassName="from-blue-200 via-blue-400 to-purple-500"
            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-blue-300"
          />
        </div>
      </header>
    </>
  );
}
