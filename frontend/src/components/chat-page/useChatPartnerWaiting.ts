'use client';

import { useCallback, useEffect, useState } from 'react';

type StartPartnerWaitingOptions = {
  disconnectCount?: number;
  maxDisconnects?: number;
  message: string;
  timeLeft?: number;
};

export function useChatPartnerWaiting() {
  const [isWaitingForPartner, setIsWaitingForPartner] = useState(false);
  const [waitingTimeLeft, setWaitingTimeLeft] = useState(60);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [disconnectCount, setDisconnectCount] = useState(0);
  const [maxDisconnects, setMaxDisconnects] = useState(2);

  const clearPartnerWaiting = useCallback(() => {
    setIsWaitingForPartner(false);
    setWaitingMessage('');
    setWaitingTimeLeft(60);
  }, []);

  const startPartnerWaiting = useCallback((options: StartPartnerWaitingOptions) => {
    setIsWaitingForPartner(true);
    setWaitingTimeLeft(options.timeLeft ?? 60);
    setWaitingMessage(options.message);
    setDisconnectCount(options.disconnectCount ?? 0);
    setMaxDisconnects(options.maxDisconnects ?? 2);
  }, []);

  useEffect(() => {
    if (!isWaitingForPartner || waitingTimeLeft <= 0) return;

    const timer = window.setInterval(() => {
      setWaitingTimeLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isWaitingForPartner, waitingTimeLeft]);

  return {
    clearPartnerWaiting,
    disconnectCount,
    isWaitingForPartner,
    maxDisconnects,
    startPartnerWaiting,
    waitingMessage,
    waitingTimeLeft,
  };
}
