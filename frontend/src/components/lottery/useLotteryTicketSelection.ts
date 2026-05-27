import { useState } from 'react';
import {
  LOTTERY_MAX_NUMBER,
  LOTTERY_MIN_NUMBER,
  TICKET_LENGTH,
} from './constants';

export function useLotteryTicketSelection() {
  const [ticketSlots, setTicketSlots] = useState<(number | null)[]>(
    Array.from({ length: TICKET_LENGTH }, () => null)
  );

  const handleRandomSelect = () => {
    const pool = Array.from({ length: LOTTERY_MAX_NUMBER }, (_, index) => index + LOTTERY_MIN_NUMBER);
    const shuffled = pool.sort(() => Math.random() - 0.5);
    setTicketSlots(shuffled.slice(0, TICKET_LENGTH));
  };

  const handleSlotChange = (index: number, rawValue: string) => {
    const digits = rawValue.replace(/\D/g, '').slice(0, 2);
    if (!digits) {
      setTicketSlots((prev) => {
        const next = [...prev];
        next[index] = null;
        return next;
      });
      return;
    }
    const value = Number(digits);
    if (Number.isNaN(value) || value < LOTTERY_MIN_NUMBER || value > LOTTERY_MAX_NUMBER) {
      return;
    }
    setTicketSlots((prev) => {
      const next = [...prev];
      const existingIndex = next.findIndex((num, slotIndex) => num === value && slotIndex !== index);
      if (existingIndex !== -1) {
        next[existingIndex] = null;
      }
      next[index] = value;
      return next;
    });
  };

  const handleNumberToggle = (value: number) => {
    setTicketSlots((prev) => {
      const next = [...prev];
      const existingIndex = next.findIndex((num) => num === value);
      if (existingIndex !== -1) {
        next[existingIndex] = null;
        return next;
      }
      const emptyIndex = next.findIndex((num) => num === null);
      if (emptyIndex === -1) {
        return next;
      }
      next[emptyIndex] = value;
      return next;
    });
  };

  const clearTicketSlots = () => {
    setTicketSlots(Array.from({ length: TICKET_LENGTH }, () => null));
  };

  return {
    clearTicketSlots,
    handleNumberToggle,
    handleRandomSelect,
    handleSlotChange,
    ticketSlots,
  };
}
