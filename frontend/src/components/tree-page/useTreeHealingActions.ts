import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { apiPost } from '@/utils/api';
import { getErrorMessage } from './treeErrors';
import { applyOptimisticHealing } from './treeHealing';
import { createRadianceBursts } from './treeRadiance';
import type { HealTreeResponse, Injury, RadianceBurst, UserResourceSnapshot } from './types';

type TreeTranslate = (key: string) => string;

type TreeToast = {
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
};

type UseTreeHealingActionsOptions = {
  availableLumens: number;
  hasUser: boolean;
  loadTreeStatus: () => Promise<void>;
  onOptimisticLumensChange: (nextLumens: number) => void;
  refreshUser: () => Promise<unknown>;
  setInjuries: Dispatch<SetStateAction<Injury[]>>;
  syncUserResources: (nextUser?: UserResourceSnapshot | null) => void;
  t: TreeTranslate;
  toast: TreeToast;
};

export function useTreeHealingActions({
  availableLumens,
  hasUser,
  loadTreeStatus,
  onOptimisticLumensChange,
  refreshUser,
  setInjuries,
  syncUserResources,
  t,
  toast,
}: UseTreeHealingActionsOptions) {
  const [isHealOpen, setIsHealOpen] = useState(false);
  const [healLumens, setHealLumens] = useState('100');
  const [isHealing, setIsHealing] = useState(false);
  const [radianceBursts, setRadianceBursts] = useState<RadianceBurst[]>([]);

  const spawnRadianceBurst = (lumens: number) => {
    const created = createRadianceBursts(lumens, window.innerWidth, window.innerHeight);
    setRadianceBursts((prev) => [...prev, ...created]);
  };

  const handleRadianceBurstComplete = useCallback((id: string) => {
    setRadianceBursts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const handleHealTree = () => {
    if (isHealing) return;

    const lumens = Number(healLumens);
    if (!Number.isFinite(lumens) || lumens <= 0) {
      toast.error(t('common.error'), t('tree.enter_lm_amount'));
      return;
    }

    if (!hasUser) {
      toast.error(t('common.error'), t('errors.user_not_found'));
      return;
    }

    if (lumens > availableLumens) {
      toast.error(t('common.error'), t('tree.not_enough_lumens'));
      return;
    }

    setIsHealing(true);
    setIsHealOpen(false);
    spawnRadianceBurst(lumens);
    setInjuries((current) => applyOptimisticHealing(current, lumens));
    onOptimisticLumensChange(Math.max(0, availableLumens - lumens));
    toast.success(t('tree.healing'), `${t('common.thank_you')}! −${lumens.toLocaleString()} Lm`);

    void (async () => {
      try {
        const data = await apiPost<HealTreeResponse>('/tree/heal', { lumens });
        if (data?.user) {
          syncUserResources(data.user);
        } else {
          void refreshUser().catch((e) => {
            console.error('Failed to refresh user after healing:', e);
          });
        }
        void loadTreeStatus().catch((e) => {
          console.error('Failed to refresh tree status after healing:', e);
        });
      } catch (e: unknown) {
        toast.error(t('common.error'), getErrorMessage(e) || t('tree.failed_heal'));
        void refreshUser().catch((refreshError) => {
          console.error('Failed to restore user after healing error:', refreshError);
        });
        void loadTreeStatus().catch((treeError) => {
          console.error('Failed to restore tree status after healing error:', treeError);
        });
      } finally {
        setIsHealing(false);
      }
    })();
  };

  return {
    handleHealTree,
    handleRadianceBurstComplete,
    healLumens,
    isHealOpen,
    isHealing,
    radianceBursts,
    setHealLumens,
    setIsHealOpen,
  };
}
