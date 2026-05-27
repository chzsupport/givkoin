import { useCallback, useEffect, useRef, type PointerEvent } from 'react';
import { apiPost } from '@/utils/api';
import type { BattleSummary } from '@/lib/battleSummary';

type SummaryModalClick = {
    at: number;
    x: number;
    y: number;
};

export function useBattleSummaryBehaviorGuard({
    summaryVisible,
    battleSummary,
}: {
    summaryVisible: boolean;
    battleSummary: BattleSummary | null;
}) {
    const summaryModalClicksRef = useRef<SummaryModalClick[]>([]);
    const summaryBurstReportedRef = useRef(false);

    useEffect(() => {
        if (!summaryVisible) {
            summaryModalClicksRef.current = [];
            summaryBurstReportedRef.current = false;
        }
    }, [summaryVisible]);

    return useCallback((event: PointerEvent<HTMLDivElement>) => {
        if (!summaryVisible || !battleSummary?.battleId) return;

        const now = Date.now();
        const click = { at: now, x: event.clientX, y: event.clientY };
        const recent = [...summaryModalClicksRef.current, click].filter((item) => now - item.at <= 1500);
        summaryModalClicksRef.current = recent;

        const nearby = recent.filter((item) => Math.hypot(item.x - click.x, item.y - click.y) <= 12);
        if (summaryBurstReportedRef.current || nearby.length < 4) return;

        summaryBurstReportedRef.current = true;
        apiPost('/activity/behavior', {
            category: 'battle',
            eventType: 'battle_result_modal_same_spot_burst',
            battleId: battleSummary.battleId,
            scoreHint: 6,
            meta: {
                burstCount: nearby.length,
                x: Math.round(click.x),
                y: Math.round(click.y),
            },
        }).catch(() => { });
    }, [battleSummary?.battleId, summaryVisible]);
}
