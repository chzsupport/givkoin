import { Star, Trophy, TrendingUp, Users, Zap } from 'lucide-react';
import type { FortuneStats, FortuneTranslate } from './types';

type FortuneStatsGridProps = {
    stats: FortuneStats | null;
    t: FortuneTranslate;
};

export function FortuneStatsGrid({ stats, t }: FortuneStatsGridProps) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-xl p-2 lg:p-3 flex-shrink-0">
            <h3 className="font-bold text-white text-secondary flex items-center gap-1.5 mb-2">
                <TrendingUp className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-green-400" />
                {t('fortune.stats')}
            </h3>

            <div className="grid grid-cols-2 gap-1.5 lg:gap-2">
                <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                    <Users className="w-3 h-3 lg:w-4 lg:h-4 text-blue-400 mx-auto mb-0.5" />
                    <div className="text-secondary font-bold text-white">{(((stats?.totalPlayers || 0)) / 1000).toFixed(1)}K</div>
                    <div className="text-tiny text-gray-500">{t('fortune.players')}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                    <Trophy className="w-3 h-3 lg:w-4 lg:h-4 text-yellow-400 mx-auto mb-0.5" />
                    <div className="text-secondary font-bold text-white">{(((stats?.totalWins || 0)) / 1000).toFixed(0)}K</div>
                    <div className="text-tiny text-gray-500">{t('fortune.wins')}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                    <Star className="w-3 h-3 lg:w-4 lg:h-4 text-purple-400 mx-auto mb-0.5" />
                    <div className="text-secondary font-bold text-white">{stats?.jackpotsThisMonth || 0}</div>
                    <div className="text-tiny text-gray-500">{t('fortune.jackpot')}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-1.5 lg:p-2 text-center">
                    <Zap className="w-3 h-3 lg:w-4 lg:h-4 text-green-400 mx-auto mb-0.5" />
                    <div className="text-secondary font-bold text-white">{(((stats?.avgDailyPlayers || 0)) / 1000).toFixed(1)}K</div>
                    <div className="text-tiny text-gray-500">{t('fortune.per_day')}</div>
                </div>
            </div>
        </div>
    );
}
