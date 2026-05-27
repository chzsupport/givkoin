import { useCallback, type MutableRefObject } from 'react';
import type { InFlightDamageBatch } from './battleTypes';
import type { BattleDisplaySyncMode } from './useBattleDisplayedStats';

type SyncDisplayedUserDamage = (mode?: BattleDisplaySyncMode) => void;

export function useBattlePendingDamage({
    inFlightDamageBatchesRef,
    pendingUserDamageRef,
    syncDisplayedUserDamage,
}: {
    inFlightDamageBatchesRef: MutableRefObject<InFlightDamageBatch[]>;
    pendingUserDamageRef: MutableRefObject<number>;
    syncDisplayedUserDamage: SyncDisplayedUserDamage;
}) {
    const clearInFlightDamageBatches = useCallback(() => {
        inFlightDamageBatchesRef.current.forEach((batch) => {
            if (batch.timeoutId != null) {
                window.clearTimeout(batch.timeoutId);
            }
        });
        inFlightDamageBatchesRef.current = [];
    }, [inFlightDamageBatchesRef]);

    const addPendingUserDamage = useCallback((damageDelta: number) => {
        const safeDelta = Math.max(0, Math.round(damageDelta));
        if (!safeDelta) return;
        pendingUserDamageRef.current += safeDelta;
        syncDisplayedUserDamage();
    }, [pendingUserDamageRef, syncDisplayedUserDamage]);

    return {
        addPendingUserDamage,
        clearInFlightDamageBatches,
    };
}
