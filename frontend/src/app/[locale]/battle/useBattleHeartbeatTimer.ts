import { useEffect, type MutableRefObject } from 'react';
import { BATTLE_REPORT_INTERVAL_SECONDS } from './battleConstants';

type SendHeartbeat = () => Promise<void>;

export function useBattleHeartbeatTimer({
    battleId,
    battleJoinedAtMs,
    battleJoinedRef,
    battleSyncIntervalSecondsRef,
    battleSyncSlotCountRef,
    battleSyncSlotRef,
    battleSyncTimerRef,
    isBattleActive,
    isBrowserOnline,
    sendHeartbeat,
    serverOffsetMsRef,
}: {
    battleId: string | null;
    battleJoinedAtMs: number | null;
    battleJoinedRef: MutableRefObject<boolean>;
    battleSyncIntervalSecondsRef: MutableRefObject<number>;
    battleSyncSlotCountRef: MutableRefObject<number>;
    battleSyncSlotRef: MutableRefObject<number>;
    battleSyncTimerRef: MutableRefObject<number | null>;
    isBattleActive: boolean;
    isBrowserOnline: boolean;
    sendHeartbeat: SendHeartbeat;
    serverOffsetMsRef: MutableRefObject<number>;
}) {
    useEffect(() => {
        if (battleSyncTimerRef.current != null) {
            window.clearTimeout(battleSyncTimerRef.current);
            battleSyncTimerRef.current = null;
        }
        if (!isBattleActive || !battleId || !isBrowserOnline || !battleJoinedRef.current || battleJoinedAtMs == null) {
            return;
        }

        let cancelled = false;
        const scheduleNextHeartbeat = () => {
            if (cancelled) return;
            if (!isBattleActive || !battleId || !isBrowserOnline || !battleJoinedRef.current || battleJoinedAtMs == null) {
                return;
            }
            const nowMs = Date.now() + serverOffsetMsRef.current;
            const joinedAtMs = battleJoinedAtMs;
            const intervalMs = Math.max(
                1000,
                Math.floor((Number(battleSyncIntervalSecondsRef.current) || BATTLE_REPORT_INTERVAL_SECONDS) * 1000),
            );
            const slotCount = Math.max(1, Math.floor(Number(battleSyncSlotCountRef.current) || 60));
            const slot = Math.max(0, Math.floor(Number(battleSyncSlotRef.current) || 0)) % slotCount;
            const baseAfterJoinMs = joinedAtMs + intervalMs;
            let targetMs = Math.max(nowMs, baseAfterJoinMs);
            if (slotCount > 1) {
                const slotWindowMs = Math.max(1, Math.floor(intervalMs / slotCount));
                const cycleStartMs = Math.floor(targetMs / intervalMs) * intervalMs;
                const slotTargetMs = cycleStartMs + (slot * slotWindowMs);
                targetMs = slotTargetMs >= targetMs ? slotTargetMs : slotTargetMs + intervalMs;
            }
            const delayMs = Math.max(100, targetMs - nowMs);
            battleSyncTimerRef.current = window.setTimeout(() => {
                battleSyncTimerRef.current = null;
                void sendHeartbeat().finally(() => {
                    scheduleNextHeartbeat();
                });
            }, delayMs) as unknown as number;
        };

        scheduleNextHeartbeat();
        return () => {
            cancelled = true;
            if (battleSyncTimerRef.current != null) {
                window.clearTimeout(battleSyncTimerRef.current);
                battleSyncTimerRef.current = null;
            }
        };
    }, [
        battleId,
        battleJoinedAtMs,
        battleJoinedRef,
        battleSyncIntervalSecondsRef,
        battleSyncSlotCountRef,
        battleSyncSlotRef,
        battleSyncTimerRef,
        isBattleActive,
        isBrowserOnline,
        sendHeartbeat,
        serverOffsetMsRef,
    ]);
}
