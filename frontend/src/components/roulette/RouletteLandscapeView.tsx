import { Activity, Clock, Gift, RotateCw, Target, TrendingUp } from 'lucide-react';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import type { SideAdSlot } from '@/utils/sideAdSlot';
import { ROULETTE_SPIN_DURATION_SEC } from './constants';
import { RouletteBackground } from './RouletteBackground';
import { RouletteHeader } from './RouletteHeader';
import { RouletteHistoryRows } from './RouletteHistoryRows';
import { SpinButton } from './SpinButton';
import type { RouletteGlobalStats, RouletteHistoryItem, RouletteSpinMode, RouletteSpinResult, RouletteTodayWins } from './types';
import { WheelComponent } from './WheelComponent';
import { WinModal } from './WinModal';

export function RouletteLandscapeView({
    backHref,
    backLabel,
    canSpin,
    globalStats,
    history,
    isSpinning,
    landscapeWheelSize,
    onRotationUpdate,
    onSpin,
    onWinClose,
    rotation,
    rotationPath,
    sideAdSlot,
    spinMode,
    spinsLeft,
    t,
    timeUntilReset,
    title,
    todayWins,
    userK,
    userStars,
    winResult,
}: {
    backHref: string;
    backLabel: string;
    canSpin: boolean;
    globalStats: RouletteGlobalStats | null;
    history: RouletteHistoryItem[];
    isSpinning: boolean;
    landscapeWheelSize: number;
    onRotationUpdate: (rotation: number) => void;
    onSpin: () => void;
    onWinClose: () => void;
    rotation: number;
    rotationPath: number[] | null;
    sideAdSlot: SideAdSlot | null;
    spinMode: RouletteSpinMode;
    spinsLeft: number;
    t: (key: string) => string;
    timeUntilReset: string;
    title: string;
    todayWins: RouletteTodayWins;
    userK: number;
    userStars?: number;
    winResult: RouletteSpinResult | null;
}) {
    return (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#050510] text-slate-200">
            <RouletteBackground />

            <div className="relative z-10 flex flex-1 min-h-0 overflow-hidden">
                <StickySideAdRail
                    adSlot={sideAdSlot}
                    page="fortune/roulette"
                    placement="sidebar"
                    panelClassName="from-yellow-500/5 to-transparent border-yellow-500/10"
                    dividerClassName="border-yellow-500/5"
                />

                <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
                    <RouletteHeader
                        backHref={backHref}
                        backLabel={backLabel}
                        k={userK}
                        large
                        stars={userStars}
                        title={title}
                    />

                    <div className="flex-1 grid grid-cols-[200px_1fr_200px] 2xl:grid-cols-[350px_1fr_350px] gap-3 px-4 py-2 min-h-0 overflow-hidden items-center">
                        <div className="flex flex-col gap-2 2xl:gap-4 min-h-0 self-center">
                            <div className="bg-gradient-to-br from-yellow-500/10 to-transparent border border-yellow-500/20 rounded-lg p-2 2xl:p-4">
                                <div className="flex items-center justify-between mb-1 2xl:mb-2">
                                    <span className="text-caption xl:text-xs 2xl:text-sm uppercase tracking-wider text-yellow-400/70 font-bold">{t('fortune.tries')}</span>
                                    <RotateCw className={`w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 ${spinsLeft > 0 ? 'text-green-400' : 'text-gray-500'}`} />
                                </div>
                                <div className="text-2xl xl:text-3xl 2xl:text-5xl font-black text-yellow-400 font-mono">{spinsLeft}<span className="text-xs xl:text-sm 2xl:text-lg text-gray-500 ml-1">/3</span></div>
                            </div>
                            <div className="bg-gradient-to-br from-cyan-500/10 to-transparent border border-cyan-500/20 rounded-lg p-2 2xl:p-4">
                                <div className="flex items-center gap-1 mb-1 2xl:mb-2"><Clock className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-cyan-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-cyan-400/70 font-bold">{t('fortune.until_reset')}</span></div>
                                <div className="text-lg xl:text-xl 2xl:text-3xl font-bold text-cyan-300 font-mono">{timeUntilReset}</div>
                            </div>
                            <div className="bg-gradient-to-br from-purple-500/10 to-transparent border border-purple-500/20 rounded-lg p-2 2xl:p-4">
                                <div className="flex items-center gap-1 mb-1 2xl:mb-2"><Gift className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-purple-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-purple-400/70 font-bold">{t('fortune.prizes')}</span></div>
                                <div className="grid grid-cols-3 gap-1 text-caption xl:text-xs 2xl:text-sm">
                                    <div className="bg-blue-500/20 border border-blue-500/30 rounded px-1 py-0.5 2xl:px-2 2xl:py-1 text-center text-blue-300 font-bold">1-100 K</div>
                                    <div className="bg-cyan-500/20 border border-cyan-500/30 rounded px-1 py-0.5 2xl:px-2 2xl:py-1 text-center text-cyan-300 font-bold">+1</div>
                                    <div className="bg-yellow-500/20 border border-yellow-500/30 rounded px-1 py-0.5 2xl:px-2 2xl:py-1 text-center text-yellow-300 font-bold">0.1⭐</div>
                                </div>
                            </div>
                            <div className="bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-lg p-2 2xl:p-4">
                                <div className="flex items-center gap-1 mb-2 2xl:mb-3"><TrendingUp className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-emerald-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-emerald-400/70 font-bold">{t('fortune.stats')}</span></div>
                                <div className="space-y-1 text-xs xl:text-sm 2xl:text-base">
                                    <div className="flex justify-between"><span className="text-gray-400">{t('fortune.total')}:</span><span className="text-white font-bold">{todayWins.count}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">{t('fortune.won')}:</span><span className="text-yellow-400 font-bold">{todayWins.total}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">{t('fortune.best')}:</span><span className="text-green-400 font-bold">{todayWins.best}</span></div>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col items-center justify-center gap-6 2xl:gap-10">
                            <WheelComponent
                                size={landscapeWheelSize}
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
                                scale={Math.max(1, landscapeWheelSize / 350)}
                            />
                        </div>

                        <div className="flex flex-col gap-2 2xl:gap-4 min-h-0 self-center">
                            <div className="bg-gradient-to-bl from-white/5 to-transparent border border-white/10 rounded-lg p-2 2xl:p-4 flex flex-col min-h-0">
                                <div className="flex items-center gap-1 mb-2 2xl:mb-3"><Activity className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-cyan-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-cyan-400/70 font-bold">{t('fortune.history')}</span></div>
                                <div className="space-y-1 overflow-y-auto custom-scrollbar min-h-0 max-h-[160px] 2xl:max-h-[300px]">
                                    <RouletteHistoryRows history={history} />
                                </div>
                            </div>
                            <div className="bg-gradient-to-bl from-emerald-500/10 to-transparent border border-emerald-500/20 rounded-lg p-2 2xl:p-4">
                                <div className="flex items-center gap-1 mb-1 2xl:mb-2"><Target className="w-3 h-3 xl:w-4 xl:h-4 2xl:w-5 2xl:h-5 text-emerald-400" /><span className="text-caption xl:text-xs 2xl:text-sm uppercase text-emerald-400/70 font-bold">{t('fortune.summary')}</span></div>
                                <div className="space-y-1 text-xs xl:text-sm 2xl:text-base">
                                    <div className="flex justify-between"><span className="text-gray-400">{t('fortune.players')}:</span><span className="text-white font-bold">{globalStats?.roulette?.activeUsers || 0}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">{t('fortune.paid_out')}:</span><span className="text-yellow-400 font-bold">{(globalStats?.roulette?.totalKIssued || 0).toLocaleString()}</span></div>
                                    <div className="flex justify-between"><span className="text-gray-400">{t('fortune.spins')}:</span><span className="text-cyan-400 font-bold">{(globalStats?.roulette?.totalSpins || 0).toLocaleString()}</span></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <StickySideAdRail
                    adSlot={sideAdSlot}
                    page="fortune/roulette"
                    placement="sidebar"
                    panelClassName="from-yellow-500/5 to-transparent border-yellow-500/10"
                    dividerClassName="border-yellow-500/5"
                />

                <WinModal
                    winResult={winResult}
                    congratsLabel={t('fortune.congrats')}
                    actionLabel={t('fortune.great')}
                    large
                    onClose={onWinClose}
                />

                <style jsx global>{`.custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(250,204,21,0.3); border-radius: 2px; }`}</style>
            </div>
        </div>
    );
}
