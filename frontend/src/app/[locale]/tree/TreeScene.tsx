'use client';

import dynamic from 'next/dynamic';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const YggdrasilTree = dynamic(
  () => import('@/components/tree/TreeLayer').then((m) => m.YggdrasilTree),
  { ssr: false }
);

function LeafTrainBloom() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      1.2,
      0.72,
      0.05
    );
    bloomPass.threshold = 0.0;
    bloomPass.strength = 1.35;
    bloomPass.radius = 0.72;

    composer.addPass(bloomPass);
    composer.setSize(size.width, size.height);
    composerRef.current = composer;

    return () => {
      composerRef.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.render();
  }, 1);

  return null;
}

function ResponsiveCamera() {
  const { camera } = useThree();

  useEffect(() => {
    const handleResize = () => {
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        camera.position.set(0, 240, 1000);
      } else {
        camera.position.set(0, 240, 900);
      }
      camera.updateProjectionMatrix();
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [camera]);

  return null;
}

type TreeSceneProps = {
  isTabVisible: boolean;
};

export default function TreeScene({ isTabVisible }: TreeSceneProps) {
  return (
    <div className="fixed inset-0 z-1">
      <Canvas
        dpr={isTabVisible ? [1, 1.25] : 1}
        frameloop={isTabVisible ? 'always' : 'never'}
        gl={{ antialias: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ReinhardToneMapping;
          gl.toneMappingExposure = 1.26;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        camera={{ position: [0, 240, 900], fov: 45, near: 1, far: 2000 }}
      >
        <LeafTrainBloom />
        <ResponsiveCamera />

        <hemisphereLight args={['#8cc8ff', '#09050e', 0.56]} />
        <directionalLight color="#bfe9ff" intensity={0.38} position={[-180, 320, 220]} />

        <Suspense fallback={null}>
          <group position={[0, -240, 0]}>
            <YggdrasilTree />
          </group>
        </Suspense>

        <OrbitControls
          enableZoom
          enablePan
          enableRotate
          minPolarAngle={1.4}
          maxPolarAngle={1.4}
          minDistance={100}
          maxDistance={1200}
        />
      </Canvas>
    </div>
  );
}
