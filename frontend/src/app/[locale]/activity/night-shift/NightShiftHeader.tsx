import Link from 'next/link';
import { Clock, Shield } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { formatNightShiftDuration } from './nightShiftTime';

type NightShiftHeaderProps = {
    activityHref: string;
    isServing: boolean;
    shiftCountdownMs: number;
    elapsedTime: number;
    onStartShift: () => void;
    onEndShift: () => void;
    t: (key: string) => string;
};

export function NightShiftHeader({
    activityHref,
    isServing,
    shiftCountdownMs,
    elapsedTime,
    onStartShift,
    onEndShift,
    t,
}: NightShiftHeaderProps) {
    return (
        <header className="flex flex-col items-center gap-4 mb-8 relative">
            <div className="w-full flex items-center justify-between mb-4">
                <Link
                    href={activityHref}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                    <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('gen.s0')}
                </Link>
                <div className="flex-1" />
            </div>

            <PageTitle
                title={t('night_shift.title')}
                Icon={Shield}
                gradientClassName="from-purple-200 via-purple-400 to-pink-400"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-purple-300"
                className="w-fit mx-auto"
            />

            <div className="inline-flex gap-3">
                <button
                    onClick={!isServing ? onStartShift : undefined}
                    className={`
                        px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border
                        ${isServing
                            ? 'bg-purple-500/25 text-purple-100 border-purple-400/30 shadow-[0_0_15px_rgba(168,85,247,0.35)] translate-y-[2px]'
                            : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white/85 active:translate-y-[2px]'}
                        ${isServing ? 'cursor-default' : 'cursor-pointer'}
                    `}
                >
                    {t('night_shift.post_taken')}
                </button>

                <button
                    onClick={isServing ? onEndShift : undefined}
                    className={`
                        px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border
                        ${isServing
                            ? 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white/85 active:translate-y-[2px]'
                            : 'bg-white/5 text-white/35 border-white/10 opacity-60 cursor-not-allowed'}
                    `}
                >
                    {t('night_shift.post_handed_over')}
                </button>
            </div>

            {!isServing && (
                <div className="w-full max-w-[360px] rounded-2xl border border-purple-400/20 bg-black/35 px-5 py-4 text-center shadow-[0_0_24px_rgba(168,85,247,0.12)] backdrop-blur-md">
                    <div className="flex flex-wrap items-center justify-center gap-2 text-tiny uppercase tracking-[0.2em] text-purple-200/80">
                        <Clock className="h-4 w-4 text-purple-300" />
                        <span>{shiftCountdownMs <= 0 ? t('night_shift.shift_available') : t('night_shift.until_shift_start')}</span>
                    </div>
                    <div className="mt-2 font-mono text-3xl font-bold text-white">
                        {formatNightShiftDuration(shiftCountdownMs)}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                        {t('night_shift.shift_start_time')}
                    </div>
                </div>
            )}

            {isServing && (
                <div className="font-mono text-xl text-purple-300 animate-pulse">
                    {formatNightShiftDuration(elapsedTime)}
                </div>
            )}
        </header>
    );
}
