'use client';

import { useBattleSummaryBehaviorGuard } from './useBattleSummaryBehaviorGuard';
import { useBattleSummaryLoader } from './useBattleSummaryLoader';
import { useBattleSummaryReadyListener } from './useBattleSummaryReadyListener';
import { useBattleTreeRedirect } from './useBattleTreeRedirect';

export function useBattleSummaryRuntime({
    behaviorGuard,
    loader,
    readyListener,
    redirect,
}: {
    behaviorGuard: Parameters<typeof useBattleSummaryBehaviorGuard>[0];
    loader: Parameters<typeof useBattleSummaryLoader>[0];
    readyListener: Parameters<typeof useBattleSummaryReadyListener>[0];
    redirect: Parameters<typeof useBattleTreeRedirect>[0];
}) {
    const handleSummaryModalPointer = useBattleSummaryBehaviorGuard(behaviorGuard);
    const loadBattleSummary = useBattleSummaryLoader(loader);
    const redirectToTree = useBattleTreeRedirect(redirect);

    useBattleSummaryReadyListener(readyListener);

    return {
        handleSummaryModalPointer,
        loadBattleSummary,
        redirectToTree,
    };
}
