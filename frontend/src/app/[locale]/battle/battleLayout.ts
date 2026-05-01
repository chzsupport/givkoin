'use client';

import { ENEMY_OUTLINE, ENEMY_OUTLINE_HEIGHT, ENEMY_OUTLINE_WIDTH } from './enemyZones';

export const BATTLE_REFERENCE_WIDTH = 1400;
export const BATTLE_REFERENCE_HEIGHT = 900;
export const BATTLE_VIDEO_ASPECT_RATIO = 16 / 9;

const BASE_SILHOUETTE_SCALE_Y = (40131 / 80000) * 0.98 * 0.95;
const BASE_SILHOUETTE_SCALE_X = BASE_SILHOUETTE_SCALE_Y * 0.7 * 0.9 * 0.95 * 0.97 * 0.98 * 0.98;
const BASE_SILHOUETTE_OFFSET_X_PERCENT = 1;
const BASE_SILHOUETTE_OFFSET_Y_PERCENT = -31;

const BASE_SILHOUETTE_WIDTH_PX = BATTLE_REFERENCE_WIDTH * BASE_SILHOUETTE_SCALE_X;
const BASE_SILHOUETTE_HEIGHT_PX = BATTLE_REFERENCE_HEIGHT * BASE_SILHOUETTE_SCALE_Y;
const BASE_SILHOUETTE_LEFT_PX =
  BATTLE_REFERENCE_WIDTH
  * (1 - BASE_SILHOUETTE_SCALE_X)
  * (0.5 + (BASE_SILHOUETTE_OFFSET_X_PERCENT / 100));
const BASE_SILHOUETTE_TOP_PX =
  BATTLE_REFERENCE_HEIGHT
  * (1 - BASE_SILHOUETTE_SCALE_Y)
  * (0.5 + (BASE_SILHOUETTE_OFFSET_Y_PERCENT / 100));
const BASE_SILHOUETTE_CENTER_OFFSET_X_PX =
  (BASE_SILHOUETTE_LEFT_PX + (BASE_SILHOUETTE_WIDTH_PX / 2)) - (BATTLE_REFERENCE_WIDTH / 2);
const BASE_SILHOUETTE_CENTER_OFFSET_Y_PX =
  (BASE_SILHOUETTE_TOP_PX + (BASE_SILHOUETTE_HEIGHT_PX / 2)) - (BATTLE_REFERENCE_HEIGHT / 2);

export type BattleViewportLayout = {
  width: number;
  height: number;
  aspectRatio: number;
  coverWidth: number;
  coverHeight: number;
  scale: number;
};

