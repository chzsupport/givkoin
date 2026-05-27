import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/utils/api';
import {
  DEFAULT_MAX_TICKETS_DAILY,
  DEFAULT_TICKET_COST,
} from './constants';
import type { LotteryTicket } from './types';
import {
  getCountdownUntilNextDraw,
  mapLotteryStatusResponse,
} from './lotteryUtils';

type UseLotteryStatusParams = {
  refreshUser: () => unknown;
};

export function useLotteryStatus({
  refreshUser,
}: UseLotteryStatusParams) {
  const [tickets, setTickets] = useState<LotteryTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [ticketsToday, setTicketsToday] = useState(0);
  const [drawTimeLabel, setDrawTimeLabel] = useState('23:59');
  const [nextDrawCountdownMs, setNextDrawCountdownMs] = useState<number | null>(null);
  const [maxTicketsPerDay, setMaxTicketsPerDay] = useState(DEFAULT_MAX_TICKETS_DAILY);
  const [ticketCost, setTicketCost] = useState(DEFAULT_TICKET_COST);
  const [freeTickets, setFreeTickets] = useState(0);
  const [prize, setPrize] = useState(0);
  const [lotteryStatus, setLotteryStatus] = useState<string>('open');

  const fetchTickets = useCallback(async () => {
    try {
      const data = await apiGet<unknown>('/fortune/lottery/status');
      const nextStatus = mapLotteryStatusResponse(data);
      setTickets(nextStatus.tickets);
      setTicketsToday(nextStatus.ticketsToday);
      setDrawTimeLabel(nextStatus.drawTimeLabel);
      setNextDrawCountdownMs(nextStatus.nextDrawCountdownMs);
      setMaxTicketsPerDay(nextStatus.maxTicketsPerDay);
      setTicketCost(nextStatus.ticketCost);
      setFreeTickets(nextStatus.freeTickets);
      setPrize(nextStatus.prize);
      setLotteryStatus(nextStatus.status);
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
      setNextDrawCountdownMs((prev) => prev ?? getCountdownUntilNextDraw('23:59'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    setNextDrawCountdownMs((prev) => prev ?? getCountdownUntilNextDraw(drawTimeLabel));
  }, [drawTimeLabel]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNextDrawCountdownMs((prev) => {
        if (prev === null) return prev;
        if (prev <= 1000) return 0;
        return prev - 1000;
      });
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (nextDrawCountdownMs !== 0) return;
    const timeoutId = window.setTimeout(() => {
      void fetchTickets();
    }, 1500);
    return () => window.clearTimeout(timeoutId);
  }, [fetchTickets, nextDrawCountdownMs]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ offerType?: string }>).detail;
      if (detail?.offerType !== 'lottery_free_ticket') return;
      void fetchTickets();
      refreshUser();
    };
    window.addEventListener('givkoin:ad-boost-completed', handler);
    return () => window.removeEventListener('givkoin:ad-boost-completed', handler);
  }, [fetchTickets, refreshUser]);

  return {
    drawTimeLabel,
    fetchTickets,
    freeTickets,
    loading,
    lotteryStatus,
    maxTicketsPerDay,
    nextDrawCountdownMs,
    prize,
    ticketCost,
    tickets,
    ticketsToday,
  };
}
