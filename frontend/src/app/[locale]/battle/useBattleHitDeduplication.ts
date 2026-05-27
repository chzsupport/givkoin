import { useCallback, type MutableRefObject } from 'react';
import type { EnemyHitEvent } from './enemyZones';

export function useBattleHitDeduplication({
    accountedHitKeysRef,
}: {
    accountedHitKeysRef: MutableRefObject<Map<string, number>>;
}) {
    const pruneAccountedHitKeys = useCallback(() => {
        const now = Date.now();
        for (const [key, createdAt] of accountedHitKeysRef.current.entries()) {
            if (now - createdAt > 15000) {
                accountedHitKeysRef.current.delete(key);
            }
        }
    }, [accountedHitKeysRef]);

    const consumeAccountedHitKey = useCallback((event: EnemyHitEvent) => {
        if (!event.shotId) {
            return false;
        }
        pruneAccountedHitKeys();
        const safeX = Number.isFinite(Number(event.worldPoint?.x)) ? Number(event.worldPoint.x).toFixed(5) : '0';
        const safeY = Number.isFinite(Number(event.worldPoint?.y)) ? Number(event.worldPoint.y).toFixed(5) : '0';
        const key = `${String(event.shotId)}:${Math.floor(Number(event.weaponId) || 0)}:${safeX}:${safeY}`;
        if (accountedHitKeysRef.current.has(key)) {
            return false;
        }
        accountedHitKeysRef.current.set(key, Date.now());
        return true;
    }, [accountedHitKeysRef, pruneAccountedHitKeys]);

    return {
        consumeAccountedHitKey,
    };
}
