'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import {
    ENEMY_PLANE_Z,
    computePlaneIntersection,
    findZoneForPoint,
} from './enemyZones';
import type { EnemyHitEvent } from './enemyZones';
import type { WeaponId } from './battleWeapons';

export type Vec3Tuple = [number, number, number];

export interface ActiveShot {
    id: string;
    shotId: string;
    weaponId: WeaponId;
    startPosition: Vec3Tuple;
    velocity?: Vec3Tuple;
    targetPos?: Vec3Tuple;
}

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

const PROJECTILE_REFERENCE_FPS = 60;
const MAX_PROJECTILE_STEP_DELTA = 1 / 20;

const randomRange = (min: number, max: number) => Math.random() * (max - min) + min;

export const toTuple = (vec: THREE.Vector3): Vec3Tuple => [vec.x, vec.y, vec.z];

export function Projectile({
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
}: ProjectileProps) {
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

    useFrame((_, delta) => {
        const safeDelta = Math.min(Math.max(delta, 0), MAX_PROJECTILE_STEP_DELTA);
        const frameScale = safeDelta * PROJECTILE_REFERENCE_FPS;
        const previous = positionRef.current.clone();
        positionRef.current.addScaledVector(velocityRef, frameScale);
        distanceTraveled.current += velocityRef.length() * frameScale;

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
}

export function LightningBolt({ color, startPos, targetPos, onRemove, id }: LightningBoltProps) {
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

    useFrame((_, delta) => {
        lifeRef.current -= delta * 0.8;
        setOpacity(Math.min(1, lifeRef.current));
        if (lifeRef.current <= 0) {
            onRemove(id);
        }
    });

    if (points.length < 2) return null;
    return <Line points={points} color={color} lineWidth={4} toneMapped={false} transparent opacity={opacity} />;
}
