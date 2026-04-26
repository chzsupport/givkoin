'use client';

import dynamic from 'next/dynamic';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Suspense, useEffect } from 'react';

const YggdrasilTree = dynamic(
  () => import('@/components/battle/TreeLayer').then((m) => m.YggdrasilTree),
  { ssr: false }
);

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
        camera={{ position: [0, 240, 900], fov: 45, near: 1, far: 2000 }}
      >
        <ResponsiveCamera />
        <ambientLight intensity={0.3} />
        <pointLight position={[100, 200, 100]} intensity={0.8} />
        <pointLight position={[-100, 150, -100]} intensity={0.5} />

        <Suspense fallback={null}>
          <group position={[0, -140, 0]}>
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
