import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

type MiniGunShot = {
    start: THREE.Vector3;
    end: THREE.Vector3;
    startTime: number;
    duration: number;
    size: number;
};

type MiniGunStreamProps = {
    active: boolean;
    towardsPlanet: boolean;
    planetScaleRef: RefObject<THREE.Group>;
    beamOriginScreenY?: number | null;
};

export function MiniGunStream({
    active,
    towardsPlanet,
    planetScaleRef,
    beamOriginScreenY
}: MiniGunStreamProps) {
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const maxShots = 1800;
    const shots = useMemo<MiniGunShot[]>(
        () =>
            new Array(maxShots).fill(0).map(() => ({
                start: new THREE.Vector3(),
                end: new THREE.Vector3(),
                startTime: -999,
                duration: 4.4 + Math.random() * 2.0,
                size: 0.07 + Math.random() * 0.03
            })),
        []
    );
    const nextIndexRef = useRef(0);
    const lastSpawnRef = useRef(0);
    const targetCurrentRef = useRef(new THREE.Vector3(0, 0, 2.06));
    const targetDesiredRef = useRef(new THREE.Vector3(0, 0, 2.06));
    const nextTargetJumpRef = useRef(0);
    const tempObject = useMemo(() => new THREE.Object3D(), []);
    const tempVec = useMemo(() => new THREE.Vector3(), []);
    const tempVec2 = useMemo(() => new THREE.Vector3(), []);
    const tempVec3 = useMemo(() => new THREE.Vector3(), []);
    const tempVec4 = useMemo(() => new THREE.Vector3(), []);
    const tempRay = useMemo(() => new THREE.Vector3(), []);
    const tempNdc = useMemo(() => new THREE.Vector3(), []);
    const tempWorld = useMemo(() => new THREE.Vector3(), []);
    const tempUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
    const tempRight = useMemo(() => new THREE.Vector3(), []);
    const tempNormal = useMemo(() => new THREE.Vector3(), []);

    useEffect(() => {
        if (meshRef.current) meshRef.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    }, []);

    useFrame((state, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const t = state.clock.getElapsedTime();
        const planetScale = planetScaleRef.current?.scale.x ?? 1;
        const worldRadius = 2.06 * planetScale;
        const cameraPos = state.camera.position;
        const viewDir = tempVec.copy(cameraPos).normalize().negate();
        const upGuide = Math.abs(viewDir.y) > 0.85 ? tempUp.set(1, 0, 0) : tempUp.set(0, 1, 0);
        const right = tempRight.copy(viewDir).cross(upGuide).normalize();
        const up = tempNormal.copy(right).cross(viewDir).normalize();
        const compactLayout = Math.min(state.size.width, state.size.height) <= 1024;
        const hasOriginOverride = typeof beamOriginScreenY === 'number' && Number.isFinite(beamOriginScreenY);
        const worldPerPixel = state.viewport.height / state.size.height;
        const extraDownPixels = compactLayout && !hasOriginOverride ? Math.min(140, Math.max(70, state.size.height * 0.12)) : 0;
        const extraDownOffset = worldPerPixel * extraDownPixels;
        const sourceDepth = 0.6;
        const camera = state.camera as THREE.PerspectiveCamera;
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * sourceDepth;
        const canvasRect = hasOriginOverride ? state.gl.domElement.getBoundingClientRect() : null;
        const rawLocalY = hasOriginOverride && canvasRect ? beamOriginScreenY! - canvasRect.top : 0;
        const localY = hasOriginOverride && canvasRect ? Math.min(Math.max(rawLocalY, 0), canvasRect.height) : 0;
        const ndcY = hasOriginOverride && canvasRect ? 1 - (localY / canvasRect.height) * 2 : 0;
        const originDownBias = hasOriginOverride ? THREE.MathUtils.clamp(ndcY, -1, 1) * halfHeight : 0;

        if (active) {
            if (t >= nextTargetJumpRef.current) {
                nextTargetJumpRef.current = t + 1.2 + Math.random() * 1.6;
                const maxNdc = 0.55;
                let found = false;
                for (let i = 0; i < 40; i += 1) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = Math.sqrt(Math.random()) * maxNdc;
                    tempNdc.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5);
                    tempWorld.copy(tempNdc).unproject(state.camera);
                    tempRay.copy(tempWorld).sub(cameraPos).normalize();
                    const b = cameraPos.dot(tempRay);
                    const c = cameraPos.lengthSq() - worldRadius * worldRadius;
                    const disc = b * b - c;
                    if (disc <= 0) continue;
                    const tHit = -b - Math.sqrt(disc);
                    if (tHit <= 0) continue;
                    tempWorld.copy(cameraPos).addScaledVector(tempRay, tHit);
                    found = true;
                    break;
                }
                if (!found) tempWorld.copy(viewDir).multiplyScalar(worldRadius);
                targetDesiredRef.current.copy(tempWorld);
            }

            const targetLerp = 1 - Math.exp(-delta * 2.2);
            targetCurrentRef.current.lerp(targetDesiredRef.current, targetLerp);
        }

        const spawnRate = active ? 240 : 0;
        if (spawnRate > 0) {
            const interval = 1 / spawnRate;
            let last = lastSpawnRef.current;
            while (t - last > interval) {
                last += interval;
                const shot = shots[nextIndexRef.current];
                nextIndexRef.current = (nextIndexRef.current + 1) % shots.length;

                const minSide = Math.min(state.size.width, state.size.height);
                const compactSpreadBoost = compactLayout ? (minSide <= 420 ? 3.2 : 2.4) : 1;
                const compactSizeBoost = compactLayout ? (minSide <= 420 ? 1.7 : 1.35) : 1;
                const spread = 0.22 * planetScale * compactSpreadBoost;
                const downBias = hasOriginOverride ? originDownBias : -0.65 * planetScale - extraDownOffset;
                tempVec2
                    .copy(cameraPos)
                    .addScaledVector(viewDir, sourceDepth)
                    .addScaledVector(up, downBias)
                    .addScaledVector(right, (Math.random() - 0.5) * spread)
                    .addScaledVector(up, (Math.random() - 0.5) * spread);

                tempVec4.copy(targetCurrentRef.current);
                const from = towardsPlanet ? tempVec2 : tempVec4;
                const to = towardsPlanet ? tempVec4 : tempVec2;

                shot.start.copy(from);
                shot.end.copy(to);
                shot.startTime = last;
                shot.duration = 4.4 + Math.random() * 2.0;
                shot.size = (0.07 + Math.random() * 0.03) * planetScale * compactSizeBoost;
            }
            lastSpawnRef.current = last;
        } else {
            lastSpawnRef.current = t;
        }

        shots.forEach((shot, idx) => {
            const age = t - shot.startTime;
            if (age < 0 || age > shot.duration) {
                tempObject.scale.setScalar(0);
            } else {
                const p = age / shot.duration;
                const ease = p * p * (3 - 2 * p);
                tempVec3.copy(shot.start).lerp(shot.end, ease);
                const dissolve = 1 - Math.min(1, Math.max(0, (p - 0.9) / 0.1));
                const shrink = Math.max(0.75, 1.05 - 0.25 * p);
                const scale = shot.size * shrink * dissolve;
                tempObject.position.copy(tempVec3);
                tempObject.scale.setScalar(scale);
            }
            tempObject.updateMatrix();
            mesh.setMatrixAt(idx, tempObject.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, maxShots]} renderOrder={11}>
            <sphereGeometry args={[0.06, 10, 10]} />
            <meshBasicMaterial
                color="#bbf7d0"
                transparent
                opacity={0.9}
                blending={THREE.AdditiveBlending}
                depthWrite={false}
                toneMapped={false}
            />
        </instancedMesh>
    );
}
