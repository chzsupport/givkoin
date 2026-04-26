'use client';

import { Vector3 } from 'three';

export type EnemyZoneId = `zone-${number}-${number}-${number}-${number}`;

export interface EnemyZone {
  id: EnemyZoneId;
  label: string;
  ordinal: number;
  row: number;
  col: number;
  baseIndex: number;
  baseRow: number;
  baseCol: number;
  subRow: number;
  subCol: number;
  subIndex: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface EnemyHitEvent {
  zoneId: EnemyZoneId | null;
  worldPoint: { x: number; y: number; z: number };
  weaponId: number;
}

export const ENEMY_GRID_COLS = 6;
export const ENEMY_GRID_ROWS = 5;
export const ENEMY_PLANE_Z = -260;

const xSegments = [-160, -110, -60, -10, 40, 90, 160];
const ySegments = [-60, -10, 40, 90, 140, 180];

const EXCLUDED_BASE_CELLS = new Set<number>([12, 14]);
const SUBDIVISIONS = 3;

const generatedZones: EnemyZone[] = [];

for (let baseRow = 0; baseRow < ENEMY_GRID_ROWS; baseRow++) {
  for (let baseCol = 0; baseCol < ENEMY_GRID_COLS; baseCol++) {
    const baseIndexZero = baseRow * ENEMY_GRID_COLS + baseCol;
    if (EXCLUDED_BASE_CELLS.has(baseIndexZero)) continue;

    const baseMinX = xSegments[baseCol];
    const baseMaxX = xSegments[baseCol + 1];
    const baseMinY = ySegments[baseRow];
    const baseMaxY = ySegments[baseRow + 1];

    for (let subRow = 0; subRow < SUBDIVISIONS; subRow++) {
      for (let subCol = 0; subCol < SUBDIVISIONS; subCol++) {
        const minX = baseMinX + ((baseMaxX - baseMinX) * subCol) / SUBDIVISIONS;
        const maxX = baseMinX + ((baseMaxX - baseMinX) * (subCol + 1)) / SUBDIVISIONS;
        const minY = baseMinY + ((baseMaxY - baseMinY) * subRow) / SUBDIVISIONS;
        const maxY = baseMinY + ((baseMaxY - baseMinY) * (subRow + 1)) / SUBDIVISIONS;

        const id: EnemyZoneId = `zone-${baseRow}-${baseCol}-${subRow}-${subCol}`;
        const ordinalBaseIndex = baseIndexZero + 1;
        const subIndex = subRow * SUBDIVISIONS + subCol + 1;
        const ordinal = baseIndexZero * (SUBDIVISIONS * SUBDIVISIONS) + subIndex;

        generatedZones.push({
          id,
          label: `${ordinalBaseIndex}.${subIndex}`,
          ordinal,
          row: baseRow * SUBDIVISIONS + subRow,
          col: baseCol * SUBDIVISIONS + subCol,
          baseIndex: ordinalBaseIndex,
          baseRow,
          baseCol,
          subRow,
          subCol,
          subIndex,
          minX,
          maxX,
          minY,
          maxY,
        });
      }
    }
  }
}

const EXCLUDED_ZONE_ORDINALS = new Set<number>([
  61, 62, 63, 58, 59, 55, 54, 53, 24, 21, 7, 4, 1, 115, 80, 81, 78, 75, 27,
]);

const activeSubZones = generatedZones.filter((zone) => !EXCLUDED_ZONE_ORDINALS.has(zone.ordinal));

const aggregatedBounds = activeSubZones.reduce(
  (acc, zone) => ({
    minX: Math.min(acc.minX, zone.minX),
    maxX: Math.max(acc.maxX, zone.maxX),
    minY: Math.min(acc.minY, zone.minY),
    maxY: Math.max(acc.maxY, zone.maxY),
  }),
  {
    minX: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  },
);

const fallbackBounds = {
  minX: xSegments[0],
  maxX: xSegments[xSegments.length - 1],
  minY: ySegments[0],
  maxY: ySegments[ySegments.length - 1],
};

const bounds =
  activeSubZones.length > 0 &&
  Number.isFinite(aggregatedBounds.minX) &&
  Number.isFinite(aggregatedBounds.maxX) &&
  Number.isFinite(aggregatedBounds.minY) &&
  Number.isFinite(aggregatedBounds.maxY)
    ? aggregatedBounds
    : fallbackBounds;

export const ENEMY_OUTLINE = bounds;

export const ENEMY_ZONES: EnemyZone[] =
  bounds.minX === bounds.maxX || bounds.minY === bounds.maxY
    ? []
    : [
        {
          id: 'zone-0-0-0-0',
          label: 'Мрак',
          ordinal: 1,
          row: 0,
          col: 0,
          baseIndex: 0,
          baseRow: 0,
          baseCol: 0,
          subRow: 0,
          subCol: 0,
          subIndex: 1,
          minX: bounds.minX,
          maxX: bounds.maxX,
          minY: bounds.minY,
          maxY: bounds.maxY,
        },
      ];

export const ENEMY_OUTLINE_WIDTH = ENEMY_OUTLINE.maxX - ENEMY_OUTLINE.minX;
export const ENEMY_OUTLINE_HEIGHT = ENEMY_OUTLINE.maxY - ENEMY_OUTLINE.minY;

export function findZoneForPoint(x: number, y: number): EnemyZone | null {
  return (
    ENEMY_ZONES.find(
      (zone) => x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY,
    ) ?? null
  );
}

export function isPointWithinOutline(x: number, y: number): boolean {
  return (
    x >= ENEMY_OUTLINE.minX &&
    x <= ENEMY_OUTLINE.maxX &&
    y >= ENEMY_OUTLINE.minY &&
    y <= ENEMY_OUTLINE.maxY
  );
}

export function normalizePointToOutline(x: number, y: number): { nx: number; ny: number } {
  return {
    nx: (x - ENEMY_OUTLINE.minX) / ENEMY_OUTLINE_WIDTH,
    ny: (y - ENEMY_OUTLINE.minY) / ENEMY_OUTLINE_HEIGHT,
  };
}

export function getZoneNormalizedBounds(zone: EnemyZone): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const left = (zone.minX - ENEMY_OUTLINE.minX) / ENEMY_OUTLINE_WIDTH;
  const right = (zone.maxX - ENEMY_OUTLINE.minX) / ENEMY_OUTLINE_WIDTH;
  const bottom = (zone.minY - ENEMY_OUTLINE.minY) / ENEMY_OUTLINE_HEIGHT;
  const top = (zone.maxY - ENEMY_OUTLINE.minY) / ENEMY_OUTLINE_HEIGHT;
  return { left, right, top, bottom };
}

export function computePlaneIntersection(
  start: Vector3,
  end: Vector3,
  planeZ: number,
): Vector3 | null {
  const startZ = start.z;
  const endZ = end.z;
  const denom = startZ - endZ;
  if (denom === 0) {
    return null;
  }
  const t = (startZ - planeZ) / denom;
  if (t < 0 || t > 1) {
    return null;
  }
  const ix = start.x + (end.x - start.x) * t;
  const iy = start.y + (end.y - start.y) * t;
  return new Vector3(ix, iy, planeZ);
}

export function denormalizeToWorld(nx: number, ny: number) {
  const clampedX = Math.min(1, Math.max(0, nx));
  const clampedY = Math.min(1, Math.max(0, ny));
  return {
    x: ENEMY_OUTLINE.minX + clampedX * ENEMY_OUTLINE_WIDTH,
    y: ENEMY_OUTLINE.minY + clampedY * ENEMY_OUTLINE_HEIGHT,
    z: ENEMY_PLANE_Z,
  };
}
