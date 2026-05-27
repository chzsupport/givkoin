import { useState } from 'react';
import type { useAuth } from '@/context/AuthContext';
import { apiPost } from '@/utils/api';
import { emitFortuneRewardOffer } from '@/components/fortune/fortuneUtils';
import { TICKET_LENGTH } from './constants';

type AuthState = ReturnType<typeof useAuth>;

type LotteryToast = {
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
};

type UseLotteryTicketPurchaseParams = {
  clearTicketSlots: () => void;
  fetchTickets: () => Promise<void>;
  freeTickets: number;
  maxTicketsPerDay: number;
  refreshUser: AuthState['refreshUser'];
  t: (key: string) => string;
  ticketCost: number;
  ticketSlots: (number | null)[];
  ticketsToday: number;
  toast: LotteryToast;
  user: AuthState['user'];
};

export function useLotteryTicketPurchase({
  clearTicketSlots,
  fetchTickets,
  freeTickets,
  maxTicketsPerDay,
  refreshUser,
  t,
  ticketCost,
  ticketSlots,
  ticketsToday,
  toast,
  user,
}: UseLotteryTicketPurchaseParams) {
  const [isBuying, setIsBuying] = useState(false);

  const handleBuyTicket = async () => {
    const selectedNumbers = ticketSlots.filter((value): value is number => value !== null);
    if (selectedNumbers.length !== TICKET_LENGTH) {
      toast.error(t('common.error'), t('fortune.lottery_pick_7_numbers'));
      return;
    }
    if (!user || ticketsToday >= maxTicketsPerDay) return;
    if (freeTickets <= 0 && user.k < ticketCost) return;

    setIsBuying(true);
    try {
      const result = await apiPost<unknown>('/fortune/lottery/buy', { numbers: selectedNumbers }, { suppressBoostOffer: true });
      clearTicketSlots();
      toast.success(t('fortune.ticket_purchased'), t('fortune.lottery_good_luck'));
      emitFortuneRewardOffer(typeof result === 'object' && result !== null ? (result as { boostOffer?: unknown }).boostOffer : null);
      refreshUser();
      void fetchTickets();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('fortune.lottery_buy_error'));
    } finally {
      setIsBuying(false);
    }
  };

  return {
    handleBuyTicket,
    isBuying,
  };
}
