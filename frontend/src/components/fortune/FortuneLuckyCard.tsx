import { Clock, Gift } from 'lucide-react';
import type { FortuneTranslate } from './types';

type FortuneLuckyCardProps = {
    isSpinningLucky: boolean;
    luckyDayAvailable?: boolean;
    t: FortuneTranslate;
    onLuckyDraw: () => void;
};

export function FortuneLuckyCard({
    isSpinningLucky,
    luckyDayAvailable,
    t,
    onLuckyDraw,
}: FortuneLuckyCardProps) {
    const canDraw = Boolean(luckyDayAvailable) && !isSpinningLucky;

    return (
        <div className="relative bg-gradient-to-br from-purple-900/30 via-pink-900/20 to-transparent border border-purple-500/30 rounded-xl p-2.5 lg:p-3 flex-shrink-0">
            <div className="relative z-10 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border border-purple-400/30 flex items-center justify-center flex-shrink-0">
                        <Gift className="w-4 h-4 lg:w-5 lg:h-5 text-purple-300" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="text-secondary font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                            {t('fortune.personal_luck')}
                        </h3>
                        <p className="text-gray-400 text-tiny truncate">{t('fortune.daily')}</p>
                    </div>
                </div>

                <button
                    onClick={onLuckyDraw}
                    disabled={!canDraw}
                    className={`
                        px-3 lg:px-5 py-1.5 lg:py-2 rounded-lg font-bold text-secondary transition-all flex-shrink-0
                        ${canDraw
                            ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:scale-105'
                            : 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        }
                    `}
                >
                    {isSpinningLucky ? '...' : luckyDayAvailable ? (
                        <span className="flex items-center gap-1">
                            <Gift className="w-3 h-3" />
                            {t('fortune.receive')}
                        </span>
                    ) : (
                        <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {t('fortune.tomorrow')}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
