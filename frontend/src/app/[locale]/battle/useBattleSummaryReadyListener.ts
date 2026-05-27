'use client';

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Socket } from 'socket.io-client';
import {
    parseBattleSummaryPayload,
    type BattleSummary,
    type BattleSummaryPayload,
} from '@/lib/battleSummary';

export function useBattleSummaryReadyListener({
    socket,
    battleId,
    lastBattleIdRef,
    summaryRequestedRef,
    language,
    syncUserBattleEconomy,
    setBattleSummary,
    setSummaryLoadAtMs,
    clearBattleProgress,
}: {
    socket: Socket | null;
    battleId: string | null;
    lastBattleIdRef: MutableRefObject<string | null>;
    summaryRequestedRef: MutableRefObject<string | null>;
    language: string;
    syncUserBattleEconomy: (summary: BattleSummary | null, battleIdOverride?: string | null) => void;
    setBattleSummary: Dispatch<SetStateAction<BattleSummary | null>>;
    setSummaryLoadAtMs: Dispatch<SetStateAction<number | null>>;
    clearBattleProgress: (battleIdOverride?: string | null) => void;
}) {
    useEffect(() => {
        if (!socket) return;

        const onBattleSummaryReady = (payload: BattleSummaryPayload) => {
            const payloadBattleId = typeof payload?.battleId === 'string' ? payload.battleId : '';
            const currentBattleId = String(lastBattleIdRef.current || battleId || '').trim();
            if (!payloadBattleId || !currentBattleId || payloadBattleId !== currentBattleId) {
                return;
            }

            setBattleSummary((previous) => {
                const nextSummary = parseBattleSummaryPayload(payload, previous, language) || previous;
                syncUserBattleEconomy(nextSummary, payloadBattleId);
                return nextSummary;
            });
            summaryRequestedRef.current = payloadBattleId;
            if (payload?.detailsPending || payload?.isComplete === false) {
                const retryAfterMs = Math.max(
                    500,
                    Math.floor(Number(payload.detailsRetryAfterMs) || 1500),
                );
                setSummaryLoadAtMs(Date.now() + retryAfterMs);
            } else {
                setSummaryLoadAtMs(null);
            }
            clearBattleProgress(payloadBattleId);
        };

        socket.on('battle:summary-ready', onBattleSummaryReady);
        return () => {
            socket.off('battle:summary-ready', onBattleSummaryReady);
        };
    }, [
        battleId,
        clearBattleProgress,
        language,
        lastBattleIdRef,
        setBattleSummary,
        setSummaryLoadAtMs,
        socket,
        summaryRequestedRef,
        syncUserBattleEconomy,
    ]);
}
