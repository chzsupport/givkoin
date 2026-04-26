'use client';

import type { Vector3 } from 'three';

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
    visualOnly?: boolean;
    shotId?: string;
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

generatedZones.filter((zone) => !EXCLUDED_ZONE_ORDINALS.has(zone.ordinal));

const bounds = {
    minX: -368.32, // Exact camera view width at Z=-260 (FOV 75, 16:9)
    maxX: 368.32,
    minY: -207.18, // Exact camera view height at Z=-260
    maxY: 207.18,
};
export const ENEMY_OUTLINE = bounds;

export const ENEMY_ZONES: EnemyZone[] = [
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
    const point = start.clone().lerp(end, t);
    point.z = planeZ;
    return point;
}
