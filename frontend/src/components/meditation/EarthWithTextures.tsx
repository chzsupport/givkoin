import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { MiniGunStream } from './MiniGunStream';
import { getPlanetScale } from './planetSizing';
import type { MeditationPlanetSceneProps } from './meditationPlanetTypes';

export function EarthWithTextures({ phase, beamActive, beamOriginScreenY }: MeditationPlanetSceneProps) {
    const earthRef = useRef<THREE.Mesh>(null);
    const cloudsRef = useRef<THREE.Mesh>(null);
    const groupRef = useRef<THREE.Group>(null);
    const earthMaterialRef = useRef<THREE.MeshPhongMaterial>(null);
    const cloudsMaterialRef = useRef<THREE.MeshPhongMaterial>(null);
    const glowRef = useRef<THREE.Mesh>(null);
    const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    const absorbColor = useMemo(() => new THREE.Color(), []);
    const rotationGroupRef = useRef<THREE.Group>(null);
    const pulseGroupRef = useRef<THREE.Group>(null);
    const streamActive = phase === 'give' && beamActive;
    const streamTowardsPlanet = true;
    const [dayMap, cloudsMap] = useTexture(['/8k_earth_daymap.jpg', '/2k_earth_clouds.jpg']) as [THREE.Texture, THREE.Texture];

    useEffect(() => {
        dayMap.colorSpace = THREE.SRGBColorSpace;
        dayMap.anisotropy = 8;
        cloudsMap.colorSpace = THREE.SRGBColorSpace;
        cloudsMap.anisotropy = 8;
    }, [dayMap, cloudsMap]);

    useFrame((state, delta) => {
        const t = state.clock.getElapsedTime();
        const absorbActive = phase === 'absorb';
        const pulse = absorbActive ? 1 + 0.02 * Math.sin(t * 1.2) + 0.01 * Math.sin(t * 2.3) : 1;

        if (groupRef.current) {
            const targetScale = getPlanetScale(state.viewport);
            const nextScale = THREE.MathUtils.damp(groupRef.current.scale.x, targetScale, 4, delta);
            groupRef.current.scale.setScalar(nextScale);
        }

        if (absorbActive) {
            const hue = 0.32 + 0.06 * Math.sin(t * 0.7) + 0.03 * Math.sin(t * 1.5 + 1.2);
            const saturation = 0.65 + 0.2 * Math.sin(t * 0.9);
            const lightness = 0.42 + 0.08 * Math.sin(t * 1.1);
            absorbColor.setHSL(hue, saturation, lightness);
        }

        if (rotationGroupRef.current) {
            const earthSpeed = 0.0388;
            rotationGroupRef.current.rotation.y += earthSpeed * delta;
        }

        if (pulseGroupRef.current) {
            pulseGroupRef.current.scale.setScalar(pulse);
        }

        if (earthMaterialRef.current) {
            if (absorbActive) {
                earthMaterialRef.current.emissive.copy(absorbColor);
                earthMaterialRef.current.emissiveIntensity = 0.55 + 0.25 * Math.sin(t * 1.4);
            } else {
                earthMaterialRef.current.emissive.setRGB(0, 0, 0);
                earthMaterialRef.current.emissiveIntensity = 0;
            }
        }

        if (cloudsMaterialRef.current) {
            if (absorbActive) {
                cloudsMaterialRef.current.emissive.copy(absorbColor);
                cloudsMaterialRef.current.emissiveIntensity = 0.25 + 0.2 * Math.sin(t * 1.6);
            } else {
                cloudsMaterialRef.current.emissive.setRGB(0, 0, 0);
                cloudsMaterialRef.current.emissiveIntensity = 0;
            }
        }

        if (absorbActive && glowRef.current) {
            glowRef.current.scale.setScalar(1.06 + 0.05 * Math.sin(t * 1.2));
        }

        if (absorbActive && glowMaterialRef.current) {
            glowMaterialRef.current.color.copy(absorbColor);
            glowMaterialRef.current.opacity = 0.18 + 0.12 * Math.sin(t * 1.4 + 0.4);
        }

        if (cloudsRef.current) {
            const earthSpeed = 0.0388;
            const cloudsSpeed = earthSpeed * 0.7;
            cloudsRef.current.rotation.y += cloudsSpeed * delta;
        }
    });

    return (
        <group ref={groupRef}>
            <group ref={rotationGroupRef}>
                <group ref={pulseGroupRef}>
                    <mesh ref={earthRef}>
                        <sphereGeometry args={[2, 192, 192]} />
                        <meshPhongMaterial
                            ref={earthMaterialRef}
                            map={dayMap}
                            shininess={9}
                            specular={new THREE.Color('#263241')}
                        />
                    </mesh>

                    <mesh ref={cloudsRef}>
                        <sphereGeometry args={[2.04, 192, 192]} />
                        <meshPhongMaterial
                            ref={cloudsMaterialRef}
                            map={cloudsMap}
                            transparent
                            opacity={0.42}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>

                    {phase === 'absorb' && (
                        <mesh ref={glowRef}>
                            <sphereGeometry args={[2.18, 128, 128]} />
                            <meshBasicMaterial
                                ref={glowMaterialRef}
                                color={'#22c55e'}
                                transparent
                                opacity={0.22}
                                blending={THREE.AdditiveBlending}
                                depthWrite={false}
                                toneMapped={false}
                            />
                        </mesh>
                    )}
                </group>
            </group>

            <MiniGunStream
                active={streamActive}
                towardsPlanet={streamTowardsPlanet}
                planetScaleRef={groupRef}
                beamOriginScreenY={beamOriginScreenY}
            />
        </group>
    );
}
