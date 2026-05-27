'use client';

import { useCallback, useEffect, useRef } from 'react';

export function useIncomingMessageSound() {
  const incomingAudioRef = useRef<HTMLAudioElement | null>(null);

  const playIncomingMessageSound = useCallback(() => {
    const audio = incomingAudioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => { });
  }, []);

  useEffect(() => {
    incomingAudioRef.current = new Audio('/new-message.mp3');
    incomingAudioRef.current.preload = 'auto';

    return () => {
      if (incomingAudioRef.current) {
        incomingAudioRef.current.pause();
        incomingAudioRef.current = null;
      }
    };
  }, []);

  return { playIncomingMessageSound };
}
