'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Line } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { ENEMY_PLANE_Z, findZoneForPoint, computePlaneIntersection } from './enemyZones';
import type { EnemyHitEvent } from './enemyZones';
import { MobileControls } from './MobileControls';
import { useI18n } from '@/context/I18nContext';

const WEAPONS = {
    1: {
        id: 1,
        name: 'VULCAN',
        color: '#FFFF00',
        baseColor: '#00d0ff',
        recoil: 0.25,
        shake: 0.4,
        rate: 50,
        burstCount: 1,
        chargeTime: 0,
        speed: 4.5, // Increased from 3.0 (x1.5)
        size: 0.4,
        type: 'projectile',
        barrelLength: 1.5,
    },
    2: {
        id: 2,
        name: 'CANNON',
        color: '#ff8800',
        baseColor: '#ff8800',
        recoil: 4.0,
        shake: 8,
        rate: 3000,
        chargeTime: 0,
        speed: 4.5, // Increased from 3.0 (x1.5)
        size: 0.4,
        type: 'projectile',
        barrelLength: 1.5,
        burstCount: 1,
    },
    3: {
        id: 3,
        name: 'TESLA',
        color: '#00eaff',
        baseColor: '#00eaff',
        recoil: 1.9,
        shake: 20,
        rate: 5000,
        chargeTime: 1200,
        speed: 0,
        size: 1,
        type: 'instant',
        barrelLength: 2.5,
        burstCount: 1,
    },
} as const;

export type WeaponId = 1 | 2 | 3;
export type ShotInputSource = 'mouse' | 'touch';

export interface ShotAttemptTelemetry {
    screenX: number;
    screenY: number;
    screenNx: number;
    screenNy: number;
    worldPoint: { x: number; y: number; z: number };
    inputSource: ShotInputSource;
}

export interface GameSceneProps {
    backgroundColor?: string;
    onHit?: (event: EnemyHitEvent) => void;
    onVisualHit?: (event: EnemyHitEvent) => void;
    checkHit?: (worldX: number, worldY: number) => boolean;
    onImpact?: (event: { worldPoint: { x: number; y: number; z: number }; weaponId: number; shotId: string }) =>
        | { hit: boolean; type?: 'enemy' | 'baddie' }
        | void;
    showCrosshair?: boolean;
    onShotAttempt?: (weaponId: WeaponId, shotId: string, telemetry: ShotAttemptTelemetry) => boolean | void;
    weaponAvailability?: Partial<Record<WeaponId, boolean>>;
    performanceTier?: 'low' | 'medium' | 'high';
}

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;
type Vec3Tuple = [number, number, number];

interface ProjectileProps {
    weaponId: WeaponId;
    startPosition: Vec3Tuple;
    velocity: Vec3Tuple;
    color: string;
    size: number;
    shotId: string;
    onRemove: () => void;
    onEnemyHit?: (event: EnemyHitEvent) => void;
    checkHit?: (worldX: number, worldY: number) => boolean;
    onImpact?: (event: { worldPoint: { x: number; y: number; z: number }; weaponId: number; shotId: string }) =>
        | { hit: boolean; type?: 'enemy' | 'baddie' }
        | void;
}

interface LightningBoltProps {
    color: string;
    startPos: Vec3Tuple;
    targetPos: Vec3Tuple;
    onRemove: (id: string) => void;
    id: string;
}

interface ActiveShot {
    id: string;
    shotId: string;
    weaponId: WeaponId;
    startPosition: Vec3Tuple;
    velocity?: Vec3Tuple;
    targetPos?: Vec3Tuple;
}

const toTuple = (vec: THREE.Vector3): Vec3Tuple => [vec.x, vec.y, vec.z];

const ChargeSphere = ({
    color,
    scaleRef,
}: {
    color: string;
    scaleRef: React.MutableRefObject<number>;
}) => {
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
};

