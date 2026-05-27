const PLANET_BASE_RADIUS = 2;
const PLANET_SCREEN_RATIO = 0.62;

export const getPlanetScale = (viewport: { width: number; height: number }) => {
    const minSide = Math.min(viewport.width, viewport.height);
    const targetDiameter = minSide * PLANET_SCREEN_RATIO;
    return targetDiameter / (PLANET_BASE_RADIUS * 2);
};
