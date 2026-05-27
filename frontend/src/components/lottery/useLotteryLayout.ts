import { useEffect, useState } from 'react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';

export function useLotteryLayout() {
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
  const isDesktop = Boolean(sideAdSlot);

  useEffect(() => {
    const updateLayout = () => {
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  return {
    isDesktop,
    sideAdSlot,
  };
}
