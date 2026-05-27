import { apiPost } from '@/utils/api';
import { STONE_COST_K } from './constants';
import { applyContributionToBridge } from './bridgeUtils';
import { hydrateContributorNicknames } from './bridgeMutationHelpers';
import type { Bridge, BridgeStatsResponse } from './types';
import type { BridgeAuthUser, LayBridgeStoneParams } from './bridgeMutationTypes';

export const layBridgeStone = async ({
  activeTab,
  bridges,
  selectedBridge,
  bridgeStats,
  createdToday,
  stonesToday,
  newBridgeLimit,
  existingStoneLimit,
  bridgeId,
  pendingBridgeIds,
  setPendingBridgeIds,
  userId,
  user,
  refreshUser,
  updateUser,
  toast,
  t,
  setBridges,
  setSelectedBridge,
  paginationRef,
  pendingMutationsRef,
  persistBridgeStats,
  persistBridgeList,
  fetchBridgeStats,
  fetchBridges,
}: LayBridgeStoneParams) => {
  if (!user) {
    toast.error(t('common.error'), t('bridges.user_not_found'));
    return;
  }
  if (pendingBridgeIds[bridgeId]) {
    return;
  }
  if (user.k < STONE_COST_K) {
    toast.error(t('bridges.not_enough_k'), `${t('bridges.need_min_k_prefix')} ${STONE_COST_K} K`);
    return;
  }
  if (stonesToday + STONE_COST_K > existingStoneLimit) {
    toast.error(t('bridges.limit'), `${t('bridges.existing_stone_limit_prefix')} ${existingStoneLimit} ${t('bridges.existing_stone_limit_suffix')}`);
    return;
  }

  const previousBridges = bridges;
  const previousSelectedBridge = selectedBridge;
  const previousStats = bridgeStats;
  const targetBridge = bridges.find((bridge) => bridge._id === bridgeId);
  if (!targetBridge) {
    toast.error(t('common.error'), t('bridges.bridge_not_found'));
    return;
  }

  const optimisticBridge = applyContributionToBridge(targetBridge, userId, user.nickname || t('cabinet.player'), STONE_COST_K);
  const optimisticBridges = bridges.map((bridge) => bridge._id === bridgeId ? optimisticBridge : bridge);
  const optimisticStats: BridgeStatsResponse = {
    createdToday,
    stonesToday: stonesToday + STONE_COST_K,
    limits: {
      newBridgesPerDay: newBridgeLimit,
      existingBridgeStonesPerDay: existingStoneLimit,
    },
    serverNow: previousStats?.serverNow,
  };

  pendingMutationsRef.current++;
  setPendingBridgeIds((prev) => ({ ...prev, [bridgeId]: true }));
  setBridges(optimisticBridges);
  persistBridgeList(activeTab, optimisticBridges, paginationRef.current);
  if (selectedBridge?._id === bridgeId) {
    setSelectedBridge(optimisticBridge);
  }
  updateUser({
    ...user,
    k: Math.max(0, Number(user.k || 0) - STONE_COST_K),
  });
  persistBridgeStats(optimisticStats);
  toast.success(t('bridges.radiance_plus_5'), t('bridges.stone_laid'));

  try {
    const response = await apiPost<{ bridge?: Bridge; user?: BridgeAuthUser }>(`/bridges/${bridgeId}/contribute`, { stones: STONE_COST_K });
    if (response.user) {
      updateUser(response.user);
    } else {
      refreshUser().catch(() => {});
    }

    if (response.bridge) {
      setBridges((prev) => {
        const next = prev.map((bridge) => {
          if (bridge._id === response.bridge!._id) {
            const srvBridge = response.bridge!;
            if ((Number(srvBridge.currentStones) || 0) < (Number(optimisticBridge.currentStones) || 0)) {
              return optimisticBridge;
            }
            return hydrateContributorNicknames(srvBridge, optimisticBridge);
          }
          return bridge;
        });
        persistBridgeList(activeTab, next, paginationRef.current);
        return next;
      });
      if (selectedBridge?._id === response.bridge._id) {
        setSelectedBridge((prev) => {
          if (!prev) return response.bridge!;
          if ((Number(response.bridge!.currentStones) || 0) < (Number(optimisticBridge.currentStones) || 0)) {
            return optimisticBridge;
          }
          return hydrateContributorNicknames(response.bridge!, optimisticBridge);
        });
      }
    }
  } catch (error: unknown) {
    setBridges(previousBridges);
    persistBridgeList(activeTab, previousBridges, paginationRef.current);
    setSelectedBridge(previousSelectedBridge);
    updateUser(user);
    persistBridgeStats(previousStats);
    const message = error instanceof Error ? error.message : '';
    toast.error(t('common.error'), message || t('bridges.stone_lay_error'));
    fetchBridgeStats({ silent: true });
    fetchBridges({ silent: true, pageOverride: 1, tabOverride: activeTab });
  } finally {
    pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    setPendingBridgeIds((prev) => ({ ...prev, [bridgeId]: false }));
    fetchBridgeStats({ silent: true });
  }
};
