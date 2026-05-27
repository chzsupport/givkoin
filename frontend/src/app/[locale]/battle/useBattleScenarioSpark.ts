'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { getBattleElapsedMs } from './battleClientState';
import type { BattleScenario, BattleSparkState } from './battleTypes';

export function useBattleScenarioSpark({
    isBattleActive,
    battleScenario,
    battleStartsAtMs,
    battleJoinedAtMs,
    battleJoinedRef,
    serverOffsetMsRef,
    processedSparkIdsRef,
    setSpark,
}: {
    isBattleActive: boolean;
    battleScenario: BattleScenario | null;
    battleStartsAtMs: number | null;
    battleJoinedAtMs: number | null;
    battleJoinedRef: MutableRefObject<boolean>;
    serverOffsetMsRef: MutableRefObject<number>;
    processedSparkIdsRef: MutableRefObject<Set<string>>;
    setSpark: Dispatch<SetStateAction<BattleSparkState | null>>;
}) {
    useEffect(() => {
        if (!isBattleActive || !battleScenario || battleStartsAtMs == null || battleJoinedAtMs == null || !battleJoinedRef.current) return;

        const syncSparkFromScenario = () => {
            const elapsedMs = getBattleElapsedMs(battleStartsAtMs, serverOffsetMsRef.current);
            setSpark((prev) => {
                if (prev) return prev;
                const nextSpark = battleScenario.sparks.find((item) =>
                    elapsedMs >= item.startOffsetMs
                    && elapsedMs <= item.startOffsetMs + 20000
                    && !processedSparkIdsRef.current.has(item.id),
                );
                if (!nextSpark) return prev;
                return {
                    id: nextSpark.id,
                    x: nextSpark.x,
                    y: nextSpark.y,
                    vx: nextSpark.vx,
                    vy: nextSpark.vy,
                };
            });
        };

        syncSparkFromScenario();
        const interval = window.setInterval(syncSparkFromScenario, 250);
        return () => window.clearInterval(interval);
    }, [
        battleJoinedAtMs,
        battleJoinedRef,
        battleScenario,
        battleStartsAtMs,
        isBattleActive,
        processedSparkIdsRef,
        serverOffsetMsRef,
        setSpark,
    ]);
}
