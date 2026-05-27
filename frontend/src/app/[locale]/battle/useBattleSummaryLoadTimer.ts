import { useEffect, type MutableRefObject } from 'react';
import type { BattleSummary } from '@/lib/battleSummary';

type LoadBattleSummary = (id: string, options?: { silent?: boolean }) => Promise<unknown>;

export function useBattleSummaryLoadTimer({
    battleId,
    battleSummary,
    loadBattleSummary,
    summaryLoadAtMs,
    summaryLoadTimerRef,
    summaryVisible,
}: {
    battleId: string | null;
    battleSummary: BattleSummary | null;
    loadBattleSummary: LoadBattleSummary;
    summaryLoadAtMs: number | null;
    summaryLoadTimerRef: MutableRefObject<number | null>;
    summaryVisible: boolean;
}) {
    useEffect(() => {
        if (summaryLoadTimerRef.current != null) {
            window.clearTimeout(summaryLoadTimerRef.current);
            summaryLoadTimerRef.current = null;
        }
        if (!battleId || summaryLoadAtMs == null || !summaryVisible) {
            return;
        }
        if (battleSummary && !battleSummary.detailsPending) {
            return;
        }

        const delayMs = Math.max(100, summaryLoadAtMs - Date.now());
        summaryLoadTimerRef.current = window.setTimeout(() => {
            summaryLoadTimerRef.current = null;
            void loadBattleSummary(battleId, { silent: true });
        }, delayMs) as unknown as number;

        return () => {
            if (summaryLoadTimerRef.current != null) {
                window.clearTimeout(summaryLoadTimerRef.current);
                summaryLoadTimerRef.current = null;
            }
        };
    }, [battleId, battleSummary, loadBattleSummary, summaryLoadAtMs, summaryLoadTimerRef, summaryVisible]);
}
