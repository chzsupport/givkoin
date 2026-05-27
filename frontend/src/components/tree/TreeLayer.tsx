'use client';

import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { GroundChargeGlow } from './GroundChargeGlow';
import { SceneBloom } from './SceneBloom';
import { TreeLeavesManual } from './TreeLeavesManual';
import { TreeSatellites } from './TreeSatellites';
import { TreeSilhouetteWave } from './TreeSilhouetteWave';
import { MANUAL_LEAF_BOUNDS } from './treeLeafPoints';

function TreeModel({ rotate = true }: { rotate?: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene: loadedScene } = useGLTF('/tree.glb');

  const { scene, sceneBounds } = useMemo(() => {
    const cloned = loadedScene.clone(true);

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    cloned.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 420;
    const scale = targetSize / maxDim;
    cloned.scale.setScalar(scale);

    const boxAfter = new THREE.Box3().setFromObject(cloned);
    if (Number.isFinite(boxAfter.min.y)) {
      cloned.position.y -= boxAfter.min.y;
    }

    const finalBox = new THREE.Box3().setFromObject(cloned);
    return {
      scene: cloned,
      sceneBounds: {
        minY: Number.isFinite(finalBox.min.y) ? finalBox.min.y : 0,
        maxY: Number.isFinite(finalBox.max.y) ? finalBox.max.y : 1,
      },
    };
  }, [loadedScene]);

  const waveBottomY = sceneBounds.minY;
  const waveTopY = Math.max(
    waveBottomY + 1,
    Math.min(sceneBounds.maxY, MANUAL_LEAF_BOUNDS.maxY)
  );

  useFrame((state) => {
    if (rotate && groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      <GroundChargeGlow />
      <TreeSilhouetteWave source={scene} waveBottomY={waveBottomY} waveTopY={waveTopY} />
      <TreeLeavesManual waveBottomY={waveBottomY} waveTopY={waveTopY} />
    </group>
  );
}

export function YggdrasilTree({ rotate = true }: { rotate?: boolean }) {
  return (
    <Suspense fallback={null}>
      <group>
        <TreeModel rotate={rotate} />
        <TreeSatellites />
      </group>
    </Suspense>
  );
}

export type TreeLayerProps = {
  transparent?: boolean;
  scale?: [number, number, number];
  position?: [number, number, number];
  pointerEvents?: 'none' | 'auto';
  className?: string;
  rotate?: boolean;
};

export function TreeLayer({
  transparent = true,
  scale = [0.5, 0.5, 0.5],
  position = [0, 56, 0],
  pointerEvents = 'none',
  className = '',
  rotate = true,
}: TreeLayerProps) {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ pointerEvents }}>
      <Canvas
        gl={{ antialias: false, alpha: transparent }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ReinhardToneMapping;
          gl.toneMappingExposure = 1.3;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        camera={{ position: [0, 240, 620], fov: 55, near: 1, far: 1400 }}
        style={{ background: transparent ? 'transparent' : '#020202' }}
      >
        <SceneBloom />
        <group scale={scale} position={position}>
          <YggdrasilTree rotate={rotate} />
        </group>
      </Canvas>
    </div>
  );
}

export function TreeSceneStandalone() {
  return (
    <div className="relative w-full h-screen bg-[#020202]">
      <TreeLayer transparent={false} scale={[1, 1, 1]} position={[0, 0, 0]} pointerEvents="auto" />
    </div>
  );
}
