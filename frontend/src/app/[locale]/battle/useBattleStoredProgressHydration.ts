import { useEffect, type MutableRefObject } from 'react';
import type { StoredBattleProgress } from './battleTypes';

type ApplyStoredBattleProgress = (snapshot: StoredBattleProgress | null) => unknown;
type GetBattleProgressStorageKey = (battleIdOverride?: string | null) => string | null;
type ReadBattleProgress = (battleIdOverride?: string | null) => StoredBattleProgress | null;

export function useBattleStoredProgressHydration({
    applyStoredBattleProgress,
    battleId,
    getBattleProgressStorageKey,
    hydratedBattleProgressKeyRef,
    isBattleActive,
    readBattleProgress,
    summaryVisible,
}: {
    applyStoredBattleProgress: ApplyStoredBattleProgress;
    battleId: string | null;
    getBattleProgressStorageKey: GetBattleProgressStorageKey;
    hydratedBattleProgressKeyRef: MutableRefObject<string | null>;
    isBattleActive: boolean;
    readBattleProgress: ReadBattleProgress;
    summaryVisible: boolean;
}) {
    useEffect(() => {
        if (!isBattleActive || !battleId || summaryVisible) {
            hydratedBattleProgressKeyRef.current = null;
            return;
        }
        const key = getBattleProgressStorageKey(battleId);
        if (!key || hydratedBattleProgressKeyRef.current === key) {
            return;
        }
        hydratedBattleProgressKeyRef.current = key;
        const stored = readBattleProgress(battleId);
        if (!stored) {
            return;
        }
        applyStoredBattleProgress(stored);
    }, [
        applyStoredBattleProgress,
        battleId,
        getBattleProgressStorageKey,
        hydratedBattleProgressKeyRef,
        isBattleActive,
        readBattleProgress,
        summaryVisible,
    ]);
}
