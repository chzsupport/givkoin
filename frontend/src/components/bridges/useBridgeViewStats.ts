import { useMemo } from 'react';
import {
  DAILY_EXISTING_STONE_LIMIT,
  DAILY_NEW_BRIDGE_LIMIT,
} from './constants';
import type { Bridge, BridgeStatsResponse } from './types';

export function useBridgeViewStats(
  bridges: Bridge[],
  bridgeStats: BridgeStatsResponse | null,
) {
  const bridgeCounters = useMemo(() => {
    return bridges.reduce(
      (acc, bridge) => {
        acc.totalStones += bridge.currentStones;
        if (bridge.status === 'building') {
          acc.activeBridgesCount += 1;
        }
        if (bridge.status === 'completed') {
          acc.builtBridgesCount += 1;
        }
        return acc;
      },
      {
        totalStones: 0,
        activeBridgesCount: 0,
        builtBridgesCount: 0,
      },
    );
  }, [bridges]);

  return {
    ...bridgeCounters,
    createdToday: bridgeStats?.createdToday ?? 0,
    stonesToday: bridgeStats?.stonesToday ?? 0,
    newBridgeLimit: bridgeStats?.limits?.newBridgesPerDay ?? DAILY_NEW_BRIDGE_LIMIT,
    existingStoneLimit: bridgeStats?.limits?.existingBridgeStonesPerDay ?? DAILY_EXISTING_STONE_LIMIT,
  };
}
