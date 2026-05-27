import Link from 'next/link';
import { HeartHandshake } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { GRATITUDE_COUNT } from './types';

type GratitudeHeaderProps = {
  localePath: (path: string) => string;
  rewardedCount: number;
  t: (key: string) => string;
};

export function GratitudeHeader({
  localePath,
  rewardedCount,
  t,
}: GratitudeHeaderProps) {
  return (
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
  );
}
