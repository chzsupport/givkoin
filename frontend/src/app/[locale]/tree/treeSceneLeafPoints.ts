import * as THREE from 'three';
import { TREE_SCENE_SCALE } from './treeSceneConfig';

export function parseLeafPoints(text: string) {
  const points: THREE.Vector3[] = [];
  const re = /\[leaf-point\]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/;

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(re);
    if (!match) continue;

    const x = Number(match[1]);
    const y = Number(match[2]);
    const z = Number(match[3]);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    points.push(new THREE.Vector3(x, y, z));
  }

  return points;
}

export function getPointBounds(points: THREE.Vector3[]) {
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

export function scaleLeafPoints(points: THREE.Vector3[]) {
  return points.map((point) => point.clone().multiplyScalar(TREE_SCENE_SCALE));
}
