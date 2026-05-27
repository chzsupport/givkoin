import { apiPost } from '@/utils/api';
import { getCachedBridgeList } from '@/utils/sessionWarmup';
import { NEW_BRIDGE_COST_K } from './constants';
import { upsertBridge } from './bridgeUtils';
import type { Bridge, BridgeStatsResponse } from './types';
import type { BridgeAuthUser, CreateBridgeParams } from './bridgeMutationTypes';

export const createBridge = async ({
  activeTab,
  bridges,
  selectedBridge,
  bridgeStats,
  createdToday,
  stonesToday,
  newBridgeLimit,
  existingStoneLimit,
  selectedBridgeDistance,
  countryFrom,
  countryTo,
  userId,
  user,
  refreshUser,
  updateUser,
  toast,
  t,
  setBridges,
  setSelectedBridge,
  setShowCreateModal,
  paginationRef,
  pendingMutationsRef,
  persistBridgeStats,
  persistBridgeList,
  fetchBridgeStats,
  fetchBridges,
  isCreatingBridge,
  setIsCreatingBridge,
}: CreateBridgeParams) => {
  if (!user) {
    toast.error(t('common.error'), t('bridges.user_not_found'));
    return;
  }
  if (countryFrom === countryTo) {
    toast.error(t('common.error'), t('bridges.choose_two_countries'));
    return;
  }
  if (user.k < NEW_BRIDGE_COST_K) {
    toast.error(t('bridges.not_enough_k'), `${t('bridges.need_k_for_start_prefix')} ${NEW_BRIDGE_COST_K} K ${t('bridges.need_k_for_start_suffix')}`);
    return;
  }
  if (isCreatingBridge) {
    return;
  }
  if (createdToday >= newBridgeLimit) {
    toast.error(t('bridges.limit'), `${t('bridges.new_bridge_limit_prefix')} ${newBridgeLimit} ${t('bridges.new_bridge_limit_suffix')}`);
    return;
  }
  if (!selectedBridgeDistance) {
    toast.error(t('common.error'), t('bridges.distance_error'));
    return;
  }

  const nowIso = new Date().toISOString();
  const tempBridge: Bridge = {
    _id: `temp_bridge_${Date.now()}`,
    fromCountry: countryFrom,
    toCountry: countryTo,
    status: 'building',
    currentStones: 1,
    requiredStones: selectedBridgeDistance,
    contributors: [{ user: { _id: userId, nickname: user.nickname || t('cabinet.player') }, stones: 1 }],
    createdAt: nowIso,
    updatedAt: nowIso,
    lastContributionAt: nowIso,
  };
  const previousBridges = bridges;
  const previousSelectedBridge = selectedBridge;
  const previousStats = bridgeStats;
  const optimisticBridges = activeTab === 'completed'
    ? bridges
    : [tempBridge, ...bridges.filter((bridge) => bridge._id !== tempBridge._id)];
  const optimisticStats: BridgeStatsResponse = {
    createdToday: createdToday + 1,
    stonesToday,
    limits: {
      newBridgesPerDay: newBridgeLimit,
      existingBridgeStonesPerDay: existingStoneLimit,
    },
    serverNow: previousStats?.serverNow,
  };

  pendingMutationsRef.current++;
  setIsCreatingBridge(true);
  if (activeTab !== 'completed') {
    setBridges(optimisticBridges);
    persistBridgeList(activeTab, optimisticBridges, paginationRef.current);
  }
  setSelectedBridge(tempBridge);
  setShowCreateModal(false);
  updateUser({
    ...user,
    k: Math.max(0, Number(user.k || 0) - NEW_BRIDGE_COST_K),
  });
  persistBridgeStats(optimisticStats);
  toast.success(t('bridges.radiance_plus_10'), t('bridges.bridge_creating'));

  try {
    const data = await apiPost<{ bridge: Bridge; user?: BridgeAuthUser }>('/bridges', {
      fromCountry: countryFrom,
      toCountry: countryTo
    });
    if (data.user) {
      updateUser(data.user);
    } else {
      refreshUser().catch(() => {});
    }

    const serverBridge = data.bridge;
    if (serverBridge.contributors && serverBridge.contributors.length > 0 && tempBridge.contributors[0]) {
      serverBridge.contributors[0] = {
        ...serverBridge.contributors[0],
        user: tempBridge.contributors[0].user
      };
    }
    setBridges((prev) => {
      const withoutTemp = prev.filter((bridge) => bridge._id !== tempBridge._id);
      const next = activeTab === 'completed' ? withoutTemp : [serverBridge, ...withoutTemp.filter((bridge) => bridge._id !== serverBridge._id)];
      persistBridgeList(activeTab, next, paginationRef.current);
      return next;
    });
    persistBridgeList('building', upsertBridge(getCachedBridgeList(userId, 'building')?.bridges || [], serverBridge, { prepend: true }), getCachedBridgeList(userId, 'building')?.pagination);
    persistBridgeList('my', upsertBridge(getCachedBridgeList(userId, 'my')?.bridges || [], serverBridge, { prepend: true }), getCachedBridgeList(userId, 'my')?.pagination);
    setSelectedBridge(serverBridge);
    fetchBridgeStats({ silent: true });
  } catch (error: unknown) {
    if (activeTab !== 'completed') {
      setBridges(previousBridges);
      persistBridgeList(activeTab, previousBridges, paginationRef.current);
    }
    setSelectedBridge(previousSelectedBridge);
    updateUser(user);
    persistBridgeStats(previousStats);
    const message = error instanceof Error ? error.message : '';
    toast.error(t('common.error'), message || t('bridges.bridge_create_error'));
    fetchBridgeStats({ silent: true });
    fetchBridges({ silent: true, pageOverride: 1, tabOverride: activeTab });
  } finally {
    pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
    setIsCreatingBridge(false);
  }
};
