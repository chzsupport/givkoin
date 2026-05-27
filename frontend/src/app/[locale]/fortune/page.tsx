'use client';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useI18n } from '@/context/I18nContext';
import { FortuneBackground } from '@/components/fortune/FortuneBackground';
import { FortuneGameCards } from '@/components/fortune/FortuneGameCards';
import { FortuneHeader } from '@/components/fortune/FortuneHeader';
import { FortuneLeaderboard } from '@/components/fortune/FortuneLeaderboard';
import { FortuneLuckyCard } from '@/components/fortune/FortuneLuckyCard';
import { FortuneLuckyResultModal } from '@/components/fortune/FortuneLuckyResultModal';
import { FortuneRecentWinners } from '@/components/fortune/FortuneRecentWinners';
import { FortuneStatsGrid } from '@/components/fortune/FortuneStatsGrid';
import { useFortuneLayout } from '@/components/fortune/useFortuneLayout';
import { useFortuneLuckyDraw } from '@/components/fortune/useFortuneLuckyDraw';
import { useFortuneStatus } from '@/components/fortune/useFortuneStatus';

export default function FortunePage() {
    const { user, refreshUser, updateUser } = useAuth();
    const toast = useToast();
    const { localePath, t } = useI18n();
    const { isDesktop, isLandscape, sideAdSlot, windowWidth } = useFortuneLayout();
    const { fetchSpinsAndTickets, fetchStats, spinsLeft, stats, ticketsToday } = useFortuneStatus({ updateUser, user });
    const {
        closeLuckyResult,
        handleLuckyDraw,
        isSpinningLucky,
        luckyPrize,
        showLuckyResult,
    } = useFortuneLuckyDraw({
        fetchSpinsAndTickets,
        fetchStats,
        refreshUser,
        t,
        toast,
        updateUser,
        user,
    });

    return (
        <div className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-yellow-500/30`}>
            <FortuneBackground />

            {/* Основной контейнер */}
            <div className="relative z-10 flex flex-1 min-h-0">
                {/* Левый рекламный блок - показываем только в ландшафтном режиме на больших экранах */}
                <StickySideAdRail adSlot={sideAdSlot} page="fortune" placement="fortune_sidebar_left" />

                {/* Центральный контент */}
                <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
                    {/* MOBILE AD BLOCK - Dynamic sizes for Tablets/Mobile. Скрываем в ландшафтном режиме на больших экранах */}
                    <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
                        <AdaptiveAdWrapper
                            page="fortune"
                            placement="fortune_header"
                            strategy="mobile_tablet_adaptive"
                        />
                    </div>

                    {/* Хедер страницы */}
                    <FortuneHeader
                        treeHref={localePath('/tree')}
                        userK={user?.k ?? 0}
                        userStars={user?.stars}
                        t={t}
                    />

                    {/* Грид контента - на планшетах в портрете всегда 1 колонка, на десктопе 2-3 */}
                    <div className={`flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 ${isLandscape ? '2xl:grid-cols-3' : ''} gap-2 lg:gap-3`}>
                        {/* Левая колонка - занимает всю ширину на мобильных/планшетах */}
                        <div className={`flex flex-col gap-2 min-h-0 ${isLandscape ? '2xl:col-span-2' : 'col-span-1'}`}>
                            <FortuneGameCards
                                lotteryHref={localePath('/fortune/lottery')}
                                rouletteHref={localePath('/fortune/roulette')}
                                spinsLeft={spinsLeft}
                                ticketsToday={ticketsToday}
                                t={t}
                            />

                            <FortuneLuckyCard
                                isSpinningLucky={isSpinningLucky}
                                luckyDayAvailable={user?.luckyDayAvailable}
                                t={t}
                                onLuckyDraw={handleLuckyDraw}
                            />

                            <FortuneLeaderboard leaderboard={stats?.leaderboard} t={t} />
                        </div>

                        {/* Правая колонка - всегда 1 колонка из 2 в портрете, блоки стопкой */}
                        <div className="flex flex-col gap-2 min-h-0 col-span-1">
                            <FortuneStatsGrid stats={stats} t={t} />
                            <FortuneRecentWinners recentWinners={stats?.recentWinners} t={t} />
                        </div>
                    </div>
                </div>

                {/* Правый рекламный блок - показываем только в ландшафтном режиме */}
                <StickySideAdRail adSlot={sideAdSlot} page="fortune" placement="fortune_sidebar_right" />
            </div>

            <FortuneLuckyResultModal
                isOpen={showLuckyResult}
                prize={luckyPrize}
                onClose={closeLuckyResult}
                t={t}
            />
        </div>
    );
}

