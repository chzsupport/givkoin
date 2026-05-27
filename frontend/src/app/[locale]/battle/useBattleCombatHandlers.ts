'use client';

import { useBattleEnemyMaskHit } from './useBattleEnemyMaskHit';
import { useBattleHitHandlers } from './useBattleHitHandlers';
import { useBattleShotAttempt } from './useBattleShotAttempt';

export function useBattleCombatHandlers({
    enemyLayerRef,
    hitHandlers,
    shotAttempt,
}: {
    enemyLayerRef: Parameters<typeof useBattleEnemyMaskHit>[0];
    hitHandlers: Parameters<typeof useBattleHitHandlers>[0];
    shotAttempt: Parameters<typeof useBattleShotAttempt>[0];
}) {
    const checkHit = useBattleEnemyMaskHit(enemyLayerRef);
    const handleShotAttempt = useBattleShotAttempt(shotAttempt);
    const { handleHit, handleVisualHit } = useBattleHitHandlers(hitHandlers);

    return {
        checkHit,
        handleHit,
        handleShotAttempt,
        handleVisualHit,
    };
}
