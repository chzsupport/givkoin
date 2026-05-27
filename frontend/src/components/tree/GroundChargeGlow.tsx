import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ENERGY_CHARGE_DURATION, getEnergyPhase } from './treeEnergy';
import { makeRadialTexture } from './treeTextures';

export function GroundChargeGlow() {
  const coreRef = useRef<THREE.Sprite>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);
  const coreMatRef = useRef<THREE.SpriteMaterial>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const auraTexture = useMemo(
    () =>
      makeRadialTexture({
        inner: 6,
        outer: 128,
        stops: [
          [0, 0.95],
          [0.26, 0.6],
          [0.62, 0.18],
          [1, 0],
        ],
      }),
    []
  );

  useEffect(() => {
    return () => {
      auraTexture.dispose();
    };
  }, [auraTexture]);

  useFrame((state) => {
    const phase = getEnergyPhase(state.clock.elapsedTime);
    const glow = phase.cycleT < ENERGY_CHARGE_DURATION
      ? 0.18 + phase.charge * 1.25
      : 0.12 + Math.max(0, 1 - phase.flow) * 0.32;

    if (coreRef.current) {
      const size = 72 + glow * 60;
      coreRef.current.scale.set(size, size, 1);
    }

    if (ringRef.current) {
      const scale = 1 + glow * 0.2;
      ringRef.current.scale.set(scale, scale * 0.82, 1);
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.08;
    }

    if (coreMatRef.current) {
      coreMatRef.current.opacity = Math.min(0.4, 0.09 + glow * 0.22);
      coreMatRef.current.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.55);
    }

    if (ringMatRef.current) {
      ringMatRef.current.opacity = Math.min(0.22, 0.05 + glow * 0.1);
      ringMatRef.current.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.42);
    }

    if (lightRef.current) {
      lightRef.current.intensity = 2.4 + glow * 10 + phase.leafPulse * 3.2;
      lightRef.current.distance = 300 + glow * 180;
      lightRef.current.color.set('#74fff1').lerp(new THREE.Color('#ffe08c'), phase.charge * 0.46);
    }
  });

  return (
    <group position={[0, 52, 0]} renderOrder={4}>
      <pointLight
        ref={lightRef}
        position={[0, 10, 0]}
        color="#74fff1"
        intensity={4}
        distance={360}
        decay={1.5}
      />
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.4, 0]}>
        <circleGeometry args={[88, 96]} />
        <meshBasicMaterial
          ref={ringMatRef}
          map={auraTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
      <sprite ref={coreRef} rotation={[Math.PI / 2, 0, 0]}>
        <spriteMaterial
          ref={coreMatRef}
          map={auraTexture}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}
