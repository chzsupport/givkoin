'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { BattleSparkState } from './battleTypes';
import type { BattlePerformanceTier } from './useBattleEnvironment';

function getSparkTickMs(performanceTier: BattlePerformanceTier) {
    if (performanceTier === 'high') return 60;
    if (performanceTier === 'medium') return 90;
    return 120;
}

export function useBattleSparkMotion({
    spark,
    isTabVisible,
    performanceTier,
    processedSparkIdsRef,
    setSpark,
}: {
    spark: BattleSparkState | null;
    isTabVisible: boolean;
    performanceTier: BattlePerformanceTier;
    processedSparkIdsRef: MutableRefObject<Set<string>>;
    setSpark: Dispatch<SetStateAction<BattleSparkState | null>>;
}) {
    useEffect(() => {
        if (!spark || !isTabVisible) return;
        const sparkTickMs = getSparkTickMs(performanceTier);
        const interval = window.setInterval(() => {
            setSpark((prev) => {
                if (!prev) return null;
                const nx = prev.x + prev.vx;
                const ny = prev.y + prev.vy;
                if (nx < -0.2 || nx > 1.2 || ny < -0.2 || ny > 1.2) {
                    processedSparkIdsRef.current.add(prev.id);
                    return null;
                }
                return { ...prev, x: nx, y: ny };
            });
        }, sparkTickMs);
        return () => window.clearInterval(interval);
    }, [isTabVisible, performanceTier, processedSparkIdsRef, setSpark, spark]);
}
