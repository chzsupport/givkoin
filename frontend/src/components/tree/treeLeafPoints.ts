import * as THREE from 'three';
import { MANUAL_LEAF_POINTS_TEXT } from './manualLeafPoints';

function parseManualLeafPoints(text: string) {
  const out: THREE.Vector3[] = [];
  const re = /\[leaf-point\]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(re);
    if (!m) continue;
    const x = Number(m[1]);
    const y = Number(m[2]);
    const z = Number(m[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out.push(new THREE.Vector3(x, y, z));
  }
  return out;
}

function getPointYBounds(points: THREE.Vector3[]) {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 1,
  };
}

export const MANUAL_LEAF_POINTS = parseManualLeafPoints(MANUAL_LEAF_POINTS_TEXT);
export const MANUAL_LEAF_BOUNDS = getPointYBounds(MANUAL_LEAF_POINTS);
