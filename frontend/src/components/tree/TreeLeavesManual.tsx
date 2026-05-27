import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MANUAL_LEAF_BOUNDS, MANUAL_LEAF_POINTS } from './treeLeafPoints';
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
  applyColorContrast,
  clamp01,
  getEnergyPhase,
  hash01,
  hslToRgb,
  smooth01,
} from './treeEnergy';
import { makeRadialTexture } from './treeTextures';

export function TreeLeavesManual({
  waveBottomY,
  waveTopY,
}: {
  waveBottomY: number;
  waveTopY: number;
}) {
  const points = MANUAL_LEAF_POINTS;
  const { minY, maxY } = MANUAL_LEAF_BOUNDS;
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const coreColorArr = useMemo(() => new Float32Array(points.length * 3), [points.length]);
  const auraColorArr = useMemo(() => new Float32Array(points.length * 3), [points.length]);
  const auraTexture = useMemo(
    () =>
      makeRadialTexture({
        inner: 0,
        outer: 128,
        stops: [
          [0, 1],
          [0.34, 0.82],
          [0.7, 0.22],
          [1, 0],
        ],
      }),
    []
  );
  const auraGeometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3);
    for (let i = 0; i < points.length; i += 1) {
      positions[i * 3] = points[i].x;
      positions[i * 3 + 1] = points[i].y;
      positions[i * 3 + 2] = points[i].z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(auraColorArr, 3));
    return geometry;
  }, [points, auraColorArr]);

  useEffect(() => {
    const inst = coreRef.current;
    if (!inst) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < points.length; i += 1) {
      dummy.position.copy(points[i]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.instanceColor = new THREE.InstancedBufferAttribute(coreColorArr, 3);
  }, [points, coreColorArr]);

  useEffect(() => {
    return () => {
      auraGeometry.dispose();
      auraTexture.dispose();
    };
  }, [auraGeometry, auraTexture]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const phase = getEnergyPhase(t);
    const range = maxY - minY || 1;
    const travelBottomY = Number.isFinite(waveBottomY) ? waveBottomY : 0;
    const travelTopY = Number.isFinite(waveTopY) && waveTopY > travelBottomY
      ? waveTopY
      : travelBottomY + 1;
    const waveRange = Math.max(1, travelTopY - travelBottomY);
    const waveFrontY = THREE.MathUtils.lerp(travelBottomY, travelTopY, phase.flow);
    const waveBand = Math.max(10, waveRange * 0.085);

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const py = point.y;
      const normY = (py - minY) / range;
      const tipWeight = smooth01((normY - (1 - LEAF_WAVE_TOP_ZONE)) / LEAF_WAVE_TOP_ZONE);
      const gemSeed = hash01(i * 17.13 + point.x * 0.051 + point.y * 0.023 + point.z * 0.041);
      const gemShift = hash01(i * 9.31 + point.x * 0.017 - point.z * 0.013 + normY * 5.7);
      const rainbowCycle = ((t + gemShift * LEAF_RAINBOW_HALF_CYCLE * 2) / LEAF_RAINBOW_HALF_CYCLE) % 2;
      const rainbowPing = 1 - Math.abs(rainbowCycle - 1);
      const hue = THREE.MathUtils.lerp(0, 280, rainbowPing);
      const sat = 0.9 + gemSeed * 0.08;
      const light = 0.55 + gemShift * 0.14;
      let col = hslToRgb(hue, sat, light);

      const twinkle = 0.78 + 0.22 * Math.sin(t * (1.7 + gemSeed * 0.8) + i * 0.61 + gemShift * 7.4);
      const breath = 1 + Math.sin(t * Math.PI + gemShift * Math.PI * 2 + gemSeed * 4) * LEAF_BREATH_AMPLITUDE;
      const whiteSpark = Math.pow(clamp01(Math.sin(t * (5.8 + gemSeed * 2.2) + i * 1.67 + gemShift * 10.2) * 0.5 + 0.5), 22) * (0.04 + gemSeed * 0.1);
      const diamondFlash = Math.pow(clamp01(Math.sin(t * (3.1 + gemSeed * 1.3) + i * 0.27 + gemShift * 17) * 0.5 + 0.5), 28) * (0.06 + gemShift * 0.12);
      const flowTouch = phase.flowActive
        ? smooth01(1 - Math.abs(py - waveFrontY) / Math.max(14, waveBand * 1.22))
        : 0;
      const pulseTouch = phase.leafPulse;

      col = col.lerp(LEAF_SPARK_WHITE, whiteSpark * 0.18 + diamondFlash * 0.28);
      col = col.lerp(LEAF_WAVE_GOLD, flowTouch * (0.16 + tipWeight * 0.1));
      col = col.lerp(LEAF_SPARK_WHITE, pulseTouch * 0.985 * LEAF_PULSE_WHITE_SCALE + whiteSpark * 0.1 + diamondFlash * 0.14);
      applyColorContrast(col, LEAF_CORE_CONTRAST);

      const corePower = (1.15
        + twinkle * 0.38
        + whiteSpark * 0.42
        + diamondFlash * 0.78
        + flowTouch * 0.9
        + pulseTouch * 5.4 * LEAF_PULSE_POWER_SCALE)
        * LEAF_BRIGHTNESS_SCALE
        * LEAF_CORE_BRIGHTNESS_BOOST
        * breath;
      const auraPower = (0.34
        + twinkle * 0.14
        + whiteSpark * 0.14
        + diamondFlash * 0.22
        + flowTouch * 0.52
        + pulseTouch * 1.9 * LEAF_PULSE_POWER_SCALE)
        * LEAF_BRIGHTNESS_SCALE
        * LEAF_AURA_BRIGHTNESS_SCALE
        * (0.8 + (breath - 1) * 0.35);

      coreColorArr[i * 3] = col.r * corePower;
      coreColorArr[i * 3 + 1] = col.g * corePower;
      coreColorArr[i * 3 + 2] = col.b * corePower;

      auraColorArr[i * 3] = col.r * auraPower;
      auraColorArr[i * 3 + 1] = col.g * auraPower;
      auraColorArr[i * 3 + 2] = col.b * auraPower;
    }
    if (coreRef.current?.instanceColor) coreRef.current.instanceColor.needsUpdate = true;
    const auraAttr = auraGeometry.getAttribute('color');
    if (auraAttr) auraAttr.needsUpdate = true;
  });

  if (!points.length) return null;

  return (
    <>
      <points geometry={auraGeometry} frustumCulled={false} renderOrder={7}>
        <pointsMaterial
          size={10.5}
          map={auraTexture}
          alphaMap={auraTexture}
          transparent
          opacity={0.24}
          depthWrite={false}
          depthTest
          vertexColors
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          sizeAttenuation
        />
      </points>
      <instancedMesh
        ref={coreRef}
        args={[undefined as never, undefined as never, points.length]}
        frustumCulled={false}
        renderOrder={8}
      >
        <sphereGeometry args={[1.25, 8, 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}
