'use client';

import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
(useGLTF as unknown as { setDecoderPath: (path: string) => void }).setDecoderPath(DRACO_DECODER_PATH);

function TreeModel({ rotate = true }: { rotate?: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene: loadedScene } = useGLTF('/tree-model.glb', true);

  const scene = useMemo(() => {
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

    return cloned;
  }, [loadedScene]);

  useFrame((state) => {
    if (rotate && groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
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

function TreeSatellites() {
  const aRef = useRef<THREE.Group>(null!);
  const bRef = useRef<THREE.Group>(null!);
  const cRef = useRef<THREE.Group>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (aRef.current) {
      aRef.current.position.set(Math.cos(t * 0.55) * 260, 130 + Math.sin(t * 0.9) * 40, Math.sin(t * 0.55) * 260);
      aRef.current.rotation.y = t * 0.7;
    }
    if (bRef.current) {
      bRef.current.position.set(Math.cos(-t * 0.33) * 360, 190 + Math.sin(t * 0.6) * 55, Math.sin(-t * 0.33) * 360);
      bRef.current.rotation.y = -t * 0.45;
    }
    if (cRef.current) {
      cRef.current.position.set(Math.cos(t * 0.18) * 520, 260 + Math.sin(t * 0.4) * 70, Math.sin(t * 0.18) * 520);
      cRef.current.rotation.y = t * 0.25;
    }
  });

  return (
    <group>
      <group ref={aRef}>
        <mesh>
          <sphereGeometry args={[14, 32, 32]} />
          <meshStandardMaterial color="#6bbcff" emissive="#2b6fff" emissiveIntensity={0.9} />
        </mesh>
      </group>

      <group ref={bRef}>
        <mesh>
          <sphereGeometry args={[18, 32, 32]} />
          <meshStandardMaterial color="#ffb16b" emissive="#ff6a2b" emissiveIntensity={0.85} />
        </mesh>
      </group>

      <group ref={cRef}>
        <pointLight intensity={6.5} distance={1800} color="#e7d7ff" />
        <mesh>
          <sphereGeometry args={[24, 32, 32]} />
          <meshStandardMaterial color="#e7d7ff" emissive="#ffffff" emissiveIntensity={2.4} />
        </mesh>
      </group>
    </group>
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
  position = [0, 80, 0],
  pointerEvents = 'none',
  className = '',
  rotate = true,
}: TreeLayerProps) {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ pointerEvents }}>
      <Canvas
        gl={{ antialias: false, alpha: transparent }}
        camera={{ position: [0, 240, 620], fov: 55, near: 1, far: 1400 }}
        style={{ background: transparent ? 'transparent' : '#020202' }}
      >
        <ambientLight intensity={0.25} />
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
