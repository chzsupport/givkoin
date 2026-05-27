import { Gift } from 'lucide-react';
import type { FortuneStats, FortuneTranslate } from './types';

type FortuneRecentWinnersProps = {
    recentWinners?: FortuneStats['recentWinners'];
    t: FortuneTranslate;
};

export function FortuneRecentWinners({ recentWinners, t }: FortuneRecentWinnersProps) {
    return (
        <div className="flex-1 min-h-0 bg-gradient-to-br from-purple-900/20 to-transparent border border-purple-500/20 rounded-xl p-2 lg:p-3 flex flex-col">
            <h3 className="font-bold text-white text-secondary flex items-center gap-1.5 mb-2 flex-shrink-0">
                <Gift className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-purple-400" />
                {t('fortune.winners')}
            </h3>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 lg:space-y-1.5 custom-scrollbar">
                {recentWinners?.length ? (
                    recentWinners.slice(0, 5).map((winner, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-between p-1.5 lg:p-2 bg-white/5 rounded-lg text-tiny"
                        >
                            <div className="flex items-center gap-1.5">
                                <span>🎁</span>
                                <span className="text-white truncate">{winner.name}</span>
                            </div>
                            <div className="text-purple-300 font-medium flex-shrink-0">{winner.prize}</div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-tiny text-white/55">
                        {t('fortune.no_recent_winners')}
                    </div>
                )}
            </div>
        </div>
    );
}
