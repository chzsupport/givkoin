import * as THREE from 'three';
import {
  LEAF_AURA_BRIGHTNESS_SCALE,
  LEAF_BREATH_AMPLITUDE,
  LEAF_BRIGHTNESS_SCALE,
  LEAF_CORE_BRIGHTNESS_BOOST,
  LEAF_CORE_CONTRAST,
  LEAF_PULSE_POWER_SCALE,
  LEAF_PULSE_WHITE_SCALE,
  LEAF_RAINBOW_HALF_CYCLE,
  LEAF_SPARK_WHITE,
  LEAF_WAVE_GOLD,
  LEAF_WAVE_TOP_ZONE,
  TREE_SCENE_SCALE,
} from './treeSceneConfig';
import {
  applyColorContrast,
  clamp01,
  getEnergyPhase,
  hash01,
  hslToRgb,
  smooth01,
} from './treeSceneMath';
import { getPointBounds } from './treeSceneLeafPoints';
import type { LeafState, TreeState } from './treeSceneTypes';

export function createLeafSystem(points: THREE.Vector3[], leafGlowTexture: THREE.Texture): LeafState {
  const count = points.length;
  const coreColors = new Float32Array(count * 3);
  const auraColors = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
  }

  const sphereGeometry = new THREE.SphereGeometry(1.25 * TREE_SCENE_SCALE, 8, 8);
  const core = new THREE.InstancedMesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    count
  );
  core.renderOrder = 8;

  const auraGeometry = new THREE.BufferGeometry();
  auraGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const auraColorAttr = new THREE.BufferAttribute(auraColors, 3);
  auraGeometry.setAttribute('color', auraColorAttr);

  const aura = new THREE.Points(
    auraGeometry,
    new THREE.PointsMaterial({
      size: 10.5 * TREE_SCENE_SCALE,
      map: leafGlowTexture,
      alphaMap: leafGlowTexture,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      sizeAttenuation: true,
    })
  );
  aura.renderOrder = 7;

  const coreColorAttr = new THREE.InstancedBufferAttribute(coreColors, 3);
  core.instanceColor = coreColorAttr;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    dummy.position.copy(points[i]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    core.setMatrixAt(i, dummy.matrix);
  }

  core.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(aura);
  group.add(core);

  return {
    group,
    points,
    bounds: getPointBounds(points),
    coreColors,
    auraColors,
    coreColorAttr,
    auraColorAttr,
  };
}

export function updateLeaves(timeSeconds: number, leafState: LeafState | null, treeState: TreeState | null) {
  if (!leafState || !treeState) return;

  const phase = getEnergyPhase(timeSeconds);
  const { points, bounds, coreColors, auraColors, coreColorAttr, auraColorAttr } = leafState;
  const { minY, maxY } = bounds;
  const range = maxY - minY || TREE_SCENE_SCALE;
  const waveRange = Math.max(TREE_SCENE_SCALE, treeState.waveTopY - treeState.waveBottomY);
  const waveFrontY = THREE.MathUtils.lerp(treeState.waveBottomY, treeState.waveTopY, phase.flow);
  const waveBand = Math.max(10 * TREE_SCENE_SCALE, waveRange * 0.085);

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const py = point.y;
    const normY = (py - minY) / range;
    const tipWeight = smooth01((normY - (1 - LEAF_WAVE_TOP_ZONE)) / LEAF_WAVE_TOP_ZONE);
    const gemSeed = hash01(i * 17.13 + point.x * 0.051 + point.y * 0.023 + point.z * 0.041);
    const gemShift = hash01(i * 9.31 + point.x * 0.017 - point.z * 0.013 + normY * 5.7);
    const rainbowCycle =
      ((timeSeconds + gemShift * LEAF_RAINBOW_HALF_CYCLE * 2) / LEAF_RAINBOW_HALF_CYCLE) % 2;
    const rainbowPing = 1 - Math.abs(rainbowCycle - 1);
    const hue = THREE.MathUtils.lerp(0, 280, rainbowPing);
    const sat = 0.9 + gemSeed * 0.08;
    const light = 0.55 + gemShift * 0.14;
    let color = hslToRgb(hue, sat, light);

    const twinkle =
      0.78 + 0.22 * Math.sin(timeSeconds * (1.7 + gemSeed * 0.8) + i * 0.61 + gemShift * 7.4);
    const breath =
      1 + Math.sin(timeSeconds * Math.PI + gemShift * Math.PI * 2 + gemSeed * 4) * LEAF_BREATH_AMPLITUDE;
    const whiteSpark =
      Math.pow(
        clamp01(
          Math.sin(timeSeconds * (5.8 + gemSeed * 2.2) + i * 1.67 + gemShift * 10.2) * 0.5 + 0.5
        ),
        22
      ) * (0.04 + gemSeed * 0.1);
    const diamondFlash =
      Math.pow(
        clamp01(
          Math.sin(timeSeconds * (3.1 + gemSeed * 1.3) + i * 0.27 + gemShift * 17) * 0.5 + 0.5
        ),
        28
      ) * (0.06 + gemShift * 0.12);
    const flowTouch = phase.flowActive
      ? smooth01(1 - Math.abs(py - waveFrontY) / Math.max(14 * TREE_SCENE_SCALE, waveBand * 1.22))
      : 0;
    const pulseTouch = phase.leafPulse;

    color = color.lerp(LEAF_SPARK_WHITE, whiteSpark * 0.18 + diamondFlash * 0.28);
    color = color.lerp(LEAF_WAVE_GOLD, flowTouch * (0.16 + tipWeight * 0.1));
    color = color.lerp(
      LEAF_SPARK_WHITE,
      pulseTouch * 0.985 * LEAF_PULSE_WHITE_SCALE + whiteSpark * 0.1 + diamondFlash * 0.14
    );
    applyColorContrast(color, LEAF_CORE_CONTRAST);

    const corePower =
      (1.15 +
        twinkle * 0.38 +
        whiteSpark * 0.42 +
        diamondFlash * 0.78 +
        flowTouch * 0.9 +
        pulseTouch * 5.4 * LEAF_PULSE_POWER_SCALE) *
      LEAF_BRIGHTNESS_SCALE *
      LEAF_CORE_BRIGHTNESS_BOOST *
      breath;

    const auraPower =
      (0.34 +
        twinkle * 0.14 +
        whiteSpark * 0.14 +
        diamondFlash * 0.22 +
        flowTouch * 0.52 +
        pulseTouch * 1.9 * LEAF_PULSE_POWER_SCALE) *
      LEAF_BRIGHTNESS_SCALE *
      LEAF_AURA_BRIGHTNESS_SCALE *
      (0.8 + (breath - 1) * 0.35);

    coreColors[i * 3] = color.r * corePower;
    coreColors[i * 3 + 1] = color.g * corePower;
    coreColors[i * 3 + 2] = color.b * corePower;

    auraColors[i * 3] = color.r * auraPower;
    auraColors[i * 3 + 1] = color.g * auraPower;
    auraColors[i * 3 + 2] = color.b * auraPower;
  }

  coreColorAttr.needsUpdate = true;
  auraColorAttr.needsUpdate = true;
}
