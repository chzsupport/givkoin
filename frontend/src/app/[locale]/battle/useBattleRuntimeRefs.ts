import { useEffect, type MutableRefObject } from 'react';
import type { BattleBaddieState } from './battleTypes';

type LastShotTelemetry = {
    at: number;
    screenX: number;
    screenY: number;
} | null;

export function useBattleRuntimeRefs({
    battleId,
    isBattleActive,
    baddies,
    baddiesRef,
    lastShotTelemetryRef,
}: {
    battleId: string | null;
    isBattleActive: boolean;
    baddies: BattleBaddieState[];
    baddiesRef: MutableRefObject<BattleBaddieState[]>;
    lastShotTelemetryRef: MutableRefObject<LastShotTelemetry>;
}) {
    useEffect(() => {
        if (isBattleActive) {
            lastShotTelemetryRef.current = null;
        }
    }, [battleId, isBattleActive, lastShotTelemetryRef]);

    useEffect(() => {
        baddiesRef.current = baddies;
    }, [baddies, baddiesRef]);
}
