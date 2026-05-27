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
        plannedSpins,
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
        handleRotationUpdate,
        handleSpin,
        isSpinning,
        rotation,
        rotationPath,
        setWinResult,
        spinMode,
        winResult,
    } = useRouletteSpin({
        fetchGlobalStats,
        fetchUserStats,
        plannedSpins,
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
                onRotationUpdate={handleRotationUpdate}
                onSpin={handleSpin}
                onWinClose={() => setWinResult(null)}
                rotation={rotation}
                rotationPath={rotationPath}
                sideAdSlot={sideAdSlot}
                spinMode={spinMode}
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
            onRotationUpdate={handleRotationUpdate}
            onSpin={handleSpin}
            onWinClose={() => setWinResult(null)}
            portraitWheelSize={portraitWheelSize}
            rotation={rotation}
            rotationPath={rotationPath}
            spinMode={spinMode}
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

