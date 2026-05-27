'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { ENEMY_PLANE_Z, findZoneForPoint } from './enemyZones';
import type { EnemyHitEvent } from './enemyZones';
import {
    LightningBolt,
    Projectile,
    toTuple,
    type ActiveShot,
} from './BattleProjectiles';
import { GunModel } from './BattleGuns';
import { MobileControls } from './MobileControls';
import { WeaponButton } from './WeaponButton';
import { WEAPONS, type WeaponId } from './battleWeapons';

export type { WeaponId } from './battleWeapons';
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

