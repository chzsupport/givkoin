import { Calendar, Trophy } from 'lucide-react';
import type { LotteryTranslate } from './types';
import { formatLotteryCountdown } from './lotteryUtils';

type LotteryStatusCardsProps = {
    drawTimeLabel: string;
    lotteryStatus: string;
    nextDrawCountdownMs: number | null;
    t: LotteryTranslate;
};

export function LotteryStatusCards({
    drawTimeLabel,
    lotteryStatus,
    nextDrawCountdownMs,
    t,
}: LotteryStatusCardsProps) {
    return (
        <div className="grid grid-cols-2 gap-1.5 flex-shrink-0">
            <div className="bg-gradient-to-br from-blue-900/40 to-purple-900/20 border border-blue-500/30 rounded-xl p-1.5 xl:p-2">
                <div className="flex items-center gap-1 mb-0.5">
                    <Calendar className="w-3 h-3 text-blue-400" />
                    <span className="text-blue-300 font-bold text-tiny">{t('fortune.draw')}</span>
                </div>
                <div className="text-caption text-blue-100/70">
                    {t('fortune.daily_at')} {drawTimeLabel}
                </div>
                <div className="text-sm xl:text-base font-semibold text-white tabular-nums">
                    {formatLotteryCountdown(nextDrawCountdownMs, t('common.loading'))}
                </div>
                <div className="text-label text-blue-200/50">
                    {lotteryStatus === 'open' ? t('fortune.until_draw') : t('fortune.until_next')}
                </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-1.5 xl:p-2">
                <div className="flex items-center gap-1 mb-0.5">
                    <Trophy className="w-3 h-3 text-yellow-400" />
                    <span className="text-white font-bold text-tiny">{t('fortune.prizes')}</span>
                </div>
                <div className="text-tiny text-gray-400">3→150 | 4→300 | 5→600 | 6→900 | 7→1K</div>
            </div>
        </div>
    );
}
