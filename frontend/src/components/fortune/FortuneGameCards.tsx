import Link from 'next/link';
import { ChevronRight, Sparkles, Ticket } from 'lucide-react';
import type { FortuneTranslate } from './types';

type FortuneGameCardsProps = {
    lotteryHref: string;
    rouletteHref: string;
    spinsLeft: number;
    ticketsToday: number;
    t: FortuneTranslate;
};

export function FortuneGameCards({
    lotteryHref,
    rouletteHref,
    spinsLeft,
    ticketsToday,
    t,
}: FortuneGameCardsProps) {
    return (
        <div className="grid grid-cols-2 gap-2 flex-shrink-0">
            <Link href={rouletteHref} className="group">
                <div className="relative h-24 lg:h-28 bg-gradient-to-br from-yellow-900/40 via-yellow-800/20 to-transparent border border-yellow-500/30 rounded-xl p-3 cursor-pointer transition-all hover:border-yellow-500/60">
                    <div className="absolute right-2 bottom-2 opacity-15">
                        <Sparkles className="w-12 h-12 text-yellow-400" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-6 h-6 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                                    <Sparkles className="w-3 h-3 text-yellow-400" />
                                </div>
                                <h3 className="text-secondary font-bold text-yellow-400">{t('fortune.roulette')}</h3>
                            </div>
                            <p className="text-gray-400 text-tiny">{t('fortune.roulette_spins_per_day')}</p>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 text-tiny">
                                {spinsLeft}/3
                            </div>
                            <ChevronRight className="w-4 h-4 text-yellow-400" />
                        </div>
                    </div>
                </div>
            </Link>

            <Link href={lotteryHref} className="group">
                <div className="relative h-24 lg:h-28 bg-gradient-to-br from-blue-900/40 via-blue-800/20 to-transparent border border-blue-500/30 rounded-xl p-3 cursor-pointer transition-all hover:border-blue-500/60">
                    <div className="absolute right-2 bottom-2 opacity-15">
                        <Ticket className="w-12 h-12 text-blue-400" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
                                    <Ticket className="w-3 h-3 text-blue-400" />
                                </div>
                                <h3 className="text-secondary font-bold text-blue-400">{t('fortune.lottery')}</h3>
                            </div>
                            <p className="text-gray-400 text-tiny">{t('fortune.lottery_schedule')}</p>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-tiny">
                                {ticketsToday}/10
                            </div>
                            <ChevronRight className="w-4 h-4 text-blue-400" />
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    );
}
