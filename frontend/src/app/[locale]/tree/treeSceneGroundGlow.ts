import * as THREE from 'three';
import {
  ENERGY_CHARGE_DURATION,
  TREE_SCENE_SCALE,
} from './treeSceneConfig';
import { getEnergyPhase } from './treeSceneMath';
import type { GroundGlowState } from './treeSceneTypes';

export function createGroundGlow(leafGlowTexture: THREE.Texture): GroundGlowState {
  const group = new THREE.Group();
  group.position.set(0, 52 * TREE_SCENE_SCALE, 0);
  group.renderOrder = 4;

  const light = new THREE.PointLight('#74fff1', 4, 360 * TREE_SCENE_SCALE, 1.5);
  light.position.set(0, 10 * TREE_SCENE_SCALE, 0);
  group.add(light);

  const ringMaterial = new THREE.MeshBasicMaterial({
    map: leafGlowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const ring = new THREE.Mesh(new THREE.CircleGeometry(88 * TREE_SCENE_SCALE, 96), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4 * TREE_SCENE_SCALE;
  group.add(ring);

  const coreMaterial = new THREE.SpriteMaterial({
    map: leafGlowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const core = new THREE.Sprite(coreMaterial);
  core.rotation.x = Math.PI / 2;
  group.add(core);

  return { group, light, ring, ringMaterial, core, coreMaterial };
}

export function updateGroundGlow(timeSeconds: number, groundState: GroundGlowState | null) {
  if (!groundState) return;

  const phase = getEnergyPhase(timeSeconds);
  const glow =
    phase.cycleT < ENERGY_CHARGE_DURATION
      ? 0.18 + phase.charge * 1.25
      : 0.12 + Math.max(0, 1 - phase.flow) * 0.32;

  const size = (72 + glow * 60) * TREE_SCENE_SCALE;
  groundState.core.scale.set(size, size, 1);

  const scale = 1 + glow * 0.2;
  groundState.ring.scale.set(scale, scale * 0.82, 1);
  groundState.ring.rotation.z = timeSeconds * 0.08;

  groundState.coreMaterial.opacity = Math.min(0.4, 0.09 + glow * 0.22);
  groundState.coreMaterial.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.55);

  groundState.ringMaterial.opacity = Math.min(0.22, 0.05 + glow * 0.1);
  groundState.ringMaterial.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.42);

  groundState.light.intensity = 2.4 + glow * 10 + phase.leafPulse * 3.2;
  groundState.light.distance = (300 + glow * 180) * TREE_SCENE_SCALE;
  groundState.light.color.set('#74fff1').lerp(new THREE.Color('#ffe08c'), phase.charge * 0.46);
}
