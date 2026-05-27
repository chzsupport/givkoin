import { useEffect, useMemo, useState } from 'react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';

export function useBridgeLayout() {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateLayout = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

  const sideAdSlot = useMemo(
    () => getResponsiveSideAdSlot(viewport.width, viewport.height),
    [viewport.height, viewport.width],
  );

  return {
    windowWidth: viewport.width,
    isLandscape: viewport.width > viewport.height,
    sideAdSlot,
    isDesktop: Boolean(sideAdSlot),
  };
}
