import { useCallback, useEffect, useState } from 'react';
import type { useAuth } from '@/context/AuthContext';
import { apiGet } from '@/utils/api';
import type { FortuneStats } from './types';
import { isFortuneRecord, mapFortuneStats } from './fortuneUtils';

type AuthState = ReturnType<typeof useAuth>;

export function useFortuneStatus({
  updateUser,
  user,
}: {
  updateUser: AuthState['updateUser'];
  user: AuthState['user'];
}) {
  const [stats, setStats] = useState<FortuneStats | null>(null);
  const [spinsLeft, setSpinsLeft] = useState(0);
  const [ticketsToday, setTicketsToday] = useState(0);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiGet<unknown>('/fortune/stats');
      setStats(mapFortuneStats(data));
    } catch (error) {
      console.error('Failed to fetch fortune stats:', error);
    }
  }, []);

  const fetchSpinsAndTickets = useCallback(async () => {
    try {
      const spinStatus = await apiGet<unknown>('/fortune/status');
      if (isFortuneRecord(spinStatus)) {
        setSpinsLeft(Number(spinStatus.spinsLeft) || 0);
        if (
          typeof spinStatus.luckyDayAvailable === 'boolean'
          && user
          && user.luckyDayAvailable !== spinStatus.luckyDayAvailable
        ) {
          updateUser({ ...user, luckyDayAvailable: spinStatus.luckyDayAvailable } as typeof user);
        }
      }

      const lotteryStatus = await apiGet<unknown>('/fortune/lottery/status');
      if (isFortuneRecord(lotteryStatus)) setTicketsToday(Number(lotteryStatus.ticketsToday) || 0);
    } catch (error) {
      console.error('Failed to fetch spins/tickets:', error);
    }
  }, [updateUser, user]);

  useEffect(() => {
    void fetchStats();
    void fetchSpinsAndTickets();
  }, [fetchStats, fetchSpinsAndTickets]);

  return {
    fetchSpinsAndTickets,
    fetchStats,
    spinsLeft,
    stats,
    ticketsToday,
  };
}
