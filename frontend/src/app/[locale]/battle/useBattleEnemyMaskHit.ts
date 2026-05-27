'use client';

import { useCallback, type MutableRefObject } from 'react';
import type { EnemyLayerHandle } from './EnemyLayer';

export function useBattleEnemyMaskHit(enemyLayerRef: MutableRefObject<EnemyLayerHandle | null>) {
    return useCallback((worldX: number, worldY: number) => {
        return enemyLayerRef.current?.isPointInsideMask(worldX, worldY) ?? false;
    }, [enemyLayerRef]);
}
