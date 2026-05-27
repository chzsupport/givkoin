'use client';

import { useBattleCurrentStatus } from './useBattleCurrentStatus';
import { useBattleDamageTrackingReset } from './useBattleDamageTrackingReset';
import { useBattleJoin } from './useBattleJoin';
import { useBattleLifecycleTimers } from './useBattleLifecycleTimers';
import { useBattleReports } from './useBattleReports';

type LifecycleTimersOptions = Parameters<typeof useBattleLifecycleTimers>[0];

type ServerFlowLifecycleTimersOptions = Omit<
    LifecycleTimersOptions,
    'finalReportTimer' | 'heartbeatTimer' | 'statusPolling'
> & {
    finalReportTimer: Omit<LifecycleTimersOptions['finalReportTimer'], 'sendFinalReport'>;
    heartbeatTimer: Omit<LifecycleTimersOptions['heartbeatTimer'], 'sendHeartbeat'>;
    statusPolling: Omit<LifecycleTimersOptions['statusPolling'], 'fetchBattle'>;
};

export function useBattleServerFlow({
    currentStatus,
    join,
    lifecycleTimers,
    reports,
    resetDamageTracking,
}: {
    currentStatus: Omit<
        Parameters<typeof useBattleCurrentStatus>[0],
        'joinBattle' | 'resetBattleDamageTracking'
    >;
    join: Parameters<typeof useBattleJoin>[0];
    lifecycleTimers: ServerFlowLifecycleTimersOptions;
    reports: Parameters<typeof useBattleReports>[0];
    resetDamageTracking: Parameters<typeof useBattleDamageTrackingReset>[0];
}) {
    const joinBattle = useBattleJoin(join);
    const { sendFinalReport, sendHeartbeat } = useBattleReports(reports);
    const resetBattleDamageTracking = useBattleDamageTrackingReset(resetDamageTracking);
    const fetchBattle = useBattleCurrentStatus({
        ...currentStatus,
        joinBattle,
        resetBattleDamageTracking,
    });

    useBattleLifecycleTimers({
        ...lifecycleTimers,
        statusPolling: {
            ...lifecycleTimers.statusPolling,
            fetchBattle,
        },
        heartbeatTimer: {
            ...lifecycleTimers.heartbeatTimer,
            sendHeartbeat,
        },
        finalReportTimer: {
            ...lifecycleTimers.finalReportTimer,
            sendFinalReport,
        },
    });
}
