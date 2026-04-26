'use client';
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, useTexture } from '@react-three/drei';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
export type CollectiveMeditationPhase = 'give' | 'absorb';
interface MeditationPlanetSceneProps {
phase: CollectiveMeditationPhase;
beamActive: boolean;
beamOriginScreenY?: number | null;
}

void EarthFallback;

void EnergyBeam;

type MiniGunShot = {
start: THREE.Vector3;
end: THREE.Vector3;
startTime: number;
duration: number;
size: number;
};

function MiniGunStream({
active,
towardsPlanet,
planetScaleRef,
beamOriginScreenY
}: {
active: boolean;
towardsPlanet: boolean;
planetScaleRef: React.RefObject<THREE.Group>;
beamOriginScreenY?: number | null;
}) {
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
const PLANET_BASE_RADIUS = 2;
const PLANET_SCREEN_RATIO = 0.62;
const getPlanetScale = (viewport: { width: number; height: number }) => {
  const minSide = Math.min(viewport.width, viewport.height);
  const targetDiameter = minSide * PLANET_SCREEN_RATIO;
  return targetDiameter / (PLANET_BASE_RADIUS * 2);
};

function EnergyBeam({ startPos, targetPos, active }: { startPos: THREE.Vector3; targetPos: THREE.Vector3; active: boolean }) {
const [bundlePoints, setBundlePoints] = useState<THREE.Vector3[][]>([]);
const bubbleRefs = useRef<(THREE.Mesh | null)[]>([]);
const strandDefs = useMemo(
() => [
{ phase: Math.random() * Math.PI * 2, offset: -0.35 },
{ phase: Math.random() * Math.PI * 2 + 1.2, offset: 0 },
{ phase: Math.random() * Math.PI * 2 + 2.4, offset: 0.35 }
],
[]
);
const bubbleConfigs = useMemo(() => {
const configs: { strandIndex: number; offset: number; speed: number; size: number }[] = [];
const bubblesPerStrand = 4;
for (let strandIndex = 0; strandIndex < strandDefs.length; strandIndex += 1) {
  for (let i = 0; i < bubblesPerStrand; i += 1) {
    configs.push({
      strandIndex,
      offset: Math.random(),
      speed: 0.03 + Math.random() * 0.02,
      size: 0.055 + Math.random() * 0.03
    });
  }
}

return configs;
}, [strandDefs.length]);
const tentacleSeed = useMemo(() => Math.random() * Math.PI * 2, []);
const windSeedA = useMemo(() => Math.random() * Math.PI * 2, []);
const windSeedB = useMemo(() => Math.random() * Math.PI * 2, []);
useFrame((state) => {
if (!active) {
if (bundlePoints.length > 0) setBundlePoints([]);
return;
}
const t = state.clock.getElapsedTime();
// Обновляем точки каждый кадр для эффекта живой энергии
const segments = 240;
const nextBundle = strandDefs.map(() => [] as THREE.Vector3[]);

const direction = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
const upGuide = Math.abs(direction.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
const right = new THREE.Vector3().crossVectors(direction, upGuide).normalize();
const normal = new THREE.Vector3().crossVectors(direction, right).normalize();
const windTime = t * 0.04;

// Плавная (не дерганая) анимация изгиба
const baseAmp = 0.12 + 0.02 * Math.sin(t * 0.01);
const waveTime = t * 0.01;
const waveCount = 2.6;

for (let i = 0; i <= segments; i++) {
  const alpha = i / segments;
  const basePoint = new THREE.Vector3().lerpVectors(startPos, targetPos, alpha);
  const arc = Math.sin(alpha * Math.PI);
  const phase = alpha * Math.PI * 2 * waveCount + waveTime;
  const amp = baseAmp * arc;

  // «Ленточка на ветру»: локальный твист и дрейф зависят от alpha вдоль луча
  const localTwist =
    (
      Math.sin(windTime + alpha * 7.0 + windSeedA) +
      0.6 * Math.sin(windTime * 0.7 + alpha * 13.0 + windSeedB)
    ) *
    0.55 *
    arc;
  const localTwistQuat = new THREE.Quaternion().setFromAxisAngle(direction, localTwist);
  const rightTwisted = right.clone().applyQuaternion(localTwistQuat);
  const normalTwisted = normal.clone().applyQuaternion(localTwistQuat);

  const drift =
    (
      0.7 * Math.sin(windTime * 0.9 + alpha * 5.5 + tentacleSeed) +
      0.35 * Math.sin(windTime * 1.3 + alpha * 9.5 + tentacleSeed * 1.7)
    ) *
    baseAmp *
    arc;

  strandDefs.forEach((strand, idx) => {
    const strandPhase = phase + strand.phase;
    const wave = Math.sin(strandPhase);
    const shift = strand.offset * baseAmp * 0.7;

    const point = basePoint
      .clone()
      .addScaledVector(rightTwisted, wave * amp + drift * 0.6)
      .addScaledVector(normalTwisted, shift + drift * 0.25);

    nextBundle[idx].push(point);
  });
}

setBundlePoints(nextBundle);

bubbleConfigs.forEach((bubbleConfig, index) => {
  const bubble = bubbleRefs.current[index];
  if (!bubble) return;

  const alpha = (t * bubbleConfig.speed + bubbleConfig.offset) % 1;
  const basePoint = new THREE.Vector3().lerpVectors(startPos, targetPos, alpha);
  const arc = Math.sin(alpha * Math.PI);
  const phase = alpha * Math.PI * 2 * waveCount + waveTime + strandDefs[bubbleConfig.strandIndex].phase;
  const amp = baseAmp * arc;
  const wave = Math.sin(phase);
  const shift = strandDefs[bubbleConfig.strandIndex].offset * baseAmp * 0.7;

  const localTwist =
    (
      Math.sin(windTime + alpha * 7.0 + windSeedA) +
      0.6 * Math.sin(windTime * 0.7 + alpha * 13.0 + windSeedB)
    ) *
    0.55 *
    arc;
  const localTwistQuat = new THREE.Quaternion().setFromAxisAngle(direction, localTwist);
  const rightTwisted = right.clone().applyQuaternion(localTwistQuat);
  const normalTwisted = normal.clone().applyQuaternion(localTwistQuat);

  const drift =
    (
      0.7 * Math.sin(windTime * 0.9 + alpha * 5.5 + tentacleSeed) +
      0.35 * Math.sin(windTime * 1.3 + alpha * 9.5 + tentacleSeed * 1.7)
    ) *
    baseAmp *
    arc;

  const bubblePoint = basePoint
    .addScaledVector(rightTwisted, wave * amp + drift * 0.6)
    .addScaledVector(normalTwisted, shift + drift * 0.25);

  const fade = Math.sin(alpha * Math.PI);
  const pulse = 0.85 + 0.25 * Math.sin(t * 0.6 + bubbleConfig.offset * Math.PI * 2);

  bubble.position.copy(bubblePoint);
  bubble.scale.setScalar(bubbleConfig.size * (0.4 + 0.6 * fade) * pulse);
});
});
if (!active || bundlePoints.length === 0) return null;
return (
<group>
{bundlePoints.map((strand, idx) => (
<group key={idx}>
{/* Основной яркий стержень */}
<Line
points={strand}
color="#d1fae5"
lineWidth={1.6}
transparent
opacity={0.8}
toneMapped={false}
blending={THREE.AdditiveBlending}
/>
{/* Среднее свечение */}
<Line
points={strand}
color="#34d399"
lineWidth={4.5}
transparent
opacity={0.35}
toneMapped={false}
blending={THREE.AdditiveBlending}
/>
{/* Широкая аура */}
<Line
points={strand}
color="#059669"
lineWidth={9}
transparent
opacity={0.14}
toneMapped={false}
blending={THREE.AdditiveBlending}
/>
</group>
))}
{bubbleConfigs.map((bubble, index) => (
<mesh
key={`bubble-${index}`}
renderOrder={10}
ref={(el) => {
bubbleRefs.current[index] = el;
}}
>
<sphereGeometry args={[0.04, 16, 16]} />
<meshBasicMaterial
color="#bbf7d0"
transparent
opacity={0.85}
blending={THREE.AdditiveBlending}
depthTest={false}
depthWrite={false}
/>
</mesh>
))}
</group>
);
}
function EarthFallback({ phase, beamActive, beamOriginScreenY }: MeditationPlanetSceneProps) {
const earthRef = useRef<THREE.Mesh>(null);
const groupRef = useRef<THREE.Group>(null);
const earthMaterialRef = useRef<THREE.MeshStandardMaterial>(null);
const glowRef = useRef<THREE.Mesh>(null);
const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
const absorbColor = useMemo(() => new THREE.Color(), []);
const spotRef = useRef<THREE.Mesh>(null);
const spotMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
const targetCurrentRef = useRef(new THREE.Vector3(0, 0, 2.02));
const targetDesiredRef = useRef(new THREE.Vector3(0, 0, 2.02));
const nextJumpAtRef = useRef(0);
const rotationGroupRef = useRef<THREE.Group>(null);
const pulseGroupRef = useRef<THREE.Group>(null);
const initialSpotGeometry = useMemo(() => new THREE.CircleGeometry(0.34, 64), []);
const streamActive = phase === 'give' && beamActive;
const streamTowardsPlanet = true;
useEffect(() => {
  return () => {
    initialSpotGeometry.dispose();
  };
}, [initialSpotGeometry]);
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
if (absorbActive && glowRef.current) {
  glowRef.current.scale.setScalar(1.06 + 0.05 * Math.sin(t * 1.2));
}
if (absorbActive && glowMaterialRef.current) {
  glowMaterialRef.current.color.copy(absorbColor);
  glowMaterialRef.current.opacity = 0.18 + 0.12 * Math.sin(t * 1.4 + 0.4);
}
const beamVisible = false;

if (beamVisible) {
  if (t >= nextJumpAtRef.current) {
    nextJumpAtRef.current = t + (0.44 + Math.random() * 0.76) * 6;
    const r = 2.06;
    const cameraPos = state.camera.position;
    const viewDir = cameraPos.clone().normalize();
    const worldRadius = r * (groupRef.current?.scale.x ?? 1);
    const maxNdc = 0.6;
    const candidate = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    const worldPoint = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    let found = false;
    for (let i = 0; i < 48; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * maxNdc;
      ndc.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5);
      worldPoint.copy(ndc).unproject(state.camera);
      rayDir.copy(worldPoint).sub(cameraPos).normalize();
      const b = cameraPos.dot(rayDir);
      const c = cameraPos.lengthSq() - worldRadius * worldRadius;
      const disc = b * b - c;
      if (disc <= 0) continue;
      const tHit = -b - Math.sqrt(disc);
      if (tHit <= 0) continue;
      candidate.copy(cameraPos).addScaledVector(rayDir, tHit);
      found = true;
      break;
    }
    if (!found) candidate.copy(viewDir).multiplyScalar(worldRadius);
    targetDesiredRef.current.copy(candidate);
  }

  const lerpK = 1 - Math.exp(-delta * 0.58333335);
  targetCurrentRef.current.lerp(targetDesiredRef.current, lerpK);

  if (spotRef.current && spotMaterialRef.current) {
    const n = targetCurrentRef.current.clone().normalize();
    const localDir = rotationGroupRef.current
      ? n.clone().applyQuaternion(rotationGroupRef.current.quaternion.clone().invert())
      : n;
    spotRef.current.position.copy(localDir.multiplyScalar(2.06));
    spotRef.current.lookAt(0, 0, 0);
    spotMaterialRef.current.opacity = 0.4;
    spotRef.current.visible = true;
  }
} else {
  if (spotRef.current) spotRef.current.visible = false;
}
});
return (
<group ref={groupRef}>
  <group ref={rotationGroupRef}>
    <group ref={pulseGroupRef}>
      <mesh ref={earthRef}>
      <sphereGeometry args={[2, 192, 192]} />
      <meshStandardMaterial ref={earthMaterialRef} color={'#111827'} roughness={0.95} metalness={0.05} />
      </mesh>
      <mesh ref={spotRef} renderOrder={12}>
        <primitive object={initialSpotGeometry} attach="geometry" />
        <meshBasicMaterial
          ref={spotMaterialRef}
          color={'#22c55e'}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
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
function EarthWithTextures({ phase, beamActive, beamOriginScreenY }: MeditationPlanetSceneProps) {
const earthRef = useRef<THREE.Mesh>(null);
const cloudsRef = useRef<THREE.Mesh>(null);
const groupRef = useRef<THREE.Group>(null);
const earthMaterialRef = useRef<THREE.MeshPhongMaterial>(null);
const cloudsMaterialRef = useRef<THREE.MeshPhongMaterial>(null);
const glowRef = useRef<THREE.Mesh>(null);
const glowMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
const absorbColor = useMemo(() => new THREE.Color(), []);
const spotRef = useRef<THREE.Mesh>(null);
const spotMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
const targetCurrentRef = useRef(new THREE.Vector3(0, 0, 2.02));
const targetDesiredRef = useRef(new THREE.Vector3(0, 0, 2.02));
const nextJumpAtRef = useRef(0);
const rotationGroupRef = useRef<THREE.Group>(null);
const pulseGroupRef = useRef<THREE.Group>(null);
const initialSpotGeometry = useMemo(() => new THREE.CircleGeometry(0.34, 64), []);
const streamActive = phase === 'give' && beamActive;
const streamTowardsPlanet = true;
const [dayMap, cloudsMap] = useTexture(['/8k_earth_daymap.jpg', '/2k_earth_clouds.jpg']) as [THREE.Texture, THREE.Texture];
useEffect(() => {
dayMap.colorSpace = THREE.SRGBColorSpace;
dayMap.anisotropy = 8;
cloudsMap.colorSpace = THREE.SRGBColorSpace;
cloudsMap.anisotropy = 8;
}, [dayMap, cloudsMap]);
useEffect(() => {
  return () => {
    initialSpotGeometry.dispose();
  };
}, [initialSpotGeometry]);
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

const beamVisible = false;

if (beamVisible) {
  if (t >= nextJumpAtRef.current) {
    nextJumpAtRef.current = t + (0.44 + Math.random() * 0.76) * 6;
    const r = 2.06;
    const cameraPos = state.camera.position;
    const viewDir = cameraPos.clone().normalize();
    const worldRadius = r * (groupRef.current?.scale.x ?? 1);
    const maxNdc = 0.6;
    const candidate = new THREE.Vector3();
    const ndc = new THREE.Vector3();
    const worldPoint = new THREE.Vector3();
    const rayDir = new THREE.Vector3();
    let found = false;
    for (let i = 0; i < 48; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * maxNdc;
      ndc.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.5);
      worldPoint.copy(ndc).unproject(state.camera);
      rayDir.copy(worldPoint).sub(cameraPos).normalize();
      const b = cameraPos.dot(rayDir);
      const c = cameraPos.lengthSq() - worldRadius * worldRadius;
      const disc = b * b - c;
      if (disc <= 0) continue;
      const tHit = -b - Math.sqrt(disc);
      if (tHit <= 0) continue;
      candidate.copy(cameraPos).addScaledVector(rayDir, tHit);
      found = true;
      break;
    }
    if (!found) candidate.copy(viewDir).multiplyScalar(worldRadius);
    targetDesiredRef.current.copy(candidate);
  }

  const lerpK = 1 - Math.exp(-delta * 0.58333335);
  targetCurrentRef.current.lerp(targetDesiredRef.current, lerpK);

  if (spotRef.current && spotMaterialRef.current) {
    const n = targetCurrentRef.current.clone().normalize();
    const localDir = rotationGroupRef.current
      ? n.clone().applyQuaternion(rotationGroupRef.current.quaternion.clone().invert())
      : n;
    spotRef.current.position.copy(localDir.multiplyScalar(2.06));
    spotRef.current.lookAt(0, 0, 0);
    spotMaterialRef.current.opacity = 0.4;
    spotRef.current.visible = true;
  }
} else {
  if (spotRef.current) spotRef.current.visible = false;
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
      <mesh ref={spotRef} renderOrder={12}>
        <primitive object={initialSpotGeometry} attach="geometry" />
        <meshBasicMaterial
          ref={spotMaterialRef}
          color={'#22c55e'}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
          side={THREE.DoubleSide}
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
