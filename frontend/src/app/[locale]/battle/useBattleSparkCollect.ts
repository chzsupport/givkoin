import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import type {
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
    BattleSparkState,
} from './battleTypes';
import type { BattleDisplaySyncMode } from './useBattleDisplayedStats';

type PersistBattleProgress = (overrides?: BattleProgressPersistOverrides) => void;
type SyncDisplayedLumens = (mode?: BattleDisplaySyncMode) => void;

export function useBattleSparkCollect({
    battleTimeLeftMs,
    isBattleActive,
    onLumensGained,
    persistBattleProgress,
    predictedLumensRef,
    processedSparkIdsRef,
    reportAccRef,
    setSpark,
    spark,
    sparkCollectingRef,
    sparkRewardLumens,
    syncDisplayedLumens,
}: {
    battleTimeLeftMs: number;
    isBattleActive: boolean;
    onLumensGained: (gained: number) => void;
    persistBattleProgress: PersistBattleProgress;
    predictedLumensRef: MutableRefObject<number>;
    processedSparkIdsRef: MutableRefObject<Set<string>>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    setSpark: Dispatch<SetStateAction<BattleSparkState | null>>;
    spark: BattleSparkState | null;
    sparkCollectingRef: MutableRefObject<boolean>;
    sparkRewardLumens: number;
    syncDisplayedLumens: SyncDisplayedLumens;
}) {
    return useCallback(async () => {
        if (!spark) return;
        if (sparkCollectingRef.current) return;
        if (!isBattleActive || battleTimeLeftMs <= 0) return;

        sparkCollectingRef.current = true;
        setSpark(null);

        try {
            const gained = Math.max(0, Math.floor(sparkRewardLumens) || 0);
            processedSparkIdsRef.current.add(spark.id);
            if (!reportAccRef.current.sparkIds.includes(spark.id)) {
                reportAccRef.current.sparkIds = [...reportAccRef.current.sparkIds, spark.id];
            }

            reportAccRef.current.crystalsCollected += 1;
            reportAccRef.current.lumensGained += gained;

            if (gained > 0) {
                predictedLumensRef.current = Math.max(0, Number(predictedLumensRef.current) || 0) + gained;
                syncDisplayedLumens();
                onLumensGained(gained);
            }
            persistBattleProgress({ predictedLumens: predictedLumensRef.current });
        } finally {
            sparkCollectingRef.current = false;
        }
    }, [
        battleTimeLeftMs,
        isBattleActive,
        onLumensGained,
        persistBattleProgress,
        predictedLumensRef,
        processedSparkIdsRef,
        reportAccRef,
        setSpark,
        spark,
        sparkCollectingRef,
        sparkRewardLumens,
        syncDisplayedLumens,
    ]);
}
