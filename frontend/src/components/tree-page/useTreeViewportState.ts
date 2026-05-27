import { useEffect, useState } from 'react';

export function useTreeViewportState() {
  const [isTabVisible, setIsTabVisible] = useState(true);

  useEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    resetScroll();
    const frameId = window.requestAnimationFrame(resetScroll);
    const timeoutId = window.setTimeout(resetScroll, 300);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const syncVisibility = () => {
      setIsTabVisible(document.visibilityState !== 'hidden');
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  return { isTabVisible };
}
