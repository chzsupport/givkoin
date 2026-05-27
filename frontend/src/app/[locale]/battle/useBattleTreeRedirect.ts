'use client';

import { useCallback, type MutableRefObject } from 'react';

type ClearCurrentBattleLock = (override?: {
    battleId?: string;
    userId?: string;
}) => void;

export function useBattleTreeRedirect({
    battleId,
    clearBattleProgress,
    clearCurrentBattleLock,
    lastBattleIdRef,
    localePath,
    userId,
}: {
    battleId: string | null;
    clearBattleProgress: (battleIdOverride?: string | null) => void;
    clearCurrentBattleLock: ClearCurrentBattleLock;
    lastBattleIdRef: MutableRefObject<string | null>;
    localePath: (path: string) => string;
    userId: string;
}) {
    return useCallback(() => {
        if (typeof window === 'undefined') return;
        const lockBattleId = lastBattleIdRef.current || battleId;
        clearCurrentBattleLock({
            battleId: lockBattleId || undefined,
            userId: userId || undefined,
        });
        clearBattleProgress(lockBattleId);
        window.location.replace(localePath('/tree'));
    }, [battleId, clearBattleProgress, clearCurrentBattleLock, lastBattleIdRef, localePath, userId]);
}
