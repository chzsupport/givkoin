'use client';

import { useMemo } from 'react';
import { getComboMultiplier } from './battleClientState';
import { useBattleSparkCollect } from './useBattleSparkCollect';

export function useBattleViewRuntime({
    comboCount,
    isBattleActive,
    sparkCollect,
    summaryVisible,
}: {
    comboCount: number;
    isBattleActive: boolean;
    sparkCollect: Parameters<typeof useBattleSparkCollect>[0];
    summaryVisible: boolean;
}) {
    const comboMultiplier = useMemo(() => getComboMultiplier(comboCount), [comboCount]);
    const showActiveBattleScene = isBattleActive && !summaryVisible;
    const showSummaryBackdrop = summaryVisible && !isBattleActive;
    const handleSparkCollect = useBattleSparkCollect(sparkCollect);

    return {
        comboMultiplier,
        handleSparkCollect,
        showActiveBattleScene,
        showSummaryBackdrop,
    };
}
