'use client';

import { ENEMY_OUTLINE, ENEMY_OUTLINE_HEIGHT, ENEMY_OUTLINE_WIDTH } from './enemyZones';

export const BATTLE_REFERENCE_WIDTH = 2088;
export const BATTLE_REFERENCE_HEIGHT = 1080;
export const BATTLE_VIDEO_ASPECT_RATIO = BATTLE_REFERENCE_WIDTH / BATTLE_REFERENCE_HEIGHT;

const VIDEO_FRAME_SILHOUETTE_LEFT_PX = 806.235478;
const VIDEO_FRAME_SILHOUETTE_TOP_PX = 100.377759;
const VIDEO_FRAME_SILHOUETTE_WIDTH_PX = 505.541821;
const VIDEO_FRAME_SILHOUETTE_HEIGHT_PX = 512.017959;
const VIDEO_FRAME_CENTER_X_PX = 1059.006389;

const VIDEO_FRAME_SILHOUETTE_LEFT_RATIO = VIDEO_FRAME_SILHOUETTE_LEFT_PX / BATTLE_REFERENCE_WIDTH;
const VIDEO_FRAME_SILHOUETTE_TOP_RATIO = VIDEO_FRAME_SILHOUETTE_TOP_PX / BATTLE_REFERENCE_HEIGHT;
const VIDEO_FRAME_SILHOUETTE_WIDTH_RATIO = VIDEO_FRAME_SILHOUETTE_WIDTH_PX / BATTLE_REFERENCE_WIDTH;
const VIDEO_FRAME_SILHOUETTE_HEIGHT_RATIO = VIDEO_FRAME_SILHOUETTE_HEIGHT_PX / BATTLE_REFERENCE_HEIGHT;
const VIDEO_FRAME_CENTER_X_RATIO = VIDEO_FRAME_CENTER_X_PX / BATTLE_REFERENCE_WIDTH;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export type BattleViewportLayout = {
  width: number;
  height: number;
  aspectRatio: number;
  frameWidth: number;
  frameHeight: number;
  frameLeft: number;
  frameTop: number;
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
  let frameWidth = safeWidth;
  let frameHeight = frameWidth / BATTLE_VIDEO_ASPECT_RATIO;
  let frameLeft = 0;
  const frameTop = 0;
  if (aspectRatio < BATTLE_VIDEO_ASPECT_RATIO) {
    frameHeight = safeHeight;
    frameWidth = frameHeight * BATTLE_VIDEO_ASPECT_RATIO;
    const unclampedFrameLeft = (safeWidth / 2) - (VIDEO_FRAME_CENTER_X_RATIO * frameWidth);
    frameLeft = clamp(unclampedFrameLeft, safeWidth - frameWidth, 0);
  }
  const scale = frameWidth / BATTLE_REFERENCE_WIDTH;

  return {
    width: safeWidth,
    height: safeHeight,
    aspectRatio,
    frameWidth,
    frameHeight,
    frameLeft,
    frameTop,
    scale,
  };
}

export function getBattleSilhouetteLayout(
  viewport: BattleViewportLayout,
): BattleSilhouetteLayout {
  const leftPx = viewport.frameLeft + (VIDEO_FRAME_SILHOUETTE_LEFT_RATIO * viewport.frameWidth);
  const topPx = viewport.frameTop + (VIDEO_FRAME_SILHOUETTE_TOP_RATIO * viewport.frameHeight);
  const widthPx = VIDEO_FRAME_SILHOUETTE_WIDTH_RATIO * viewport.frameWidth;
  const heightPx = VIDEO_FRAME_SILHOUETTE_HEIGHT_RATIO * viewport.frameHeight;
  const centerOffsetX = (VIDEO_FRAME_SILHOUETTE_LEFT_RATIO + (VIDEO_FRAME_SILHOUETTE_WIDTH_RATIO / 2) - 0.5) * viewport.frameWidth;
  const centerOffsetY = (VIDEO_FRAME_SILHOUETTE_TOP_RATIO + (VIDEO_FRAME_SILHOUETTE_HEIGHT_RATIO / 2) - 0.5) * viewport.frameHeight;

  return {
    widthPx,
    heightPx,
    leftPx,
    topPx,
    scaleX: VIDEO_FRAME_SILHOUETTE_WIDTH_RATIO,
    scaleY: VIDEO_FRAME_SILHOUETTE_HEIGHT_RATIO,
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
