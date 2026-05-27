import { useEffect, useMemo, useState } from 'react';
import type { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/utils/api';
import { loadGratitudeDrafts, saveGratitudeDrafts } from './gratitudeStorage';
import {
  GRATITUDE_COUNT,
  type GratitudeCompleteResponse,
  type GratitudeRewardConfig,
  type GratitudeTodayResponse,
} from './types';

type AuthState = ReturnType<typeof useAuth>;

type GratitudeToast = {
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
};

type UseGratitudeDailyEntriesParams = {
  t: (key: string) => string;
  toast: GratitudeToast;
  updateUser: AuthState['updateUser'];
};

export function useGratitudeDailyEntries({
  t,
  toast,
  updateUser,
}: UseGratitudeDailyEntriesParams) {
  const [serverDay, setServerDay] = useState('');
  const [entries, setEntries] = useState<string[]>(Array(GRATITUDE_COUNT).fill(''));
  const [rewarded, setRewarded] = useState<boolean[]>(Array(GRATITUDE_COUNT).fill(false));
  const [isLoading, setIsLoading] = useState(true);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [rewardConfig, setRewardConfig] = useState<GratitudeRewardConfig>({
    kRewardPerEntry: 5,
    starsPerEntry: 0.001,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await apiGet<GratitudeTodayResponse>('/practice/gratitude/today');
        if (cancelled) return;
        const nextRewarded = Array.from({ length: GRATITUDE_COUNT }, (_, index) => response.completedIndexes.includes(index));
        setServerDay(response.serverDay);
        setRewarded(nextRewarded);
        setEntries(loadGratitudeDrafts(response.serverDay));
        setRewardConfig({
          kRewardPerEntry: Number(response.rewards?.kRewardPerEntry) || 5,
          starsPerEntry: Number(response.rewards?.starsPerEntry) || 0.001,
        });
      } catch {
        if (!cancelled) {
          toast.error(t('common.error'), t('practice_gratitude.failed_load'));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [t, toast]);

  useEffect(() => {
    if (!serverDay) return;
    saveGratitudeDrafts(serverDay, entries);
  }, [entries, serverDay]);

  const handleEntryChange = (index: number, value: string) => {
    setEntries((prev) => prev.map((entry, idx) => (idx === index ? value : entry)));
  };

  const handleEntrySave = async (index: number) => {
    const value = entries[index]?.trim();
    if (!value) {
      toast.error(t('practice_gratitude.empty_title'), t('practice_gratitude.empty_desc'));
      return;
    }
    if (!serverDay || rewarded[index] || savingIndex !== null) return;

    setSavingIndex(index);
    try {
      const response = await apiPost<GratitudeCompleteResponse>('/practice/gratitude/complete', { index });
      const nextRewarded = Array.from({ length: GRATITUDE_COUNT }, (_, idx) => response.completedIndexes.includes(idx));
      setRewarded(nextRewarded);
      if (response.user) {
        updateUser(response.user as Parameters<typeof updateUser>[0]);
      }
      if (response.already) {
        toast.success(t('practice_gratitude.already_saved_title'), t('practice_gratitude.already_saved_desc'));
      } else {
        toast.success(
          t('practice_gratitude.saved_title'),
          t('practice_gratitude.reward_format')
            .replace('{k}', String(response.awardedK))
            .replace('{stars}', String(response.awardedStars.toFixed(3)))
        );
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('practice_gratitude.failed_save'));
    } finally {
      setSavingIndex(null);
    }
  };

  const rewardedCount = useMemo(() => rewarded.filter(Boolean).length, [rewarded]);

  return {
    entries,
    rewarded,
    isLoading,
    savingIndex,
    rewardConfig,
    rewardedCount,
    handleEntryChange,
    handleEntrySave,
  };
}
