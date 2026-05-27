'use client';

import { useEffect } from 'react';
import {
  readActiveElapsedSeconds,
  readSocketDate,
} from './chatParsing';

type ChatSocketEventsSocket = {
  emit(event: string, payload: Record<string, unknown>): void;
  on(event: string, listener: (data?: unknown) => void): void;
  off(event: string): void;
};

type UseChatSocketEventsOptions = {
  appendSocketMessage: (source: unknown) => void;
  chatId: unknown;
  clearActiveChat: () => void;
  clearPartnerWaiting: () => void;
  fetchMessages: () => void;
  freezeActiveDuration: (elapsedSeconds: number | null) => void;
  localePath: (path: string) => string;
  openRating: () => void;
  resetPausedActiveDuration: () => void;
  router: { push: (path: string) => void };
  setActiveDurationSeconds: (seconds: number) => void;
  setIsConnecting: (value: boolean) => void;
  setIsPartnerTyping: (value: boolean) => void;
  setStartedAt: (date: Date) => void;
  socket: ChatSocketEventsSocket | null;
  startPartnerWaiting: (options: {
    disconnectCount?: number;
    maxDisconnects?: number;
    message: string;
    timeLeft?: number;
  }) => void;
  t: (key: string) => string;
  touchChatActivity: () => void;
  userId?: string;
};

const toRecord = (source: unknown) => (
  source && typeof source === 'object'
    ? source as Record<string, unknown>
    : {}
);

const readNumberOrFallback = (value: unknown, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

export function useChatSocketEvents({
  appendSocketMessage,
  chatId,
  clearActiveChat,
  clearPartnerWaiting,
  fetchMessages,
  freezeActiveDuration,
  localePath,
  openRating,
  resetPausedActiveDuration,
  router,
  setActiveDurationSeconds,
  setIsConnecting,
  setIsPartnerTyping,
  setStartedAt,
  socket,
  startPartnerWaiting,
  t,
  touchChatActivity,
  userId,
}: UseChatSocketEventsOptions) {
  useEffect(() => {
    if (!socket || !chatId || !userId) return;

    socket.emit('chat:join', { chatId, userId });
    touchChatActivity();

    socket.on('new_message', (msg) => {
      appendSocketMessage(msg);
      setIsPartnerTyping(false);
    });

    socket.on('partner_left_early', () => {
      // Handled server-side; kept for the existing socket contract.
    });

    socket.on('chat_ended', (data) => {
      const row = toRecord(data);
      clearPartnerWaiting();
      const endedDuration = readActiveElapsedSeconds(row.duration);
      if (endedDuration != null) {
        setActiveDurationSeconds(endedDuration);
      }

      clearActiveChat();

      if (row.duration != null) {
        openRating();
        return;
      }

      setTimeout(() => {
        router.push(localePath('/tree'));
      }, 100);
    });

    socket.on('chat_closed', () => {
      clearActiveChat();
      setTimeout(() => {
        router.push(localePath('/cabinet/history'));
      }, 1000);
    });

    socket.on('rate_partner', () => {
      openRating();
    });

    socket.on('partner_rated', () => {
      openRating();
    });

    socket.on('partner_typing', () => {
      setIsPartnerTyping(true);
    });

    socket.on('partner_stop_typing', () => {
      setIsPartnerTyping(false);
    });

    socket.on('partner_disconnected', (data) => {
      const row = toRecord(data);
      const pausedSeconds = readActiveElapsedSeconds(row.activeElapsedSeconds);
      freezeActiveDuration(pausedSeconds);
      const fallbackKey = row.strictMode === false ? 'chat.partner_connection_lost_soft' : 'chat.partner_connection_lost_wait';
      const translatedMessage = typeof row.messageKey === 'string' ? t(row.messageKey) : '';
      startPartnerWaiting({
        disconnectCount: readNumberOrFallback(row.disconnectCount, 0),
        maxDisconnects: readNumberOrFallback(row.maxDisconnects, 2),
        message: translatedMessage || (typeof row.message === 'string' ? row.message : '') || t(fallbackKey),
        timeLeft: readNumberOrFallback(row.timeLeft, 60),
      });
    });

    socket.on('partner_reconnected', (data) => {
      const row = toRecord(data);
      const nextStartedAt = readSocketDate(row.startedAt);
      if (nextStartedAt) {
        setStartedAt(nextStartedAt);
      }
      resetPausedActiveDuration();
      clearPartnerWaiting();
      fetchMessages();
    });

    socket.on('chat_resumed', (data) => {
      const row = toRecord(data);
      const nextStartedAt = readSocketDate(row.startedAt);
      if (nextStartedAt) {
        setStartedAt(nextStartedAt);
      }
      resetPausedActiveDuration();
      clearPartnerWaiting();
      fetchMessages();
    });

    setIsConnecting(false);

    return () => {
      socket.off('new_message');
      socket.off('partner_left_early');
      socket.off('chat_ended');
      socket.off('chat_closed');
      socket.off('rate_partner');
      socket.off('partner_rated');
      socket.off('partner_typing');
      socket.off('partner_stop_typing');
      socket.off('partner_disconnected');
      socket.off('partner_reconnected');
      socket.off('chat_resumed');
    };
  }, [
    appendSocketMessage,
    chatId,
    clearActiveChat,
    clearPartnerWaiting,
    fetchMessages,
    freezeActiveDuration,
    localePath,
    openRating,
    resetPausedActiveDuration,
    router,
    setActiveDurationSeconds,
    setIsConnecting,
    setIsPartnerTyping,
    setStartedAt,
    socket,
    startPartnerWaiting,
    t,
    touchChatActivity,
    userId,
  ]);
}
