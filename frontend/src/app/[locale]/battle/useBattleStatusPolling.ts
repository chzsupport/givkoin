import { useEffect } from 'react';

type FetchBattle = () => Promise<void>;

export function useBattleStatusPolling({
    fetchBattle,
    isBrowserOnline,
    summaryVisible,
}: {
    fetchBattle: FetchBattle;
    isBrowserOnline: boolean;
    summaryVisible: boolean;
}) {
    useEffect(() => {
        if (!isBrowserOnline || summaryVisible) return;
        void fetchBattle();
    }, [fetchBattle, isBrowserOnline, summaryVisible]);
}
