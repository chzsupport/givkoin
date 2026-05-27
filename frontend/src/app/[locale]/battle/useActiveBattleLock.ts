'use client';

import { useCallback, useEffect, useRef } from 'react';
import { clearActiveBattleLock, publishActiveBattleLock } from '@/utils/activeBattleLock';

type ActiveBattleLock = {
    battleId: string;
    userId: string;
};

export function useActiveBattleLock({
    battleId,
    battleEndsAtMs,
    isBattleActive,
    summaryVisible,
    userId,
}: {
    battleId: string | null;
    battleEndsAtMs: number | null;
    isBattleActive: boolean;
    summaryVisible: boolean;
    userId: string;
}) {
    const activeBattleLockRef = useRef<ActiveBattleLock | null>(null);

    const clearCurrentBattleLock = useCallback((override?: Partial<ActiveBattleLock>) => {
        const previous = activeBattleLockRef.current;
        const lockBattleId = override?.battleId || previous?.battleId || battleId || undefined;
        const lockUserId = override?.userId || previous?.userId || userId || undefined;

        if (lockBattleId || lockUserId) {
            clearActiveBattleLock({
                battleId: lockBattleId,
                userId: lockUserId,
            });
        }
        activeBattleLockRef.current = null;
    }, [battleId, userId]);

    useEffect(() => {
        return () => {
            clearCurrentBattleLock();
        };
    }, [clearCurrentBattleLock]);

    useEffect(() => {
        if (isBattleActive && battleId && !summaryVisible && userId) {
            publishActiveBattleLock({
                battleId,
                userId,
                battleEndsAtMs,
            });
            activeBattleLockRef.current = { battleId, userId };
            return;
        }

        clearCurrentBattleLock();
    }, [battleEndsAtMs, battleId, clearCurrentBattleLock, isBattleActive, summaryVisible, userId]);

    return {
        clearCurrentBattleLock,
    };
}
