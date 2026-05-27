import { Activity, Clock, Gift, RotateCw, Target, TrendingUp } from 'lucide-react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { ROULETTE_SPIN_DURATION_SEC } from './constants';
import { RouletteBackground } from './RouletteBackground';
import { RouletteHeader } from './RouletteHeader';
import { RouletteHistoryRows } from './RouletteHistoryRows';
import { SpinButton } from './SpinButton';
import type { RouletteGlobalStats, RouletteHistoryItem, RouletteSpinMode, RouletteSpinResult, RouletteTodayWins } from './types';
import { WheelComponent } from './WheelComponent';
import { WinModal } from './WinModal';

export function RoulettePortraitView({
    backHref,
    backLabel,
    canSpin,
    globalStats,
    history,
    isSpinning,
    onRotationUpdate,
    onSpin,
    onWinClose,
    portraitWheelSize,
    rotation,
    rotationPath,
    spinMode,
    spinsLeft,
    t,
    timeUntilReset,
    title,
    todayWins,
    userK,
    userStars,
    windowWidth,
    winResult,
}: {
    backHref: string;
    backLabel: string;
    canSpin: boolean;
    globalStats: RouletteGlobalStats | null;
    history: RouletteHistoryItem[];
    isSpinning: boolean;
    onRotationUpdate: (rotation: number) => void;
    onSpin: () => void;
    onWinClose: () => void;
    portraitWheelSize: number;
    rotation: number;
    rotationPath: number[] | null;
    spinMode: RouletteSpinMode;
    spinsLeft: number;
    t: (key: string) => string;
    timeUntilReset: string;
    title: string;
    todayWins: RouletteTodayWins;
    userK: number;
    userStars?: number;
    windowWidth: number;
    winResult: RouletteSpinResult | null;
}) {
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#050510] text-slate-200">
            <RouletteBackground />

            <div className={`relative z-10 flex-1 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'}`}>
                <div className="w-full mx-auto mt-2 mb-6 flex justify-center">
                    <AdaptiveAdWrapper page="fortune/roulette" placement="inline" strategy="mobile_tablet_adaptive" />
                </div>

                <RouletteHeader
                    backHref={backHref}
                    backLabel={backLabel}
                    k={userK}
                    stars={userStars}
                    title={title}
                />

                <div className="p-3 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-lg p-2">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-caption uppercase text-yellow-400/70 font-bold">{t('fortune.tries')}</span>
                                <RotateCw className={`w-3 h-3 ${spinsLeft > 0 ? 'text-green-400' : 'text-gray-500'}`} />
                            </div>
                            <div className="text-2xl font-black text-yellow-400 font-mono">{spinsLeft}<span className="text-xs text-gray-500 ml-1">/3</span></div>
                        </div>
                        <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1"><Clock className="w-3 h-3 text-cyan-400" /><span className="text-caption uppercase text-cyan-400/70 font-bold">{t('fortune.until_reset')}</span></div>
                            <div className="text-lg font-bold text-cyan-300 font-mono">{timeUntilReset}</div>
                        </div>
                        <div className="bg-gradient-to-br from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1"><TrendingUp className="w-3 h-3 text-emerald-400" /><span className="text-caption uppercase text-emerald-400/70 font-bold">{t('fortune.won')}</span></div>
                            <div className="text-lg font-bold text-emerald-300">{todayWins.total} K</div>
                        </div>
                        <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-lg p-2">
                            <div className="flex items-center gap-1 mb-1"><Gift className="w-3 h-3 text-purple-400" /><span className="text-caption uppercase text-purple-400/70 font-bold">{t('fortune.prizes')}</span></div>
                            <div className="flex gap-1 flex-wrap">
                                <span className="text-caption bg-blue-500/20 text-blue-300 px-1 rounded">K</span>
                                <span className="text-caption bg-cyan-500/20 text-cyan-300 px-1 rounded">+1</span>
                                <span className="text-caption bg-yellow-500/20 text-yellow-300 px-1 rounded">⭐</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col items-center gap-8">
                        <WheelComponent
                            size={portraitWheelSize}
                            isSpinning={isSpinning}
                            rotation={rotation}
                            rotationPath={rotationPath}
                            spinDuration={ROULETTE_SPIN_DURATION_SEC}
                            spinMode={spinMode}
                            onRotationUpdate={onRotationUpdate}
                        />
                        <SpinButton
                            onClick={onSpin}
                            disabled={!canSpin}
                            isSpinning={isSpinning}
                            labelIdle={t('fortune.spin')}
                            labelSpinning={t('fortune.spinning')}
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-gradient-to-bl from-white/5 to-transparent border border-white/10 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-2"><Activity className="w-3 h-3 text-cyan-400" /><span className="text-xs uppercase text-cyan-400/70 font-bold">{t('fortune.history')}</span></div>
                            <div className="space-y-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                                <RouletteHistoryRows history={history} />
                            </div>
                        </div>
                        <div className="bg-gradient-to-bl from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-2"><Target className="w-3 h-3 text-emerald-400" /><span className="text-xs uppercase text-emerald-400/70 font-bold">{t('fortune.summary')}</span></div>
                            <div className="space-y-1.5 text-xs">
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.players')}:</span><span className="text-white font-bold">{globalStats?.roulette?.activeUsers || 0}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.paid_out')}:</span><span className="text-yellow-400 font-bold">{(globalStats?.roulette?.totalKIssued || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.spins')}:</span><span className="text-cyan-400 font-bold">{(globalStats?.roulette?.totalSpins || 0).toLocaleString()}</span></div>
                                <div className="flex justify-between"><span className="text-gray-400">{t('fortune.my')}:</span><span className="text-white font-bold">{todayWins.count}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <WinModal
                winResult={winResult}
                congratsLabel={t('fortune.congrats')}
                actionLabel={t('fortune.great')}
                onClose={onWinClose}
            />

            <style jsx global>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(250,204,21,0.3); border-radius: 2px; }`}</style>
        </div>
    );
}
