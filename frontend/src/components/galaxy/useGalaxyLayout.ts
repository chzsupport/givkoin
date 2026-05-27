import { useEffect, useState } from 'react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';

export function useGalaxyLayout() {
  const [windowWidth, setWindowWidth] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);

  useEffect(() => {
    const updateLayout = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowWidth(width);
      setIsLandscape(width > height);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    return () => {
      window.removeEventListener('resize', updateLayout);
    };
  }, []);

  return {
    windowWidth,
    isLandscape,
    sideAdSlot,
    isDesktop,
  };
}
