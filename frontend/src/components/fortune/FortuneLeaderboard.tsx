import { Crown, Trophy } from 'lucide-react';
import type { FortuneStats, FortuneTranslate } from './types';

type FortuneLeaderboardProps = {
    leaderboard?: FortuneStats['leaderboard'];
    t: FortuneTranslate;
};

export function FortuneLeaderboard({ leaderboard, t }: FortuneLeaderboardProps) {
    return (
        <div className="flex-1 min-h-0 bg-white/5 border border-white/10 rounded-xl p-2 lg:p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <h3 className="font-bold text-white text-secondary flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-yellow-400" />
                    {t('fortune.leaders')}
                </h3>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 lg:space-y-1.5 custom-scrollbar">
                {leaderboard?.length ? (
                    leaderboard.map((entry, idx) => (
                        <div
                            key={idx}
                            className={`
                            flex items-center gap-2 p-1.5 lg:p-2 rounded-lg text-tiny
                            ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-transparent border border-yellow-500/30' :
                                    idx === 1 ? 'bg-gradient-to-r from-gray-400/10 to-transparent border border-gray-400/20' :
                                        idx === 2 ? 'bg-gradient-to-r from-orange-600/10 to-transparent border border-orange-600/20' :
                                            'bg-white/5 border border-transparent'
                                }
                            `}
                        >
                            <div className={`
                            w-5 h-5 lg:w-6 lg:h-6 rounded flex items-center justify-center font-bold text-tiny flex-shrink-0
                            ${idx === 0 ? 'bg-yellow-500/30 text-yellow-300' :
                                    idx === 1 ? 'bg-gray-400/30 text-gray-300' :
                                        idx === 2 ? 'bg-orange-600/30 text-orange-300' :
                                            'bg-white/10 text-gray-400'
                                }
                            `}>
                                {idx === 0 ? <Crown className="w-2.5 h-2.5" /> : entry.rank}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="font-medium text-white text-tiny lg:text-tiny truncate">{entry.name}</div>
                            </div>
                            <div className="text-yellow-400 font-bold text-tiny lg:text-tiny flex-shrink-0">{entry.wins.toLocaleString()}</div>
                        </div>
                    ))
                ) : (
                    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-center text-tiny text-white/55">
                        {t('fortune.no_leader_data')}
                    </div>
                )}
            </div>
        </div>
    );
}
