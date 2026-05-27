'use client';

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WEAPONS, type WeaponId } from './battleWeapons';

function ChargeSphere({
    color,
    scaleRef,
}: {
    color: string;
    scaleRef: React.MutableRefObject<number>;
}) {
    const meshRef = useRef<THREE.Mesh>(null);
    useFrame(() => {
        if (meshRef.current) {
            const s = scaleRef.current;
            const jitter = s > 0 ? Math.random() * 0.3 * s : 0;
            const finalScale = s * 2.5 + jitter;
            meshRef.current.scale.set(finalScale, finalScale, finalScale);
            meshRef.current.rotation.z += 0.2;
            meshRef.current.rotation.x += 0.1;
            meshRef.current.visible = s > 0.01;
        }
    });
    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={5}
                toneMapped={false}
                transparent
                opacity={0.8}
            />
        </mesh>
    );
}

function RotaryBarrel({ isShooting }: { isShooting: boolean }) {
    const spinnerRef = useRef<THREE.Group>(null);
    useFrame((_, delta) => {
        if (spinnerRef.current && isShooting) {
            spinnerRef.current.rotation.z -= delta * 25;
        }
    });
    const barrels = useMemo(() => {
        const arr: React.ReactElement[] = [];
        const count = 6;
        const radius = 0.15;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            arr.push(
                <mesh key={i} position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0.4]} rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.04, 0.04, 2, 8]} />
                    <meshStandardMaterial color="#ccc" />
                </mesh>,
            );
        }
        return arr;
    }, []);

    return (
        <group position={[0, 0, 0.5]}>
            <group ref={spinnerRef}>
                {barrels}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
                    <meshStandardMaterial color="#888" />
                </mesh>
            </group>
            <mesh position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.25, 0.3, 1.5, 16]} />
                <meshStandardMaterial color="#666" />
            </mesh>
        </group>
    );
}

type GunModelProps = {
    side: 'left' | 'right';
    weaponId: WeaponId;
    recoilRef: React.RefObject<THREE.Group>;
    aimPoint: React.RefObject<THREE.Vector3>;
    isShooting: boolean;
    chargeScaleRef?: React.MutableRefObject<number>;
    xOffset: number;
    muzzleFlashRef?: React.RefObject<{ left: number; right: number }>;
};

export function GunModel({ side, weaponId, recoilRef, aimPoint, isShooting, chargeScaleRef, xOffset, muzzleFlashRef }: GunModelProps) {
    const pivotRef = useRef<THREE.Group>(null);
    const flashMeshRef = useRef<THREE.Mesh>(null);
    const flashMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
    const baseColor = '#aaaaaa';
    const flashColor = WEAPONS[weaponId as WeaponId]?.color || '#ffffff';
    const muzzleZ = weaponId === 1 ? 1.4 : weaponId === 2 ? 2.2 : 2.8;
    const maxFlashScale = weaponId === 3 ? 0.6 : 0.45;

    useFrame(() => {
        if (pivotRef.current && aimPoint.current) pivotRef.current.lookAt(aimPoint.current);
        if (flashMeshRef.current && muzzleFlashRef?.current) {
            const lastFlash = muzzleFlashRef.current[side] || 0;
            const elapsed = Date.now() - lastFlash;
            const duration = 80;
            const intensity = Math.max(0, 1 - elapsed / duration);
            flashMeshRef.current.visible = intensity > 0.02;
            const scale = 0.2 + maxFlashScale * intensity;
            flashMeshRef.current.scale.set(scale, scale, scale);
            if (flashMaterialRef.current) {
                flashMaterialRef.current.opacity = intensity * 0.22;
            }
        }
    });

    const renderBarrel = () => {
        switch (weaponId) {
            case 1:
                return (
                    <group position={[0, -0.1, 0.5]}>
                        <mesh position={[0, 0, -0.5]}>
                            <boxGeometry args={[1.2, 0.4, 1]} />
                            <meshStandardMaterial color="#8899aa" />
                        </mesh>
                        <group position={[-0.35, 0, 0]}>
                            <RotaryBarrel isShooting={isShooting} />
                        </group>
                        <group position={[0.35, 0, 0]}>
                            <RotaryBarrel isShooting={isShooting} />
                        </group>
                    </group>
                );
            case 2:
                return (
                    <group position={[0, -0.2, 1]}>
                        <mesh position={[0.3, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.3, 0.4, 3.5, 12]} />
                            <meshStandardMaterial color="#ccc" metalness={0.6} />
                        </mesh>
                        <mesh position={[-0.3, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.3, 0.4, 3.5, 12]} />
                            <meshStandardMaterial color="#ccc" metalness={0.6} />
                        </mesh>
                        <mesh position={[0, 0, -0.5]}>
                            <boxGeometry args={[1.4, 0.7, 2.5]} />
                            <meshStandardMaterial color="#999" />
                        </mesh>
                    </group>
                );
            case 3:
                return (
                    <group position={[0, 0, 0.5]}>
                        <mesh rotation={[Math.PI / 2, 0, 0]}>
                            <cylinderGeometry args={[0.2, 0.35, 5, 6]} />
                            <meshStandardMaterial color="#ddd" metalness={0.9} />
                        </mesh>
                        {[-1.5, -0.5, 0.5, 1.5, 2.5].map((z, i) => (
                            <group key={i} position={[0, 0, z - 1]} rotation={[Math.PI / 2, 0, 0]}>
                                <torusGeometry args={[0.45, 0.05, 16, 32]} />
                                <meshStandardMaterial
                                    color={WEAPONS[3].baseColor}
                                    emissive={WEAPONS[3].baseColor}
                                    emissiveIntensity={3}
                                    toneMapped={false}
                                />
                            </group>
                        ))}
                        {chargeScaleRef && (
                            <group position={[0, 0, 3]}>
                                <ChargeSphere color={WEAPONS[3].baseColor} scaleRef={chargeScaleRef} />
                            </group>
                        )}
                    </group>
                );
            default:
                return null;
        }
    };

    return (
        <group position={[xOffset, -3.5, 6]}>
            <mesh position={[0, -0.5, 0]}>
                <sphereGeometry args={[0.6]} />
                <meshStandardMaterial color="#888" />
            </mesh>
            <group ref={pivotRef}>
                <group ref={recoilRef}>
                    <mesh position={[0, 0, -0.5]}>
                        <boxGeometry args={[0.8, 0.8, 2]} />
                        <meshStandardMaterial color={baseColor} />
                    </mesh>
                    {renderBarrel()}
                    <mesh ref={flashMeshRef} position={[0, 0, muzzleZ]} visible={false}>
                        <sphereGeometry args={[0.35, 10, 10]} />
                        <meshBasicMaterial
                            ref={flashMaterialRef}
                            color={flashColor}
                            transparent
                            opacity={0}
                            toneMapped={false}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                </group>
            </group>
        </group>
    );
}
