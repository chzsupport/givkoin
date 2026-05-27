'use client';

import { useBattleEndSummaryTransition } from './useBattleEndSummaryTransition';
import { useBattleFinalReportTimer } from './useBattleFinalReportTimer';
import { useBattleHeartbeatTimer } from './useBattleHeartbeatTimer';
import { useBattleStatusPolling } from './useBattleStatusPolling';
import { useBattleStoredProgressHydration } from './useBattleStoredProgressHydration';
import { useBattleSummaryLoadTimer } from './useBattleSummaryLoadTimer';

type BattleLifecycleTimersOptions = {
    endSummaryTransition: Parameters<typeof useBattleEndSummaryTransition>[0];
    finalReportTimer: Parameters<typeof useBattleFinalReportTimer>[0];
    heartbeatTimer: Parameters<typeof useBattleHeartbeatTimer>[0];
    statusPolling: Parameters<typeof useBattleStatusPolling>[0];
    storedProgressHydration: Parameters<typeof useBattleStoredProgressHydration>[0];
    summaryLoadTimer: Parameters<typeof useBattleSummaryLoadTimer>[0];
};

export function useBattleLifecycleTimers({
    endSummaryTransition,
    finalReportTimer,
    heartbeatTimer,
    statusPolling,
    storedProgressHydration,
    summaryLoadTimer,
}: BattleLifecycleTimersOptions) {
    useBattleStatusPolling(statusPolling);
    useBattleStoredProgressHydration(storedProgressHydration);
    useBattleEndSummaryTransition(endSummaryTransition);
    useBattleSummaryLoadTimer(summaryLoadTimer);
    useBattleHeartbeatTimer(heartbeatTimer);
    useBattleFinalReportTimer(finalReportTimer);
}
