'use client';

import { useMemo } from 'react';
import {
    BASE_DOME_CENTER,
    BASE_DOME_RADIUS,
    BASE_DOME_VISUAL_SCALE,
} from './battleConstants';
import {
    getBattleDomeLayout,
    getBattleSilhouetteLayout,
    getBattleViewportLayout,
    type BattleSceneLayout,
} from './battleLayout';
import type { BattlePerformanceTier } from './useBattleEnvironment';

type BattleViewportSize = {
    width: number;
    height: number;
};

export function useBattleSceneLayout({
    performanceTier,
    viewportSize,
    domeBlinkAt,
    useMobileBattleVideos,
}: {
    performanceTier: BattlePerformanceTier;
    viewportSize: BattleViewportSize;
    domeBlinkAt: number;
    useMobileBattleVideos: boolean;
}) {
    const domeCenter = useMemo(
        () => (performanceTier === 'low' ? { x: 0.5, y: 0.6 } : BASE_DOME_CENTER),
        [performanceTier],
    );
    const domeRadius = performanceTier === 'low' ? 0.29 : BASE_DOME_RADIUS;
    const domeVisualScale = performanceTier === 'low' ? 1.22 : BASE_DOME_VISUAL_SCALE;
    const treeScale = useMemo<[number, number, number]>(
        () => (performanceTier === 'low' ? [0.58, 0.58, 0.58] : [0.66, 0.66, 0.66]),
        [performanceTier],
    );
    const treePosition = useMemo<[number, number, number]>(
        () => (performanceTier === 'low' ? [0, -139.5, -100] : [0, -132.3, -100]),
        [performanceTier],
    );
    const battleViewportLayout = useMemo(
        () => getBattleViewportLayout(viewportSize.width, viewportSize.height),
        [viewportSize.height, viewportSize.width],
    );
    const battleLayout = useMemo<BattleSceneLayout>(() => ({
        viewport: battleViewportLayout,
        dome: getBattleDomeLayout(domeCenter, domeRadius, domeVisualScale, domeBlinkAt),
        tree: {
            scale: treeScale,
            position: treePosition,
        },
        silhouette: getBattleSilhouetteLayout(battleViewportLayout),
    }), [battleViewportLayout, domeBlinkAt, domeCenter, domeRadius, domeVisualScale, treePosition, treeScale]);
    const battleVideoSources = useMemo(
        () => (
            useMobileBattleVideos
                ? { background: '/relax-mobile.mp4', reaction: '/atack-mobile.mp4' }
                : { background: '/relax.mp4', reaction: '/atack.mp4' }
        ),
        [useMobileBattleVideos],
    );

    return {
        battleLayout,
        battleVideoSources,
    };
}
