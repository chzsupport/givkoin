import { useRef, useState } from 'react';
import type { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/utils/api';
import { emitFortuneRewardOffer } from './fortuneUtils';

type AuthState = ReturnType<typeof useAuth>;

type FortuneToast = {
  error: (title: string, message?: string) => void;
};

type UseFortuneLuckyDrawParams = {
  fetchSpinsAndTickets: () => Promise<void>;
  fetchStats: () => Promise<void>;
  refreshUser: AuthState['refreshUser'];
  t: (key: string) => string;
  toast: FortuneToast;
  updateUser: AuthState['updateUser'];
  user: AuthState['user'];
};

export function useFortuneLuckyDraw({
  fetchSpinsAndTickets,
  fetchStats,
  refreshUser,
  t,
  toast,
  updateUser,
  user,
}: UseFortuneLuckyDrawParams) {
  const [showLuckyResult, setShowLuckyResult] = useState(false);
  const [luckyPrize, setLuckyPrize] = useState<string | null>(null);
  const [pendingLuckyOffer, setPendingLuckyOffer] = useState<unknown>(null);
  const [isSpinningLucky, setIsSpinningLucky] = useState(false);
  const luckyRequestLockRef = useRef(false);

  const handleLuckyDraw = async () => {
    if (!user?.luckyDayAvailable || isSpinningLucky || luckyRequestLockRef.current) return;

    luckyRequestLockRef.current = true;
    setIsSpinningLucky(true);
    try {
      const res = await apiPost<unknown>('/fortune/lucky-draw', {}, { suppressBoostOffer: true });
      const prize = typeof res === 'object' && res !== null && 'prize' in res ? String((res as { prize?: unknown }).prize) : '';
      setLuckyPrize(prize);
      setPendingLuckyOffer(typeof res === 'object' && res !== null ? (res as { boostOffer?: unknown }).boostOffer || null : null);
      setShowLuckyResult(true);
      updateUser({ ...user, luckyDayAvailable: false });
      await Promise.all([
        refreshUser(),
        fetchStats(),
        fetchSpinsAndTickets(),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('fortune.lucky_draw_error'));
    } finally {
      setIsSpinningLucky(false);
      luckyRequestLockRef.current = false;
    }
  };

  const closeLuckyResult = () => {
    setShowLuckyResult(false);
    const offer = pendingLuckyOffer;
    setPendingLuckyOffer(null);
    if (offer) {
      window.setTimeout(() => emitFortuneRewardOffer(offer), 160);
    }
  };

  return {
    closeLuckyResult,
    handleLuckyDraw,
    isSpinningLucky,
    luckyPrize,
    showLuckyResult,
  };
}
