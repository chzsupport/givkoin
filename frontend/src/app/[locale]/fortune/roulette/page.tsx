'use client';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';
import { RouletteLandscapeView } from '@/components/roulette/RouletteLandscapeView';
import { RoulettePortraitView } from '@/components/roulette/RoulettePortraitView';
import { useRouletteHistory } from '@/components/roulette/useRouletteHistory';
import { useRouletteLayout } from '@/components/roulette/useRouletteLayout';
import { useRouletteSpin } from '@/components/roulette/useRouletteSpin';
import { useRouletteStats } from '@/components/roulette/useRouletteStats';
import { useRouletteTimer } from '@/components/roulette/useRouletteTimer';

export default function RoulettePage() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const { t, localePath } = useI18n();
    const { history, recordSpinHistory } = useRouletteHistory(user?._id);
    const {
        fetchGlobalStats,
        fetchUserStats,
        globalStats,
        nextResetAt,
        setPlannedSpins,
        setSpinsLeft,
        setTodayWins,
        spinsLeft,
        todayWins,
    } = useRouletteStats({ refreshUser, user });
    const {
        isLandscape,
        portraitWheelSize,
        landscapeWheelSize,
        windowWidth,
        sideAdSlot,
    } = useRouletteLayout();
    const {
        handleSpin,
        handleSpinComplete,
        isSpinning,
        rotation,
        spinAnimation,
        setWinResult,
        winResult,
    } = useRouletteSpin({
        fetchGlobalStats,
        fetchUserStats,
        recordSpinHistory,
        refreshUser,
        setPlannedSpins,
        setSpinsLeft,
        setTodayWins,
        spinsLeft,
        t,
        toast,
        user,
    });
    const timeUntilReset = useRouletteTimer(nextResetAt, isSpinning);

    if (isLandscape) {
        return (
            <RouletteLandscapeView
                backHref={localePath('/fortune')}
                backLabel={t('common.back')}
                canSpin={!isSpinning && Boolean(user) && spinsLeft > 0}
                globalStats={globalStats}
                history={history}
                isSpinning={isSpinning}
                landscapeWheelSize={landscapeWheelSize}
                onSpin={handleSpin}
                onSpinComplete={handleSpinComplete}
                onWinClose={() => setWinResult(null)}
                rotation={rotation}
                spinAnimation={spinAnimation}
                sideAdSlot={sideAdSlot}
                spinsLeft={spinsLeft}
                t={t}
                timeUntilReset={timeUntilReset}
                title={t('fortune.roulette_title')}
                todayWins={todayWins}
                userK={user?.k ?? 0}
                userStars={user?.stars}
                winResult={winResult}
            />
        );
    }

    return (
        <RoulettePortraitView
            backHref={localePath('/fortune')}
            backLabel={t('common.back')}
            canSpin={!isSpinning && Boolean(user) && spinsLeft > 0}
            globalStats={globalStats}
            history={history}
            isSpinning={isSpinning}
            onSpin={handleSpin}
            onSpinComplete={handleSpinComplete}
            onWinClose={() => setWinResult(null)}
            portraitWheelSize={portraitWheelSize}
            rotation={rotation}
            spinAnimation={spinAnimation}
            spinsLeft={spinsLeft}
            t={t}
            timeUntilReset={timeUntilReset}
            title={t('fortune.roulette_title')}
            todayWins={todayWins}
            userK={user?.k ?? 0}
            userStars={user?.stars}
            windowWidth={windowWidth}
            winResult={winResult}
        />
    );
}