const Projectile = ({
    weaponId,
    startPosition,
    velocity,
    color,
    size,
    shotId,
    onRemove,
    onEnemyHit,
    checkHit,
    onImpact,
}: ProjectileProps) => {
    const ref = useRef<THREE.Mesh>(null);
    const positionRef = useRef(new THREE.Vector3(...startPosition));
    const velocityRef = useMemo(() => new THREE.Vector3(...velocity), [velocity]);
    const distanceTraveled = useRef(0);
    const hasHitRef = useRef(false);

    useEffect(() => {
        positionRef.current = new THREE.Vector3(...startPosition);
        if (ref.current) {
            ref.current.position.set(...startPosition);
        }
    }, [startPosition]);

    useFrame(() => {
        const previous = positionRef.current.clone();
        positionRef.current.add(velocityRef);
        distanceTraveled.current += velocityRef.length();

        if (ref.current) {
            ref.current.position.copy(positionRef.current);
        }

        if (!hasHitRef.current) {
            const intersection = computePlaneIntersection(previous, positionRef.current.clone(), ENEMY_PLANE_Z);
            if (intersection) {
                hasHitRef.current = true;
                const impactResult = onImpact?.({
                    worldPoint: { x: intersection.x, y: intersection.y, z: intersection.z },
                    weaponId,
                    shotId,
                });
                const isHit = impactResult ? impactResult.hit : checkHit ? checkHit(intersection.x, intersection.y) : true;

                if (isHit) {
                    if (onEnemyHit && impactResult?.type !== 'baddie') {
                        const zone = findZoneForPoint(intersection.x, intersection.y);
                        onEnemyHit({
                            zoneId: zone?.id ?? null,
                            worldPoint: { x: intersection.x, y: intersection.y, z: intersection.z },
                            weaponId,
                            shotId,
                        });
                    }
                    onRemove();
                    return;
                }
            }
        }

        if (distanceTraveled.current > 1200) {
            onRemove();
        }
    });

    const renderGeometry = () => {
        if (weaponId === 1) return <sphereGeometry args={[size * 0.5, 12, 12]} />;
        if (weaponId === 2) return <sphereGeometry args={[size * 0.6, 16, 16]} />;
        return <sphereGeometry args={[size * 0.5, 8, 8]} />;
    };

    return (
        <mesh ref={ref}>
            {renderGeometry()}
            <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
    );
};

const LightningBolt = ({ color, startPos, targetPos, onRemove, id }: LightningBoltProps) => {
    const [points, setPoints] = useState<THREE.Vector3[]>([]);
    const [opacity, setOpacity] = useState(1);

    const lifeRef = useRef(1.5);

    useEffect(() => {
        const start = new THREE.Vector3(...startPos);
        const target = new THREE.Vector3(...targetPos);

        const segments = 25;
        const pts: THREE.Vector3[] = [];

        for (let i = 0; i <= segments; i++) {
            const alpha = i / segments;
            const current = new THREE.Vector3().lerpVectors(start, target, alpha);
            if (i > 0 && i < segments) {
                const amp = 1.0 * Math.sin(alpha * Math.PI);
                current.x += randomRange(-amp, amp);
                current.y += randomRange(-amp, amp);
                current.z += randomRange(-amp, amp);
            }
            pts.push(current.clone());
        }
        setPoints(pts);
    }, [startPos, targetPos]);

    useFrame((state, delta) => {
        lifeRef.current -= delta * 0.8; // Adjust speed here. 1.5 / 0.8 ~= 1.8s
        setOpacity(Math.min(1, lifeRef.current));
        if (lifeRef.current <= 0) {
            onRemove(id);
        }
    });

    if (points.length < 2) return null;
    return <Line points={points} color={color} lineWidth={4} toneMapped={false} transparent opacity={opacity} />;
};

const RotaryBarrel = ({ isShooting }: { isShooting: boolean }) => {
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
};

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

const GunModel = ({ side, weaponId, recoilRef, aimPoint, isShooting, chargeScaleRef, xOffset, muzzleFlashRef }: GunModelProps) => {
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
};

