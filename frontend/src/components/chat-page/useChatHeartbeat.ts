'use client';

import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import {
  CHAT_HEARTBEAT_ACTIVITY_GRACE_MS,
  CHAT_RELAXED_HEARTBEAT_MS,
  CHAT_STRICT_HEARTBEAT_MS,
  CHAT_STRICT_PHASE_MS,
} from './constants';

type NumberRef = MutableRefObject<number>;

type ChatHeartbeatSocket = {
  emit: (eventName: string, payload?: unknown) => void;
} | null | undefined;

type UseChatHeartbeatOptions = {
  socket: ChatHeartbeatSocket;
  chatId: unknown;
  isEnabled: boolean;
  isWaitingForPartner: boolean;
  activeDurationSecondsRef: NumberRef;
  lastLocalActivityAtRef: NumberRef;
  chatHeartbeatSentAtRef: NumberRef;
  touchChatActivity: () => void;
};

export function useChatHeartbeat({
  socket,
  chatId,
  isEnabled,
  isWaitingForPartner,
  activeDurationSecondsRef,
  lastLocalActivityAtRef,
  chatHeartbeatSentAtRef,
  touchChatActivity,
}: UseChatHeartbeatOptions) {
  const heartbeatTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!socket || !chatId || !isEnabled) return;

    const clearHeartbeatTimeout = () => {
      if (heartbeatTimeoutRef.current != null) {
        window.clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
    };

    const getHeartbeatState = () => {
      const strictMode = activeDurationSecondsRef.current * 1000 < CHAT_STRICT_PHASE_MS;
      const heartbeatIntervalMs = strictMode ? CHAT_STRICT_HEARTBEAT_MS : CHAT_RELAXED_HEARTBEAT_MS;
      return { strictMode, heartbeatIntervalMs };
    };

    const scheduleHeartbeat = (delayMs: number) => {
      clearHeartbeatTimeout();
      heartbeatTimeoutRef.current = window.setTimeout(() => {
        maybeHeartbeat();
      }, Math.max(250, delayMs));
    };

    const maybeHeartbeat = () => {
      clearHeartbeatTimeout();

      const now = Date.now();
      if (document.hidden || isWaitingForPartner) {
        return;
      }

      const { strictMode, heartbeatIntervalMs } = getHeartbeatState();
      const idleForMs = now - lastLocalActivityAtRef.current;
      const timeUntilDue = Math.max(0, heartbeatIntervalMs - (now - chatHeartbeatSentAtRef.current));

      if (!strictMode && idleForMs > CHAT_HEARTBEAT_ACTIVITY_GRACE_MS) {
        return;
      }

      if (timeUntilDue <= 250) {
        socket.emit('chat_heartbeat', { chatId: chatId.toString() });
        chatHeartbeatSentAtRef.current = now;
        scheduleHeartbeat(heartbeatIntervalMs);
        return;
      }

      scheduleHeartbeat(timeUntilDue);
    };

    const markActivity = () => {
      touchChatActivity();
      maybeHeartbeat();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearHeartbeatTimeout();
        return;
      }
      maybeHeartbeat();
    };

    window.addEventListener('pointerdown', markActivity, true);
    window.addEventListener('touchstart', markActivity, true);
    window.addEventListener('keydown', markActivity, true);
    window.addEventListener('focus', markActivity);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    maybeHeartbeat();

    return () => {
      clearHeartbeatTimeout();
      window.removeEventListener('pointerdown', markActivity, true);
      window.removeEventListener('touchstart', markActivity, true);
      window.removeEventListener('keydown', markActivity, true);
      window.removeEventListener('focus', markActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    socket,
    chatId,
    isEnabled,
    isWaitingForPartner,
    activeDurationSecondsRef,
    lastLocalActivityAtRef,
    chatHeartbeatSentAtRef,
    touchChatActivity,
  ]);
}
