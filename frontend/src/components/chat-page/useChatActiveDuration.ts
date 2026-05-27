'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useChatActiveDuration(startedAt: Date, isWaitingForPartner: boolean) {
  const [activeDurationSeconds, setActiveDurationSeconds] = useState(0);
  const pausedActiveDurationRef = useRef<number | null>(null);
  const activeDurationSecondsRef = useRef(0);

  const computeActiveDurationSeconds = useCallback(() => {
    return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000));
  }, [startedAt]);

  const freezeActiveDuration = useCallback((elapsedSeconds: number | null) => {
    const serverSeconds = elapsedSeconds != null ? Math.max(0, Math.floor(elapsedSeconds)) : null;
    const currentVisibleSeconds = Math.max(0, Math.floor(activeDurationSecondsRef.current || 0));
    const pausedSeconds = pausedActiveDurationRef.current != null
      ? Math.max(0, Math.floor(pausedActiveDurationRef.current))
      : null;
    const fallbackSeconds = pausedSeconds != null
      ? Math.max(pausedSeconds, currentVisibleSeconds)
      : Math.max(currentVisibleSeconds, computeActiveDurationSeconds());
    const frozenSeconds = serverSeconds != null && serverSeconds > 0
      ? serverSeconds
      : Math.max(serverSeconds ?? 0, fallbackSeconds);

    pausedActiveDurationRef.current = frozenSeconds;
    activeDurationSecondsRef.current = frozenSeconds;
    setActiveDurationSeconds(frozenSeconds);
  }, [computeActiveDurationSeconds]);

  const resetPausedActiveDuration = useCallback(() => {
    pausedActiveDurationRef.current = null;
  }, []);

  const setPausedActiveDuration = useCallback((seconds: number) => {
    pausedActiveDurationRef.current = seconds;
    activeDurationSecondsRef.current = seconds;
    setActiveDurationSeconds(seconds);
  }, []);

  useEffect(() => {
    const updateActiveDuration = () => {
      if (isWaitingForPartner) {
        if (pausedActiveDurationRef.current == null) {
          pausedActiveDurationRef.current = computeActiveDurationSeconds();
        }
        setActiveDurationSeconds(pausedActiveDurationRef.current);
        return;
      }

      pausedActiveDurationRef.current = null;
      setActiveDurationSeconds(computeActiveDurationSeconds());
    };

    updateActiveDuration();
    const timer = window.setInterval(updateActiveDuration, 1000);
    return () => window.clearInterval(timer);
  }, [computeActiveDurationSeconds, isWaitingForPartner]);

  useEffect(() => {
    activeDurationSecondsRef.current = activeDurationSeconds;
  }, [activeDurationSeconds]);

  return {
    activeDurationSeconds,
    activeDurationSecondsRef,
    freezeActiveDuration,
    resetPausedActiveDuration,
    setActiveDurationSeconds,
    setPausedActiveDuration,
  };
}
