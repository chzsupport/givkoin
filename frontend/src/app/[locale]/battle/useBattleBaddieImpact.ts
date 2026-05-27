import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { getBattleAttachedWorldPoint, type BattleSceneLayout } from './battleLayout';
import { ENEMY_OUTLINE_HEIGHT, ENEMY_OUTLINE_WIDTH } from './enemyZones';
import type {
    BattleBaddieState,
    BattleMinuteReportAccumulator,
} from './battleTypes';

type ImpactPayload = {
    worldPoint: { x: number; y: number; z: number };
    weaponId: number;
    shotId: string;
};

const getBaddieWorldPoint = (
    battleLayout: BattleSceneLayout,
    baddie: Pick<BattleBaddieState, 'x' | 'y' | 'attached' | 'attachedAngle'>,
) => {
    if (baddie.attached && Number.isFinite(baddie.attachedAngle)) {
        return getBattleAttachedWorldPoint(battleLayout.viewport, battleLayout.dome, baddie.attachedAngle || 0);
    }
    return { x: baddie.x, y: baddie.y };
};

export function useBattleBaddieImpact({
    battleLayout,
    baddiesRef,
    persistBattleProgress,
    reportAccRef,
    setBaddies,
}: {
    battleLayout: BattleSceneLayout;
    baddiesRef: MutableRefObject<BattleBaddieState[]>;
    persistBattleProgress: () => void;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    setBaddies: Dispatch<SetStateAction<BattleBaddieState[]>>;
}) {
    return useCallback((payload: ImpactPayload) => {
        const worldMin = Math.min(ENEMY_OUTLINE_WIDTH, ENEMY_OUTLINE_HEIGHT);
        const activeBaddies = baddiesRef.current.filter((baddie) => !baddie.exploding);
        let hitId: string | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        let bestRadius = 0;

        activeBaddies.forEach((baddie) => {
            if (baddie.exploding) return;
            const worldPoint = getBaddieWorldPoint(battleLayout, baddie);
            const dx = payload.worldPoint.x - worldPoint.x;
            const dy = payload.worldPoint.y - worldPoint.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const radius = Math.max(
                baddie.size * worldMin * (baddie.attached ? 1.05 : 1.08),
                worldMin * (baddie.attached ? 0.043 : 0.042),
            );
            if (dist < bestDist) {
                bestDist = dist;
                bestRadius = radius;
                hitId = baddie.id;
            }
        });

        const hitBaddie = hitId
            ? baddiesRef.current.find((baddie) => baddie.id === hitId && bestDist <= bestRadius)
            : null;

        if (hitBaddie && hitId) {
            if (!reportAccRef.current.baddieDestroyedIds.includes(hitId)) {
                reportAccRef.current.baddieDestroyedIds = [...reportAccRef.current.baddieDestroyedIds, hitId];
                persistBattleProgress();
            }
            setBaddies((prev) =>
                prev.map((item) => (item.id === hitId ? { ...item, exploding: true } : item)),
            );
            window.setTimeout(() => {
                setBaddies((prev) => prev.filter((item) => item.id !== hitId));
            }, 360);
            return { hit: true, type: 'baddie' as const };
        }

        return undefined;
    }, [battleLayout, baddiesRef, persistBattleProgress, reportAccRef, setBaddies]);
}
