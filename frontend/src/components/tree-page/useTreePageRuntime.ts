import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import { useToast } from '@/context/ToastContext';
import { useStatusTracking } from '@/hooks/useStatusTracking';
import { getTreeHealingSummary } from './treeHealingSummary';
import { useTreeHealingActions } from './useTreeHealingActions';
import { useTreePartnerSearch } from './useTreePartnerSearch';
import { useTreeSolarPanel } from './useTreeSolarPanel';
import { useTreeStatusData } from './useTreeStatusData';
import { useTreeViewportState } from './useTreeViewportState';
import type { TreePanel, UserResourceSnapshot } from './types';

export function useTreePageRuntime() {
  const { user, refreshUser, updateUser } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { t, localePath } = useI18n();

  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<TreePanel | null>(null);

  const [isEntityAskOpen, setIsEntityAskOpen] = useState(false);
  const { isTabVisible } = useTreeViewportState();

  const syncUserResources = useCallback((nextUser?: UserResourceSnapshot | null) => {
    if (!user || !nextUser) return;

    updateUser({
      ...user,
      k: typeof nextUser.k === 'number' ? nextUser.k : user.k,
      stars: typeof nextUser.stars === 'number' ? nextUser.stars : user.stars,
      lumens: typeof nextUser.lumens === 'number' ? nextUser.lumens : user.lumens,
    } as Parameters<typeof updateUser>[0]);
  }, [updateUser, user]);

  useStatusTracking(user?._id, activePanel === 'solar' && isRightPanelOpen);

  const openPanel = (panel: 'entity' | 'search' | 'solar') => {
    setActivePanel(panel);
    setIsRightPanelOpen(true);
  };

  const {
    handleShareLumens,
    handleTakeCharge,
    isShareOpen,
    isShareSending,
    loadSolarStatus,
    setIsShareOpen,
    setShareAmountLm,
    shareAmountLm,
    shareCountToday,
    shareDailyLimit,
    solarStatus,
    solarTimeLeft,
    takingDuration,
  } = useTreeSolarPanel({
    activePanel,
    isRightPanelOpen,
    refreshUser,
    setActivePanel,
    setIsRightPanelOpen,
    syncUserResources,
    t,
    toast,
    user,
  });

  const {
    handleCollectFruit,
    injuries,
    isFruitAvailable,
    isUnderAttack,
    loadTreeStatus,
    setInjuries,
  } = useTreeStatusData({
    loadSolarStatus,
    refreshUser,
    syncUserResources,
    t,
    toast,
  });

  const availableLumens = Math.max(0, Number(user?.lumens) || 0);
  const {
    handleHealTree,
    handleRadianceBurstComplete,
    healLumens,
    isHealOpen,
    isHealing,
    radianceBursts,
    setHealLumens,
    setIsHealOpen,
  } = useTreeHealingActions({
    availableLumens,
    hasUser: Boolean(user),
    loadTreeStatus,
    onOptimisticLumensChange: (nextLumens) => {
      if (!user) return;
      updateUser({
        ...user,
        lumens: nextLumens,
      } as Parameters<typeof updateUser>[0]);
    },
    refreshUser,
    setInjuries,
    syncUserResources,
    t,
    toast,
  });

  const {
    cancelSearch,
    handleFindPartner,
    isFoundNotice,
    isSearching,
  } = useTreePartnerSearch({
    localePath,
    router,
    t,
    toast,
    userId: user?._id,
  });

  const { hasTrauma, healingPercent, healingRemaining } = getTreeHealingSummary(injuries);

  return {
    activePanel,
    cancelSearch,
    handleCollectFruit,
    handleFindPartner,
    handleHealTree,
    handleRadianceBurstComplete,
    handleShareLumens,
    handleTakeCharge,
    hasTrauma,
    healLumens,
    healingPercent,
    healingRemaining,
    isEntityAskOpen,
    isFoundNotice,
    isFruitAvailable,
    isHealOpen,
    isHealing,
    isRightPanelOpen,
    isSearching,
    isShareOpen,
    isShareSending,
    isTabVisible,
    isUnderAttack,
    localePath,
    openPanel,
    radianceBursts,
    setHealLumens,
    setIsEntityAskOpen,
    setIsHealOpen,
    setIsRightPanelOpen,
    setIsShareOpen,
    setShareAmountLm,
    shareAmountLm,
    shareCountToday,
    shareDailyLimit,
    solarStatus,
    solarTimeLeft,
    t,
    takingDuration,
    user,
  };
}