type SceneContentProps = {
    currentWeapon: WeaponId;
    onShake: (amount: number) => void;
    isShootingInput: boolean;
    onCooldownStart?: (endAt: number) => void;
    onHit?: (event: EnemyHitEvent) => void;
    onVisualHit?: (event: EnemyHitEvent) => void;
    checkHit?: (worldX: number, worldY: number) => boolean;
    onImpact?: (payload: { worldPoint: { x: number; y: number; z: number }; weaponId: number; shotId: string }) =>
        | { hit: boolean; type?: 'enemy' | 'baddie' }
        | void;
    mobileAimRef?: React.MutableRefObject<{ x: number; y: number }>;
    isMobileFiringRef?: React.MutableRefObject<boolean>;
    lastInputSourceRef?: React.MutableRefObject<'mouse' | 'touch'>;
    onAimMove: (x: number, y: number) => void;
    onShotAttempt?: (weaponId: WeaponId, shotId: string, telemetry: ShotAttemptTelemetry) => boolean | void;
};

const SceneContent = ({ currentWeapon, onShake, isShootingInput, onCooldownStart, onHit, onVisualHit, checkHit, onImpact, mobileAimRef, isMobileFiringRef, lastInputSourceRef, onAimMove, onShotAttempt }: SceneContentProps) => {
    const leftGunRef = useRef<THREE.Group>(null);
    const rightGunRef = useRef<THREE.Group>(null);
    const recoilOffsetsRef = useRef({ left: 0, right: 0 });
    const muzzleFlashRef = useRef({ left: 0, right: 0 });
    const chargeProgressRef = useRef(0);
    const burstRemainingRef = useRef(0);
    const lastBurstShotTimeRef = useRef(0);
    const wasShootingRef = useRef(false);
    const isAutoChargingRef = useRef(false);
    const aimPointRef = useRef(new THREE.Vector3(0, 0, -100));
    const [projectiles, setProjectiles] = useState<ActiveShot[]>([]);
    const lastTriggerTime = useRef(0);
    const { camera, raycaster, mouse, size } = useThree();
    const gunXOffset = useMemo(() => {
        if (size.width < 640) return 1.1;
        if (size.width < 1024) return 1.8;
        return 3.2;
    }, [size.width]);

    const aimPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 220), []);
    const gunWorldPositions = useMemo(
        () => ({
            left: new THREE.Vector3(-gunXOffset, -3.5, 6.0),
            right: new THREE.Vector3(gunXOffset, -3.5, 6.0),
        }),
        [gunXOffset],
    );

    const handleRemoveShot = useCallback((id: string) => {
        setProjectiles((prev) => prev.filter((shot) => shot.id !== id));
    }, []);

    const handleProjectileHit = useCallback((event: EnemyHitEvent) => {
        onVisualHit?.(event);
        onHit?.(event);
    }, [onHit, onVisualHit]);

    const executeShot = useCallback(
        (targetPosition: THREE.Vector3, now: number) => {
            const weapon = WEAPONS[currentWeapon as WeaponId];
            const shotId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
            const screenPos = targetPosition.clone().project(camera);
            const screenX = (screenPos.x * size.width / 2) + (size.width / 2);
            const screenY = -(screenPos.y * size.height / 2) + (size.height / 2);
            const shotTelemetry: ShotAttemptTelemetry = {
                screenX,
                screenY,
                screenNx: Math.max(0, Math.min(1, size.width ? screenX / size.width : 0)),
                screenNy: Math.max(0, Math.min(1, size.height ? screenY / size.height : 0)),
                worldPoint: { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z },
                inputSource: lastInputSourceRef?.current === 'touch' ? 'touch' : 'mouse',
            };
            onShake(weapon.shake);
            if (weapon.rate >= 1000) {
                onCooldownStart?.(now + weapon.rate);
            }

            const shotAllowed = onShotAttempt ? onShotAttempt(weapon.id, shotId, shotTelemetry) !== false : true;
            if (!shotAllowed) {
                return;
            }

            recoilOffsetsRef.current.left = Math.max(recoilOffsetsRef.current.left, weapon.recoil);
            recoilOffsetsRef.current.right = Math.max(recoilOffsetsRef.current.right, weapon.recoil);
            muzzleFlashRef.current.left = now;
            muzzleFlashRef.current.right = now;

            const newShots: ActiveShot[] = [];

            if (weapon.id === 3) {
                const primaryOrigin = gunWorldPositions.left.clone();
                const primaryDir = new THREE.Vector3().subVectors(targetPosition, primaryOrigin).normalize();
                if (primaryDir.z !== 0) {
                    const t = (ENEMY_PLANE_Z - primaryOrigin.z) / primaryDir.z;
                    if (t > 0) {
                        const hitPoint = primaryOrigin.clone().add(primaryDir.multiplyScalar(t));
                        const impactResult = onImpact?.({
                            worldPoint: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
                            weaponId: weapon.id,
                            shotId,
                        });
                        const isBaddieHit = impactResult?.type === 'baddie';
                        const isInSilhouette = checkHit ? checkHit(hitPoint.x, hitPoint.y) : true;
                        const isHit = isBaddieHit ? false : isInSilhouette;
                        if (isHit) {
                            const zone = findZoneForPoint(hitPoint.x, hitPoint.y);
                            onHit?.({
                                zoneId: zone?.id ?? null,
                                worldPoint: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
                                weaponId: weapon.id,
                                shotId,
                            });
                            onVisualHit?.({
                                zoneId: zone?.id ?? null,
                                worldPoint: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
                                weaponId: weapon.id,
                                visualOnly: true,
                                shotId,
                            });
                        }
                    }
                }
            }

            [gunWorldPositions.left, gunWorldPositions.right].forEach((startVec) => {
                const origin = startVec.clone();
                const direction = new THREE.Vector3().subVectors(targetPosition, origin).normalize();
                const muzzlePos = origin.clone().add(direction.clone().multiplyScalar(weapon.barrelLength));

                if (weapon.id === 3) {
                    [0, 1, 2].forEach(() => {
                        const spreadTarget = targetPosition.clone().add(
                            new THREE.Vector3(randomRange(-6, 6), randomRange(-6, 6), randomRange(-6, 6)),
                        );

                        let finalTarget = spreadTarget;
                        const direction = new THREE.Vector3().subVectors(spreadTarget, muzzlePos).normalize();
                        if (direction.z !== 0) {
                            const t = (ENEMY_PLANE_Z - muzzlePos.z) / direction.z;
                            if (t > 0) {
                                finalTarget = muzzlePos.clone().add(direction.multiplyScalar(t));
                            }
                        }

                        newShots.push({
                            id: Math.random().toString(36).slice(2, 9),
                            shotId,
                            weaponId: currentWeapon,
                            startPosition: toTuple(muzzlePos),
                            targetPos: toTuple(finalTarget),
                        });
                    });
                    return;
                }

                const shotsCount = weapon.id === 1 ? 5 : 1;
                for (let s = 0; s < shotsCount; s++) {
                    const spreadDir = direction.clone();
                    const spreadAmount = weapon.id === 1 ? 0.03 : 0.006;
                    spreadDir.x += randomRange(-spreadAmount, spreadAmount);
                    spreadDir.y += randomRange(-spreadAmount, spreadAmount);
                    spreadDir.z += randomRange(-spreadAmount, spreadAmount);
                    spreadDir.normalize();

                    const velocityVec = spreadDir.multiplyScalar(weapon.speed);

                    newShots.push({
                        id: Math.random().toString(36).slice(2, 9),
                        shotId,
                        weaponId: currentWeapon,
                        startPosition: toTuple(muzzlePos),
                        velocity: toTuple(velocityVec),
                    });
                }
            });

            setProjectiles((prev) => [...prev, ...newShots]);
        },
        [camera, checkHit, currentWeapon, gunWorldPositions, lastInputSourceRef, onCooldownStart, onHit, onImpact, onShake, onShotAttempt, onVisualHit, size.height, size.width],
    );

    useFrame((state, delta) => {
        const recoilDecay = Math.exp(-delta * 18);
        recoilOffsetsRef.current.left *= recoilDecay;
        recoilOffsetsRef.current.right *= recoilDecay;
        if (recoilOffsetsRef.current.left < 0.001) recoilOffsetsRef.current.left = 0;
        if (recoilOffsetsRef.current.right < 0.001) recoilOffsetsRef.current.right = 0;
        if (leftGunRef.current) leftGunRef.current.position.z = -recoilOffsetsRef.current.left;
        if (rightGunRef.current) rightGunRef.current.position.z = -recoilOffsetsRef.current.right;

        const effectiveMouse = (lastInputSourceRef?.current === 'touch' && mobileAimRef)
            ? new THREE.Vector2(mobileAimRef.current.x, mobileAimRef.current.y)
            : mouse;

        raycaster.setFromCamera(effectiveMouse, camera);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(aimPlane, target);
        if (!target.lengthSq()) raycaster.ray.at(300, target);
        aimPointRef.current.copy(target);

        // Project 3D aim point to 2D screen coordinates for the crosshair
        const screenPos = target.clone().project(camera);
        const screenX = (screenPos.x * size.width / 2) + (size.width / 2);
        const screenY = -(screenPos.y * size.height / 2) + (size.height / 2);
        onAimMove(screenX, screenY);

        const now = Date.now();
        const weapon = WEAPONS[currentWeapon as WeaponId];
        const cooldownOk = now - lastTriggerTime.current > weapon.rate;
        const isShooting = isShootingInput || (isMobileFiringRef?.current ?? false);
        const justPressed = isShooting && !wasShootingRef.current;

        if (weapon.id === 1) {
            chargeProgressRef.current = 0;
            if (justPressed) {
                burstRemainingRef.current = weapon.burstCount;
            }
            if (burstRemainingRef.current > 0) {
                if (now - lastBurstShotTimeRef.current > weapon.rate) {
                    executeShot(target, now);
                    burstRemainingRef.current--;
                    lastBurstShotTimeRef.current = now;
                }
            }
        } else if (weapon.id === 3) {
            // Auto-charging logic for Tesla (Click -> Charge -> Fire)
            if (justPressed && cooldownOk && !isAutoChargingRef.current) {
                isAutoChargingRef.current = true;
                chargeProgressRef.current = 0;
            }

            if (isAutoChargingRef.current) {
                const chargeSpeed = (delta * 1000) / (weapon.chargeTime || 1000);
                chargeProgressRef.current = Math.min(1, chargeProgressRef.current + chargeSpeed);

                if (chargeProgressRef.current >= 1) {
                    lastTriggerTime.current = now;
                    executeShot(target, now);
                    chargeProgressRef.current = 0;
                    isAutoChargingRef.current = false;
                }
            } else {
                chargeProgressRef.current = 0;
            }
        } else {
            chargeProgressRef.current = 0;
            if (justPressed && cooldownOk) {
                lastTriggerTime.current = now;
                executeShot(target, now);
            }
        }
        wasShootingRef.current = isShooting;
    });

    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[0, 5, 2]} intensity={2} color="#ffffff" />
            <GunModel
                side="left"
                weaponId={currentWeapon}
                recoilRef={leftGunRef}
                aimPoint={aimPointRef}
                isShooting={isShootingInput || burstRemainingRef.current > 0}
                chargeScaleRef={chargeProgressRef}
                xOffset={-gunXOffset}
                muzzleFlashRef={muzzleFlashRef}
            />
            <GunModel
                side="right"
                weaponId={currentWeapon}
                recoilRef={rightGunRef}
                aimPoint={aimPointRef}
                isShooting={isShootingInput || burstRemainingRef.current > 0}
                chargeScaleRef={chargeProgressRef}
                xOffset={gunXOffset}
                muzzleFlashRef={muzzleFlashRef}
            />
            {projectiles.map((shot) => {
                const conf = WEAPONS[shot.weaponId as WeaponId];
                if (conf.type === 'instant' && shot.targetPos) {
                    return (
                        <LightningBolt
                            key={shot.id}
                            id={shot.id}
                            color={conf.color}
                            startPos={shot.startPosition}
                            targetPos={shot.targetPos}
                            onRemove={handleRemoveShot}
                        />
                    );
                }

                if (shot.velocity) {
                    return (
                        <Projectile
                            key={shot.id}
                            weaponId={shot.weaponId}
                            startPosition={shot.startPosition}
                            velocity={shot.velocity}
                            color={conf.color}
                            size={conf.size}
                            shotId={shot.shotId}
                            onEnemyHit={handleProjectileHit}
                            checkHit={checkHit}
                            onImpact={onImpact}
                            onRemove={() => handleRemoveShot(shot.id)}
                        />
                    );
                }

                return null;
            })}
        </>
    );
};

