import { useEffect, type MutableRefObject } from 'react';
import type { StoredBattleProgress } from './battleTypes';
import type { BattleDisplaySyncMode } from './useBattleDisplayedStats';

type ReadBattleProgress = (battleIdOverride?: string | null) => StoredBattleProgress | null;
type SyncDisplayedLumens = (mode?: BattleDisplaySyncMode) => void;

export function useBattleDisplayedLumensSource({
    battleId,
    isBattleActive,
    predictedLumensRef,
    readBattleProgress,
    summaryVisible,
    syncDisplayedLumens,
    userLumens,
}: {
    battleId: string | null;
    isBattleActive: boolean;
    predictedLumensRef: MutableRefObject<number>;
    readBattleProgress: ReadBattleProgress;
    summaryVisible: boolean;
    syncDisplayedLumens: SyncDisplayedLumens;
    userLumens: number | null | undefined;
}) {
    useEffect(() => {
        if (isBattleActive && battleId) {
            return;
        }
        if (summaryVisible && battleId) {
            const storedBattleProgress = readBattleProgress(battleId);
            if (storedBattleProgress) {
                predictedLumensRef.current = Math.max(0, Number(storedBattleProgress.predictedLumens) || 0);
                syncDisplayedLumens('immediate');
                return;
            }
        }
        predictedLumensRef.current = Math.max(0, Number(userLumens ?? 0));
        syncDisplayedLumens('immediate');
    }, [battleId, isBattleActive, predictedLumensRef, readBattleProgress, summaryVisible, syncDisplayedLumens, userLumens]);
}
