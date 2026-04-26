export type SideAdSlot = {
  width: number;
  height: number;
};

export function getResponsiveSideAdSlot(viewportWidth: number, viewportHeight: number): SideAdSlot | null {
  if (!viewportWidth || !viewportHeight) return null;

  const isLandscape = viewportWidth > viewportHeight;
  if (!isLandscape || viewportWidth < 1024) return null;

  if (viewportWidth >= 1600 && viewportHeight >= 860) {
    return { width: 300, height: 600 };
  }

  if (viewportWidth >= 1366 && viewportHeight >= 760) {
    return { width: 240, height: 400 };
  }

  if (viewportWidth >= 1280 && viewportHeight >= 720) {
    return { width: 160, height: 600 };
  }

  if (viewportWidth >= 1024 && viewportHeight >= 680) {
    return { width: 120, height: 600 };
  }

  return null;
}