export type BattleDomeLayout = {
  center: { x: number; y: number };
  radius: number;
  visualScale: number;
  blinkAt: number;
  worldCenter: { x: number; y: number };
  worldRadius: number;
  screen: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type BattleSilhouetteLayout = {
  widthPx: number;
  heightPx: number;
  leftPx: number;
  topPx: number;
  scaleX: number;
  scaleY: number;
  centerOffsetX: number;
  centerOffsetY: number;
};

export type BattleSceneLayout = {
  viewport: BattleViewportLayout;
  dome: BattleDomeLayout;
  tree: {
    scale: [number, number, number];
    position: [number, number, number];
  };
  silhouette: BattleSilhouetteLayout;
};

type BattleSilhouetteOptions = {
  mobile?: boolean;
};

const MOBILE_SILHOUETTE_SHIFT_X_PERCENT = 4;
const MOBILE_SILHOUETTE_SHIFT_Y_PERCENT = -7;
const MOBILE_SILHOUETTE_SCALE = 2 * 0.97 * 0.98 * 0.98 * 0.97 * 0.99 * 1.02;
const MOBILE_SILHOUETTE_WIDTH_STRETCH = 1.01;

export function getBattleViewportLayout(width?: number, height?: number): BattleViewportLayout {
  const safeWidth = Math.max(1, Math.round(Number(width) || BATTLE_REFERENCE_WIDTH));
  const safeHeight = Math.max(1, Math.round(Number(height) || BATTLE_REFERENCE_HEIGHT));
  const aspectRatio = safeWidth / safeHeight;

  const coverWidth =
    aspectRatio > BATTLE_VIDEO_ASPECT_RATIO
      ? safeWidth
      : safeHeight * BATTLE_VIDEO_ASPECT_RATIO;
  const coverHeight =
    aspectRatio > BATTLE_VIDEO_ASPECT_RATIO
      ? safeWidth / BATTLE_VIDEO_ASPECT_RATIO
      : safeHeight;

  return {
    width: safeWidth,
    height: safeHeight,
    aspectRatio,
    coverWidth,
    coverHeight,
    scale: Math.min(safeWidth, safeHeight) / BATTLE_REFERENCE_HEIGHT,
  };
}

export function getBattleSilhouetteLayout(
  viewport: BattleViewportLayout,
  options?: BattleSilhouetteOptions,
): BattleSilhouetteLayout {
  const mobileScale = options?.mobile ? MOBILE_SILHOUETTE_SCALE : 1;
  const mobileWidthStretch = options?.mobile ? MOBILE_SILHOUETTE_WIDTH_STRETCH : 1;
  const mobileShiftXPx = options?.mobile ? viewport.coverWidth * (MOBILE_SILHOUETTE_SHIFT_X_PERCENT / 100) : 0;
  const mobileShiftYPx = options?.mobile ? viewport.coverHeight * (MOBILE_SILHOUETTE_SHIFT_Y_PERCENT / 100) : 0;
  const widthPx = BASE_SILHOUETTE_WIDTH_PX * viewport.scale * mobileScale * mobileWidthStretch;
  const heightPx = BASE_SILHOUETTE_HEIGHT_PX * viewport.scale * mobileScale;
  const centerX = (viewport.coverWidth / 2) + (BASE_SILHOUETTE_CENTER_OFFSET_X_PX * viewport.scale) + mobileShiftXPx;
  const centerY = (viewport.coverHeight / 2) + (BASE_SILHOUETTE_CENTER_OFFSET_Y_PX * viewport.scale) + mobileShiftYPx;
  const leftPx = centerX - (widthPx / 2);
  const topPx = centerY - (heightPx / 2);

  return {
    widthPx,
    heightPx,
    leftPx,
    topPx,
    scaleX: widthPx / viewport.coverWidth,
    scaleY: heightPx / viewport.coverHeight,
    centerOffsetX: BASE_SILHOUETTE_CENTER_OFFSET_X_PX * viewport.scale,
    centerOffsetY: BASE_SILHOUETTE_CENTER_OFFSET_Y_PX * viewport.scale,
  };
}

export function getBattleDomeLayout(
  center: { x: number; y: number },
  radius: number,
  visualScale: number,
  blinkAt: number,
): BattleDomeLayout {
  const worldMin = Math.min(ENEMY_OUTLINE_WIDTH, ENEMY_OUTLINE_HEIGHT);
  const worldRadius = radius * visualScale * worldMin;
  const worldCenter = {
    x: ENEMY_OUTLINE.minX + (center.x * ENEMY_OUTLINE_WIDTH),
    y: ENEMY_OUTLINE.maxY - (center.y * ENEMY_OUTLINE_HEIGHT),
  };
  const width = (worldRadius * 2) / ENEMY_OUTLINE_WIDTH;
  const height = (worldRadius * 2) / ENEMY_OUTLINE_HEIGHT;

  return {
    center,
    radius,
    visualScale,
    blinkAt,
    worldCenter,
    worldRadius,
    screen: {
      left: center.x - (width / 2),
      top: center.y - (height / 2),
      width,
      height,
    },
  };
}

export function getBattleDomeDiameterPx(
  viewport: BattleViewportLayout,
  radius: number,
  visualScale: number,
): number {
  return radius * visualScale * 2.1 * Math.min(viewport.width, viewport.height);
}

export function getBattleAttachedWorldPoint(
  viewport: BattleViewportLayout,
  dome: Pick<BattleDomeLayout, 'center' | 'radius' | 'visualScale'>,
  angle: number,
) {
  const radiusPx = getBattleDomeDiameterPx(viewport, dome.radius, dome.visualScale) / 2;
  const centerPxX = viewport.width * dome.center.x;
  const centerPxY = viewport.height * dome.center.y;
  const screenX = centerPxX + Math.cos(angle) * radiusPx;
  const screenY = centerPxY + Math.sin(angle) * radiusPx;
  const nx = screenX / viewport.width;
  const topBasedY = screenY / viewport.height;

  return {
    x: ENEMY_OUTLINE.minX + (nx * ENEMY_OUTLINE_WIDTH),
    y: ENEMY_OUTLINE.maxY - (topBasedY * ENEMY_OUTLINE_HEIGHT),
  };
}
