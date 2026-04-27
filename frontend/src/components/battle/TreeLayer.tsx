'use client';

import React, { useEffect, useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
(useGLTF as unknown as { setDecoderPath: (path: string) => void }).setDecoderPath(DRACO_DECODER_PATH);

function BloomPostFX() {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const comp = new EffectComposer(gl);
    comp.addPass(new RenderPass(scene, camera));

    const pass = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 1.2, 0.6, 0.2);
    pass.threshold = 0.2;
    pass.strength = 1.25;
    pass.radius = 0.6;
    comp.addPass(pass);

    return comp;
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
  }, [composer, size.width, size.height]);

  useFrame(() => {
    gl.autoClear = true;
    composer.render();
  }, 1);

  return null;
}

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

  const auraTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return new THREE.Texture();
    }

    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 120);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    g.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (aRef.current) {
      aRef.current.position.set(Math.cos(t * 0.75) * 110, 120 + Math.sin(t * 0.9) * 30, Math.sin(t * 0.75) * 110);
      aRef.current.rotation.y = t * 0.7;
    }
    if (bRef.current) {
      bRef.current.position.set(Math.cos(-t * 0.5) * 150, 170 + Math.sin(t * 0.6) * 35, Math.sin(-t * 0.5) * 150);
      bRef.current.rotation.y = -t * 0.45;
    }
    if (cRef.current) {
      cRef.current.position.set(Math.cos(t * 0.28) * 210, 240 + Math.sin(t * 0.4) * 45, Math.sin(t * 0.28) * 210);
      cRef.current.rotation.y = t * 0.25;
    }
  });

  return (
    <group>
      <group ref={aRef}>
        <pointLight intensity={120} distance={0} decay={0} color="#6bbcff" />
        <sprite>
          <spriteMaterial
            map={auraTexture}
            color="#6bbcff"
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0.85}
          />
        </sprite>
        <mesh>
          <sphereGeometry args={[14, 32, 32]} />
          <meshBasicMaterial color="#6bbcff" />
        </mesh>
        <Text color="#ffffff" fontSize={16} anchorX="center" anchorY="middle" position={[0, 28, 0]}>
          1
        </Text>
      </group>

      <group ref={bRef}>
        <pointLight intensity={100} distance={0} decay={0} color="#ffb16b" />
        <mesh>
          <sphereGeometry args={[18, 32, 32]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
        <Text color="#ffffff" fontSize={20} anchorX="center" anchorY="middle" position={[0, 34, 0]}>
          2
        </Text>
      </group>

      <group ref={cRef}>
        <pointLight intensity={220} distance={0} decay={0} color="#e7d7ff" />
        <sprite scale={[2.2, 2.2, 2.2]}>
          <spriteMaterial
            map={auraTexture}
            color="#e7d7ff"
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            opacity={0.7}
          />
        </sprite>
        <mesh>
          <sphereGeometry args={[24, 32, 32]} />
          <meshBasicMaterial color="#e7d7ff" />
        </mesh>
        <Text color="#ffffff" fontSize={26} anchorX="center" anchorY="middle" position={[0, 42, 0]}>
          3
        </Text>
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
        <BloomPostFX />
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
