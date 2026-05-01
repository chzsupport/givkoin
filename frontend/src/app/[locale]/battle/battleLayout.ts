'use client';

import { ENEMY_OUTLINE, ENEMY_OUTLINE_HEIGHT, ENEMY_OUTLINE_WIDTH } from './enemyZones';

export const BATTLE_REFERENCE_WIDTH = 1400;
export const BATTLE_REFERENCE_HEIGHT = 900;
export const BATTLE_VIDEO_ASPECT_RATIO = 16 / 9;

const VIDEO_FRAME_SILHOUETTE_LEFT_PX = 530.574557;
const VIDEO_FRAME_SILHOUETTE_TOP_PX = 78.310053;
const VIDEO_FRAME_SILHOUETTE_WIDTH_PX = 364.548866;
const VIDEO_FRAME_SILHOUETTE_HEIGHT_PX = 420.322061;

const VIDEO_FRAME_SILHOUETTE_LEFT_RATIO = VIDEO_FRAME_SILHOUETTE_LEFT_PX / BATTLE_REFERENCE_WIDTH;
const VIDEO_FRAME_SILHOUETTE_TOP_RATIO = VIDEO_FRAME_SILHOUETTE_TOP_PX / BATTLE_REFERENCE_HEIGHT;
const VIDEO_FRAME_SILHOUETTE_WIDTH_RATIO = VIDEO_FRAME_SILHOUETTE_WIDTH_PX / BATTLE_REFERENCE_WIDTH;
const VIDEO_FRAME_SILHOUETTE_HEIGHT_RATIO = VIDEO_FRAME_SILHOUETTE_HEIGHT_PX / BATTLE_REFERENCE_HEIGHT;
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
): BattleSilhouetteLayout {
  const leftPx = viewport.coverWidth * VIDEO_FRAME_SILHOUETTE_LEFT_RATIO;
  const topPx = viewport.coverHeight * VIDEO_FRAME_SILHOUETTE_TOP_RATIO;
  const widthPx = viewport.coverWidth * VIDEO_FRAME_SILHOUETTE_WIDTH_RATIO;
  const heightPx = viewport.coverHeight * VIDEO_FRAME_SILHOUETTE_HEIGHT_RATIO;
  const centerOffsetX = (leftPx + (widthPx / 2)) - (viewport.coverWidth / 2);
  const centerOffsetY = (topPx + (heightPx / 2)) - (viewport.coverHeight / 2);

  return {
    widthPx,
    heightPx,
    leftPx,
    topPx,
    scaleX: widthPx / viewport.coverWidth,
    scaleY: heightPx / viewport.coverHeight,
    centerOffsetX,
    centerOffsetY,
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
