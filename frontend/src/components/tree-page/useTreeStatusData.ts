import { useCallback, useEffect, useState } from 'react';
import { useBattleSocket } from '@/hooks/useBattleSocket';
import { apiGet, apiPost } from '@/utils/api';
import { getErrorMessage } from './treeErrors';
import type {
  BattleCurrentResponse,
  CollectFruitResponse,
  Injury,
  TreeStatusResponse,
  UserResourceSnapshot,
} from './types';

type TreeTranslate = (key: string) => string;

type TreeToast = {
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
};

type UseTreeStatusDataOptions = {
  loadSolarStatus: () => Promise<void>;
  refreshUser: () => Promise<unknown>;
  syncUserResources: (nextUser?: UserResourceSnapshot | null) => void;
  t: TreeTranslate;
  toast: TreeToast;
};

export function useTreeStatusData({
  loadSolarStatus,
  refreshUser,
  syncUserResources,
  t,
  toast,
}: UseTreeStatusDataOptions) {
  const { battleState } = useBattleSocket();
  const [isUnderAttack, setIsUnderAttack] = useState(false);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [isFruitAvailable, setIsFruitAvailable] = useState(false);

  const loadTreeStatus = useCallback(async () => {
    const tree = await apiGet<TreeStatusResponse>('/tree/status');
    setInjuries(Array.isArray(tree.injuries) ? tree.injuries : []);
    setIsFruitAvailable(Boolean(tree.isFruitAvailable));
  }, []);

  const loadBattleStatus = useCallback(async () => {
    const battle = await apiGet<BattleCurrentResponse>('/battles/current');
    setIsUnderAttack(battle.status === 'active');
  }, []);

  const handleCollectFruit = async () => {
    try {
      const data = await apiPost<CollectFruitResponse>('/tree/collect-fruit', {});
      const rewardType = data?.rewardType;
      const reward = data?.reward;

      if (rewardType === 'stars') {
        toast.success(t('tree.fruit_collected'), `${reward} ⭐`);
      } else if (rewardType === 'lumens') {
        toast.success(t('tree.fruit_collected'), `${reward} Lm`);
      } else {
        toast.success(t('tree.fruit_collected'), `${reward} K`);
      }
      setIsFruitAvailable(false);
      syncUserResources(data?.user);
      void refreshUser().catch((e) => {
        console.error('Failed to refresh user after fruit collection:', e);
      });

      await loadTreeStatus();
    } catch (e: unknown) {
      toast.error(t('common.error'), getErrorMessage(e) || t('tree.failed_collect_fruit'));
    }
  };

  const loadTreeData = useCallback(async () => {
    try {
      await loadTreeStatus();

      void loadSolarStatus().catch((e) => {
        console.error('Failed to load solar status:', e);
      });

      void loadBattleStatus().catch((e) => {
        console.error('Failed to load battle status:', e);
      });
    } catch (e) {
      console.error('Failed to load tree status:', e);
    }
  }, [loadBattleStatus, loadSolarStatus, loadTreeStatus]);

  useEffect(() => {
    const refreshBattleStatus = () => {
      void loadBattleStatus().catch((e) => {
        console.error('Failed to refresh battle status:', e);
      });
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === 'visible') {
        refreshBattleStatus();
      }
    };

    window.addEventListener('focus', refreshBattleStatus);
    window.addEventListener('online', refreshBattleStatus);
    document.addEventListener('visibilitychange', handleVisibilityRefresh);

    return () => {
      window.removeEventListener('focus', refreshBattleStatus);
      window.removeEventListener('online', refreshBattleStatus);
      document.removeEventListener('visibilitychange', handleVisibilityRefresh);
    };
  }, [loadBattleStatus]);

  useEffect(() => {
    if (!battleState) return;
    setIsUnderAttack(String(battleState.active?.status || '') === 'active');
  }, [battleState]);

  useEffect(() => {
    void loadTreeData();
  }, [loadTreeData]);

  return {
    handleCollectFruit,
    injuries,
    isFruitAvailable,
    isUnderAttack,
    loadTreeStatus,
    setInjuries,
  };
}
