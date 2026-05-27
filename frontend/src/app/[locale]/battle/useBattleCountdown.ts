'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BattlePerformanceTier } from './useBattleEnvironment';

function getCountdownTickMs(isTabVisible: boolean, performanceTier: BattlePerformanceTier) {
    if (!isTabVisible) return 5000;
    return performanceTier === 'high' ? 1000 : 1500;
}

export function useBattleCountdown({
    battleEndsAtMs,
    isBattleActive,
    isTabVisible,
    performanceTier,
    serverOffsetMsRef,
    setBattleTimeLeftMs,
}: {
    battleEndsAtMs: number | null;
    isBattleActive: boolean;
    isTabVisible: boolean;
    performanceTier: BattlePerformanceTier;
    serverOffsetMsRef: MutableRefObject<number>;
    setBattleTimeLeftMs: Dispatch<SetStateAction<number>>;
}) {
    useEffect(() => {
        if (!isBattleActive || !battleEndsAtMs) {
            setBattleTimeLeftMs(0);
            return;
        }

        const tick = () => {
            const nowByServer = Date.now() + serverOffsetMsRef.current;
            setBattleTimeLeftMs(Math.max(0, battleEndsAtMs - nowByServer));
        };

        tick();
        const interval = window.setInterval(tick, getCountdownTickMs(isTabVisible, performanceTier));
        return () => window.clearInterval(interval);
    }, [battleEndsAtMs, isBattleActive, isTabVisible, performanceTier, serverOffsetMsRef, setBattleTimeLeftMs]);
}
