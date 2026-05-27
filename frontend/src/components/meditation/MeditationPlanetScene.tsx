'use client';

import { Canvas } from '@react-three/fiber';
import { EarthWithTextures } from './EarthWithTextures';
import type { MeditationPlanetSceneProps } from './meditationPlanetTypes';

export type { CollectiveMeditationPhase } from './meditationPlanetTypes';

export function MeditationPlanetScene({ phase, beamActive }: MeditationPlanetSceneProps) {
    return (
        <Canvas
            camera={{ position: [0, 0, 7], fov: 45, near: 0.1, far: 1000 }}
            gl={{ alpha: true, antialias: true }}
            style={{ width: '100%', height: '100%' }}
        >
            <ambientLight intensity={0.25} />
            <directionalLight intensity={2.4} color={'#c9e0ff'} position={[-9, -5, -7]} />
            <directionalLight intensity={5.2} color={'#ffd27a'} position={[8, 6, 7]} />
            <EarthWithTextures phase={phase} beamActive={beamActive} />
        </Canvas>
    );
}
