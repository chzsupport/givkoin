'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost, apiPostKeepalive } from '@/utils/api';
import { createMeditationClientSessionId } from './meditationSession';

type UseIndividualBreathingSessionOptions = {
  inhaleDuration: number;
};

export function useIndividualBreathingSession({
  inhaleDuration,
}: UseIndividualBreathingSessionOptions) {
  const [isBreathing, setIsBreathing] = useState(false);
  const inhaleStartedAtRef = useRef<number | null>(null);
  const clientSessionIdRef = useRef<string>('');
  const completedBreathsRef = useRef(0);
  const settledBreathsRef = useRef(0);
  const isSettlingRef = useRef(false);

  const flushBreaths = useCallback(async (useKeepalive = false) => {
    if (!clientSessionIdRef.current) return;
    if (completedBreathsRef.current <= settledBreathsRef.current) return;
    if (isSettlingRef.current) return;

    const payload = {
      clientSessionId: clientSessionIdRef.current,
      completedBreaths: completedBreathsRef.current,
    };

    if (useKeepalive) {
      apiPostKeepalive('/meditation/individual/settle', payload);
      settledBreathsRef.current = completedBreathsRef.current;
      return;
    }

    isSettlingRef.current = true;
    try {
      await apiPost('/meditation/individual/settle', payload);
      settledBreathsRef.current = completedBreathsRef.current;
    } catch {
      // ignore
    } finally {
      isSettlingRef.current = false;
    }
  }, []);

  const recordCompletedBreath = useCallback(() => {
    completedBreathsRef.current += 1;
    const unsent = completedBreathsRef.current - settledBreathsRef.current;
    if (unsent >= 10) {
      void flushBreaths(false);
    }
  }, [flushBreaths]);

  const startBreath = useCallback(() => {
    inhaleStartedAtRef.current = Date.now();
    setIsBreathing(true);
  }, []);

  const finishBreath = useCallback(() => {
    const startedAt = inhaleStartedAtRef.current;
    inhaleStartedAtRef.current = null;
    if (startedAt && Date.now() - startedAt >= inhaleDuration) {
      recordCompletedBreath();
    }
    setIsBreathing(false);
  }, [inhaleDuration, recordCompletedBreath]);

  const cancelBreath = useCallback(() => {
    inhaleStartedAtRef.current = null;
    setIsBreathing(false);
  }, []);

  useEffect(() => {
    clientSessionIdRef.current = createMeditationClientSessionId();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (event.repeat) return;
      event.preventDefault();
      startBreath();
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      event.preventDefault();
      finishBreath();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [finishBreath, startBreath]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushBreaths(true);
      }
    };

    const handlePageHide = () => {
      void flushBreaths(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      void flushBreaths(false);
    };
  }, [flushBreaths]);

  return {
    isBreathing,
    startBreath,
    finishBreath,
    cancelBreath,
  };
}
