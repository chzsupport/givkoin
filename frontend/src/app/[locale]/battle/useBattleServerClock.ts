'use client';

import { useCallback, type MutableRefObject } from 'react';

export function useBattleServerClock({
    battleEndsAtMs,
    serverOffsetMsRef,
}: {
    battleEndsAtMs: number | null;
    serverOffsetMsRef: MutableRefObject<number>;
}) {
    const applyServerNow = useCallback((serverNowMs: unknown) => {
        if (!Number.isFinite(Number(serverNowMs))) return;
        serverOffsetMsRef.current = Math.floor(Number(serverNowMs) - Date.now());
    }, [serverOffsetMsRef]);

    const computeBattleSummaryLoadAtMs = useCallback((endsAtMsOverride?: number | null) => {
        const safeEndsAtMs = endsAtMsOverride ?? battleEndsAtMs;
        if (safeEndsAtMs == null) return null;
        return Math.max(Date.now(), Math.floor(safeEndsAtMs));
    }, [battleEndsAtMs]);

    return {
        applyServerNow,
        computeBattleSummaryLoadAtMs,
    };
}