const WeaponButton = ({
    id,
    active,
    onSelect,
    cooldownEndsAt,
    disabled,
    blink,
}: {
    id: WeaponId;
    active: boolean;
    onSelect: () => void;
    cooldownEndsAt: number;
    disabled?: boolean;
    blink?: boolean;
}) => {
    const { t } = useI18n();
    const config = WEAPONS[id];
    const weaponLabel =
        id === 1
            ? t('battle.weapon_vulcan')
            : id === 2
                ? t('battle.weapon_cannon')
                : id === 3
                    ? t('battle.weapon_tesla')
                    : config.name;
    const [secondsLeft, setSecondsLeft] = useState(0);

    useEffect(() => {
        if (!cooldownEndsAt) return;
        const check = () => {
            const diff = cooldownEndsAt - Date.now();
            if (diff <= 0) {
                setSecondsLeft(0);
            } else {
                setSecondsLeft(diff / 1000);
                requestAnimationFrame(check);
            }
        };
        requestAnimationFrame(check);
    }, [cooldownEndsAt]);

    const onCooldown = secondsLeft > 0;

    const blinkBackground = 'linear-gradient(135deg, rgba(255,138,31,0.9), rgba(220,38,38,0.95))';
    const baseBackground = onCooldown
        ? 'linear-gradient(160deg, rgba(60,0,0,0.9), rgba(8,0,0,0.95))'
        : active
            ? `linear-gradient(160deg, ${config.baseColor}30, rgba(0,0,0,0.95) 60%)`
            : 'linear-gradient(160deg, rgba(20,20,20,0.9), rgba(0,0,0,0.95))';

    return (
        <motion.button
            onPointerDown={(e) => {
                e.stopPropagation();
            }}
            onPointerUp={(e) => {
                e.stopPropagation();
            }}
            onClick={(e) => {
                e.stopPropagation();
                if (disabled) return;
                onSelect();
            }}
            className={`relative px-2 py-1.5 flex flex-col items-center justify-center w-20 sm:w-28 md:w-36 h-14 sm:h-16 md:h-20 border-2 transition-all overflow-hidden skew-x-[10deg] rounded-xl shadow-[0_10px_22px_rgba(0,0,0,0.45)] ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0'}`}
            style={{
                borderColor: blink ? '#fb923c' : active ? config.baseColor : '#333',
                background: blink ? blinkBackground : baseBackground,
                boxShadow: active
                    ? `0 0 18px ${config.baseColor}55, 0 0 36px ${config.baseColor}25`
                    : '0 0 10px rgba(0,0,0,0.6)',
            }}
            animate={
                blink
                    ? {
                        scale: [1, 1.04, 1],
                        boxShadow: [
                            '0 0 10px rgba(249,115,22,0.6)',
                            '0 0 26px rgba(239,68,68,0.85)',
                            '0 0 10px rgba(249,115,22,0.6)',
                        ],
                    }
                    : { scale: 1, boxShadow: 'none' }
            }
            transition={blink ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
            <div className="skew-x-[-4deg] w-full flex flex-col items-center justify-center h-full z-10 relative">
                <span className={`text-caption md:text-label font-black uppercase tracking-[0.22em] sm:tracking-[0.3em] mb-1 italic ${active ? 'text-white' : 'text-gray-600'}`}>
                    {weaponLabel}
                </span>
                {onCooldown ? (
                    <div className="flex flex-col items-center justify-center h-full">
                        <span className="text-[16px] sm:text-[20px] md:text-[28px] font-mono font-bold text-red-400 leading-none tabular-nums drop-shadow-[0_0_10px_rgba(255,0,0,0.65)]">
                            {secondsLeft.toFixed(1)}
                        </span>
                    </div>
                ) : (
                    <span
                        className={`text-[16px] sm:text-h3 md:text-h2 font-bold font-mono tracking-wide italic ${active ? 'text-emerald-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.5)]' : 'text-gray-700'
                            }`}
                    >
                        {active ? t('battle.weapon_ready') : '---'}
                    </span>
                )}
            </div>
            {onCooldown && (
                <motion.div
                    className="absolute inset-0 bg-red-600 opacity-20 pointer-events-none origin-left"
                    initial={{ scaleX: 1 }}
                    animate={{ scaleX: 0 }}
                    transition={{ duration: secondsLeft, ease: 'linear' }}
                />
            )}
            {blink && (
                <motion.div
                    className="absolute inset-0 pointer-events-none"
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: [0.15, 0.5, 0.15] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <div className="absolute inset-0 bg-red-600/25" />
                    <div className="absolute inset-0 border border-red-500/80 shadow-[0_0_18px_rgba(239,68,68,0.45)]" />
                </motion.div>
            )}
        </motion.button>
    );
};

export const GameScene = React.memo(function GameScene({
    backgroundColor = '#050505',
    onHit,
    onVisualHit,
    checkHit,
    onImpact,
    showCrosshair = true,
    onShotAttempt,
    weaponAvailability,
    performanceTier = 'high',
}: GameSceneProps) {
    const [currentWeapon, setCurrentWeapon] = useState<WeaponId>(1);
    const [shake, setShake] = useState(0);
    const [isMouseDown, setIsMouseDown] = useState(false);
    const [cooldowns, setCooldowns] = useState<Record<number, number>>({});
    const [inputSource, setInputSource] = useState<ShotInputSource>('mouse');

    const mobileAimRef = useRef({ x: 0, y: 0 });
    const isMobileFiringRef = useRef(false);
    const lastInputSourceRef = useRef<ShotInputSource>('mouse');
    const crosshairRef = useRef<HTMLDivElement | null>(null);
    const crosshairPosRef = useRef({ x: 0, y: 0 });
    const shakeTimeoutRef = useRef<number | null>(null);
    const syncCrosshairTransform = useCallback(() => {
        const el = crosshairRef.current;
        if (!el) return;
        const { x, y } = crosshairPosRef.current;
        el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
    }, []);

    const handleAimMove = useCallback((x: number, y: number) => {
        crosshairPosRef.current.x = x;
        crosshairPosRef.current.y = y;
        if (lastInputSourceRef.current !== 'touch') return;
        syncCrosshairTransform();
    }, [syncCrosshairTransform]);

    const handleMobileAim = useCallback((x: number, y: number) => {
        mobileAimRef.current = { x, y };
        if (lastInputSourceRef.current !== 'touch') {
            lastInputSourceRef.current = 'touch';
            setInputSource('touch');
        }
    }, []);

    const handleMobileFire = useCallback((firing: boolean) => {
        isMobileFiringRef.current = firing;
        if (lastInputSourceRef.current !== 'touch') {
            lastInputSourceRef.current = 'touch';
            setInputSource('touch');
        }
    }, []);

    const triggerShake = useCallback(
        (amount: number) => {
            setShake((prev) => Math.max(prev, amount));
            if (shakeTimeoutRef.current) {
                window.clearTimeout(shakeTimeoutRef.current);
            }
            shakeTimeoutRef.current = window.setTimeout(() => {
                setShake(0);
                shakeTimeoutRef.current = null;
            }, 90);
        },
        [],
    );

    const canUseWeapon = useCallback((weaponId: WeaponId) => {
        if (!weaponAvailability) return true;
        return weaponAvailability[weaponId] !== false;
    }, [weaponAvailability]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === '1') setCurrentWeapon(1);
            if (e.key === '2' && canUseWeapon(2)) setCurrentWeapon(2);
            if (e.key === '3' && canUseWeapon(3)) setCurrentWeapon(3);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [canUseWeapon]);

    useEffect(() => {
        if (!canUseWeapon(currentWeapon) && currentWeapon !== 1) {
            setCurrentWeapon(1);
        }
    }, [canUseWeapon, currentWeapon]);

    useEffect(() => {
        return () => {
            if (shakeTimeoutRef.current) {
                window.clearTimeout(shakeTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (inputSource !== 'touch') return;
        syncCrosshairTransform();
    }, [inputSource, syncCrosshairTransform]);

    useEffect(() => {
        const stopShooting = () => setIsMouseDown(false);
        window.addEventListener('mouseup', stopShooting);
        window.addEventListener('touchend', stopShooting);
        window.addEventListener('touchcancel', stopShooting);
        window.addEventListener('pointerup', stopShooting);
        window.addEventListener('pointercancel', stopShooting);
        window.addEventListener('blur', stopShooting);
        return () => {
            window.removeEventListener('mouseup', stopShooting);
            window.removeEventListener('touchend', stopShooting);
            window.removeEventListener('touchcancel', stopShooting);
            window.removeEventListener('pointerup', stopShooting);
            window.removeEventListener('pointercancel', stopShooting);
            window.removeEventListener('blur', stopShooting);
        };
    }, []);

    const dprRange = useMemo<[number, number]>(() => {
        if (performanceTier === 'low') return [0.7, 1];
        if (performanceTier === 'medium') return [1, 1.25];
        return [1, 1.5];
    }, [performanceTier]);
    const canvasShadows = performanceTier !== 'low';
    const glOptions = useMemo(
        () => ({
            antialias: performanceTier !== 'low',
            powerPreference: (performanceTier === 'low' ? 'low-power' : 'high-performance') as WebGLPowerPreference,
        }),
        [performanceTier]
    );

    return (
        <div
            className="relative w-full h-full min-h-0 lg:h-screen overflow-hidden select-none cursor-crosshair"
            style={{ touchAction: 'none' }}
            onPointerDown={(e) => {
                if (e.pointerType !== 'mouse') return;
                if (e.button !== 0) return;
                lastInputSourceRef.current = 'mouse';
                setInputSource((prev) => (prev === 'mouse' ? prev : 'mouse'));
                setIsMouseDown(true);
            }}
            onPointerUp={() => setIsMouseDown(false)}
            onPointerLeave={() => setIsMouseDown(false)}
            onPointerCancel={() => setIsMouseDown(false)}
        >
            <motion.div
                className="w-full h-full"
                animate={{ x: shake ? randomRange(-shake, shake) : 0, y: shake ? randomRange(-shake, shake) : 0 }}
                transition={{ duration: 0.05 }}
            >
                <Canvas shadows={canvasShadows} dpr={dprRange} gl={glOptions}>
                    <PerspectiveCamera makeDefault position={[0, 0, 10]} fov={75} />
                    {backgroundColor !== 'transparent' && backgroundColor !== 'none' && (
                        <color attach="background" args={[backgroundColor]} />
                    )}
                    <SceneContent
                        currentWeapon={currentWeapon}
                        onShake={triggerShake}
                        isShootingInput={isMouseDown}
                        onCooldownStart={(endsAt: number) =>
                            setCooldowns((prev) => ({ ...prev, [currentWeapon]: endsAt }))
                        }
                        onHit={onHit}
                        onVisualHit={onVisualHit}
                        checkHit={checkHit}
                        onImpact={onImpact}
                        mobileAimRef={mobileAimRef}
                        isMobileFiringRef={isMobileFiringRef}
                        lastInputSourceRef={lastInputSourceRef}
                        onAimMove={handleAimMove}
                        onShotAttempt={onShotAttempt}
                    />
                </Canvas>
            </motion.div>

            <div
                className="absolute inset-x-0 bottom-0 flex gap-1.5 sm:gap-3 pointer-events-auto z-40 w-full justify-center px-2 sm:px-4 pb-2 sm:pb-4"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.35rem)' }}
            >
                {[1, 2, 3].map((num) => (
                    <WeaponButton
                        key={num}
                        id={num as WeaponId}
                        active={currentWeapon === num}
                        onSelect={() => setCurrentWeapon(num as WeaponId)}
                        cooldownEndsAt={cooldowns[num] || 0}
                        disabled={!canUseWeapon(num as WeaponId)}
                        blink={false}
                    />
                ))}
            </div>
            {showCrosshair && inputSource === 'touch' && (
                <div
                    ref={crosshairRef}
                    className="fixed w-6 h-6 pointer-events-none z-[200] transition-opacity duration-200"
                    style={{
                        left: 0,
                        top: 0,
                        willChange: 'transform',
                        transform: 'translate3d(0px, 0px, 0) translate(-50%, -50%)',
                        opacity: 1,
                    }}
                >
                    <div className="absolute top-1/2 left-0 w-full h-px bg-white/70 -translate-y-1/2 shadow-[0_0_3px_white]"></div>
                    <div className="absolute top-0 left-1/2 w-px h-full bg-white/70 -translate-x-1/2 shadow-[0_0_3px_white]"></div>
                </div>
            )}
            <MobileControls onAim={handleMobileAim} onFire={handleMobileFire} />
        </div>
    );
});

