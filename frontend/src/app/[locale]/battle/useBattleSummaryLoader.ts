import {
    useCallback,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { apiGet } from '@/utils/api';
import { parseBattleSummaryPayload, type BattleSummary, type BattleSummaryPayload } from '@/lib/battleSummary';

type ToastApi = {
    error: (title: string, message?: string) => void;
};

export function useBattleSummaryLoader({
    battleSummary,
    clearBattleProgress,
    language,
    setBattleSummary,
    setSummaryLoadAtMs,
    setSummaryLoading,
    syncUserBattleEconomy,
    t,
    toast,
}: {
    battleSummary: BattleSummary | null;
    clearBattleProgress: (battleIdOverride?: string | null) => void;
    language: string;
    setBattleSummary: Dispatch<SetStateAction<BattleSummary | null>>;
    setSummaryLoadAtMs: Dispatch<SetStateAction<number | null>>;
    setSummaryLoading: Dispatch<SetStateAction<boolean>>;
    syncUserBattleEconomy: (summary: BattleSummary | null, battleIdOverride?: string | null) => void;
    t: (key: string) => string;
    toast: ToastApi;
}) {
    return useCallback(async (id: string, options?: { silent?: boolean }) => {
        try {
            setSummaryLoading(true);
            const data = await apiGet<BattleSummaryPayload>(`/battles/summary?battleId=${id}`);
            if (data.pending) {
                const retryAfterMs = Math.max(250, Math.floor(Number(data.retryAfterMs) || 1000));
                setSummaryLoadAtMs(Date.now() + retryAfterMs);
                return false;
            }
            const nextSummary = parseBattleSummaryPayload(data, battleSummary, language);
            if (!nextSummary) {
                setSummaryLoadAtMs(Date.now() + 1000);
                return false;
            }
            syncUserBattleEconomy(nextSummary, id);
            setBattleSummary(nextSummary);
            if (nextSummary.detailsPending) {
                const retryAfterMs = Math.max(
                    500,
                    Math.floor(Number(nextSummary.detailsRetryAfterMs) || 1500),
                );
                setSummaryLoadAtMs(Date.now() + retryAfterMs);
            } else {
                setSummaryLoadAtMs(null);
            }
            clearBattleProgress(id);
            return true;
        } catch (e: unknown) {
            console.error('Failed to fetch battle summary:', e);
            setSummaryLoadAtMs(Date.now() + 1000);
            if (!options?.silent) {
                const message = e instanceof Error ? e.message : '';
                toast.error(t('common.error'), message || t('battle.failed_get_result'));
            }
            return false;
        } finally {
            setSummaryLoading(false);
        }
    }, [
        battleSummary,
        clearBattleProgress,
        language,
        setBattleSummary,
        setSummaryLoadAtMs,
        setSummaryLoading,
        syncUserBattleEconomy,
        t,
        toast,
    ]);
}
