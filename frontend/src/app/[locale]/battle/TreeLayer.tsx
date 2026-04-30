'use client';

import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

const TREE_PATH = '/tree.glb';
const LEAF_POINTS_PATH = '/tree-data/coordinate.txt';

const BASE_TREE_TARGET_SIZE = 420;
const BATTLE_TREE_TARGET_SIZE = 336;
const BATTLE_TREE_SCALE = BATTLE_TREE_TARGET_SIZE / BASE_TREE_TARGET_SIZE;

const LEAF_POINT_SIZE = 4.4;

const SATELLITE_LIGHT_MULT_PCT = 18;
const SATELLITE_LIGHT_MULT = SATELLITE_LIGHT_MULT_PCT / 100;
const SATELLITE_LIGHT_BOOST = 0.9;
const SATELLITE_GLOW_SCALE = 0.3;
const SATELLITE_AURA_OUTER_SCALE = 3.0;

const LEAF_BASE_COLOR = new THREE.Color('#57d96f');
const LEAF_TOP_COLOR = new THREE.Color('#dfffe8');
const LEAF_DEEP_COLOR = new THREE.Color('#7fe39b');

type BattleSatelliteCfg = {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  y: number;
  size: number;
  light: number;
  treeLightScale: number;
  lightDistance: number;
  lightDecay: number;
  radius: number;
  phase: number;
};

type Bounds3D = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};

const BATTLE_SATELLITE_CONFIGS: BattleSatelliteCfg[] = [
  {
    color: '#ffc95c',
    emissive: '#ff5d1f',
    emissiveIntensity: 3.2,
    y: 377,
    size: 8,
    light: 26,
    treeLightScale: 300,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 210,
    phase: 0,
  },
  {
    color: '#9fffb7',
    emissive: '#2edd72',
    emissiveIntensity: 3.2,
    y: 377 - (377 - 72) / 4,
    size: 8,
    light: 26,
    treeLightScale: 400,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 225,
    phase: (Math.PI * 2) / 5,
  },
  {
    color: '#78a8ff',
    emissive: '#2d63ff',
    emissiveIntensity: 3.2,
    y: 377 - ((377 - 72) / 4) * 2,
    size: 8,
    light: 26,
    treeLightScale: 600,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 240,
    phase: (Math.PI * 4) / 5,
  },
  {
    color: '#d1a0ff',
    emissive: '#8b4dff',
    emissiveIntensity: 3.2,
    y: 377 - ((377 - 72) / 4) * 3,
    size: 8,
    light: 26,
    treeLightScale: 900,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 262.5,
    phase: (Math.PI * 6) / 5,
  },
  {
    color: '#f7fbff',
    emissive: '#ffffff',
    emissiveIntensity: 3.2,
    y: 72,
    size: 8,
    light: 26,
    treeLightScale: 1500,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 285,
    phase: (Math.PI * 8) / 5,
  },
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function hash01(value: number) {
  const s = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function makeCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.Texture();
  }

  ctx.beginPath();
  ctx.arc(16, 16, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function makeRadialTexture(inner: number, outer: number, stops: Array<[number, number]>) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.Texture();
  }

  const gradient = ctx.createRadialGradient(128, 128, inner, 128, 128, outer);
  for (const [pos, alpha] of stops) {
    gradient.addColorStop(pos, `rgba(255,255,255,${alpha})`);
  }

  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function parseLeafPoints(text: string) {
  const points: THREE.Vector3[] = [];
  const re = /\[leaf-point\]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/;

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(re);
    if (!match) continue;

    const x = Number(match[1]);
    const y = Number(match[2]);
    const z = Number(match[3]);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    points.push(new THREE.Vector3(x, y, z));
  }

  return points;
}

function scaleLeafPoints(points: THREE.Vector3[]) {
  return points.map((point) => point.clone().multiplyScalar(BATTLE_TREE_SCALE));
}

function getPointBounds(points: THREE.Vector3[]): Bounds3D {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  return {
    minX: Number.isFinite(minX) ? minX : 0,
    maxX: Number.isFinite(maxX) ? maxX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 0,
    minZ: Number.isFinite(minZ) ? minZ : 0,
    maxZ: Number.isFinite(maxZ) ? maxZ : 0,
  };
}

function normalizeTree(root: THREE.Object3D) {
  const cloned = root.clone(true);
  const box = new THREE.Box3().setFromObject(cloned);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();

  box.getSize(size);
  box.getCenter(center);
  cloned.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const scale = BATTLE_TREE_TARGET_SIZE / maxDim;
  cloned.scale.setScalar(scale);

  const groundedBox = new THREE.Box3().setFromObject(cloned);
  if (Number.isFinite(groundedBox.min.y)) {
    cloned.position.y -= groundedBox.min.y;
  }

  cloned.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.renderOrder = 2;
  });

  return cloned;
}

function useLeafPoints() {
  const [points, setPoints] = useState<THREE.Vector3[]>([]);

  useEffect(() => {
    let active = true;

    fetch(LEAF_POINTS_PATH)
      .then((response) => response.text())
      .then((text) => {
        if (!active) return;
        setPoints(scaleLeafPoints(parseLeafPoints(text)));
      })
      .catch((error) => {
        console.error('Failed to load battle leaf points:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  return points;
}

function BattleTreeLeaves({ points }: { points: THREE.Vector3[] }) {
  const texture = useMemo(() => makeCircleTexture(), []);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  const { positions, colors } = useMemo(() => {
    const positionsOut = new Float32Array(points.length * 3);
    const colorsOut = new Float32Array(points.length * 3);

    let minY = Infinity;
    let maxY = -Infinity;
    for (const point of points) {
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }

    const rangeY = Math.max(1, maxY - minY);
    const mixColor = new THREE.Color();

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      positionsOut[i * 3] = point.x;
      positionsOut[i * 3 + 1] = point.y;
      positionsOut[i * 3 + 2] = point.z;

      const heightMix = clamp01((point.y - minY) / rangeY);
      const variation = hash01(i * 17.13 + point.x * 0.051 + point.y * 0.023 + point.z * 0.041);

      mixColor.copy(LEAF_BASE_COLOR);
      mixColor.lerp(LEAF_DEEP_COLOR, 0.24 + variation * 0.22);
      mixColor.lerp(LEAF_TOP_COLOR, heightMix * 0.42 + (variation > 0.92 ? 0.18 : 0));

      colorsOut[i * 3] = mixColor.r;
      colorsOut[i * 3 + 1] = mixColor.g;
      colorsOut[i * 3 + 2] = mixColor.b;
    }

    return { positions: positionsOut, colors: colorsOut };
  }, [points]);

  if (!points.length) return null;

  return (
    <points frustumCulled={false} renderOrder={7}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={LEAF_POINT_SIZE}
        vertexColors
        sizeAttenuation
        map={texture}
        alphaTest={0.5}
        transparent
        opacity={0.96}
      />
    </points>
  );
}

function BattleTreeSatellites() {
  const auraTexture = useMemo(
    () =>
      makeRadialTexture(6, 120, [
        [0, 0.9],
        [0.22, 0.55],
        [0.55, 0.18],
        [1, 0],
      ]),
    []
  );

  useEffect(() => {
    return () => {
      auraTexture.dispose();
    };
  }, [auraTexture]);

  const satellites = useMemo(
    () =>
      BATTLE_SATELLITE_CONFIGS.map((cfg) => {
        const scaledCfg = {
          ...cfg,
          y: cfg.y * BATTLE_TREE_SCALE,
          size: cfg.size * BATTLE_TREE_SCALE,
          radius: cfg.radius * BATTLE_TREE_SCALE,
          lightDistance: cfg.lightDistance * BATTLE_TREE_SCALE,
        };

        return {
          cfg: scaledCfg,
          x: Math.cos(scaledCfg.phase) * scaledCfg.radius,
          z: Math.sin(scaledCfg.phase) * scaledCfg.radius,
        };
      }),
    []
  );

  return (
    <group>
      {satellites.map(({ cfg, x, z }, index) => (
        <group key={`${cfg.color}-${cfg.phase}-${index}`} position={[x, cfg.y, z]}>
          <pointLight
            intensity={
              cfg.light *
              SATELLITE_LIGHT_MULT *
              SATELLITE_LIGHT_BOOST *
              SATELLITE_GLOW_SCALE *
              cfg.treeLightScale
            }
            distance={cfg.lightDistance}
            decay={cfg.lightDecay}
            color={cfg.color}
          />
          <sprite scale={[cfg.size * SATELLITE_AURA_OUTER_SCALE, cfg.size * SATELLITE_AURA_OUTER_SCALE, 1]}>
            <spriteMaterial
              map={auraTexture}
              color={cfg.color}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              opacity={0.374 * SATELLITE_GLOW_SCALE}
              toneMapped={false}
            />
          </sprite>
          <mesh renderOrder={9}>
            <sphereGeometry args={[cfg.size, 48, 48]} />
            <meshStandardMaterial
              color={cfg.color}
              emissive={cfg.emissive}
              emissiveIntensity={cfg.emissiveIntensity * SATELLITE_LIGHT_BOOST * SATELLITE_GLOW_SCALE}
              roughness={0.25}
              metalness={0.1}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function BattleTreeSystem({ rotate = true }: { rotate?: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene: loadedScene } = useGLTF(TREE_PATH);
  const leafPoints = useLeafPoints();

  const { scene, sceneBounds } = useMemo(() => {
    const normalized = normalizeTree(loadedScene);
    const bounds = new THREE.Box3().setFromObject(normalized);
    return {
      scene: normalized,
      sceneBounds: {
        minX: Number.isFinite(bounds.min.x) ? bounds.min.x : 0,
        maxX: Number.isFinite(bounds.max.x) ? bounds.max.x : 0,
        minY: Number.isFinite(bounds.min.y) ? bounds.min.y : 0,
        maxY: Number.isFinite(bounds.max.y) ? bounds.max.y : 0,
        minZ: Number.isFinite(bounds.min.z) ? bounds.min.z : 0,
        maxZ: Number.isFinite(bounds.max.z) ? bounds.max.z : 0,
      },
    };
  }, [loadedScene]);

  const contentOffset = useMemo<[number, number, number]>(() => {
    const leafBounds = getPointBounds(leafPoints);

    let minX = sceneBounds.minX;
    let maxX = sceneBounds.maxX;
    let minY = sceneBounds.minY;
    let maxY = sceneBounds.maxY;
    let minZ = sceneBounds.minZ;
    let maxZ = sceneBounds.maxZ;

    if (leafPoints.length) {
      minX = Math.min(minX, leafBounds.minX);
      maxX = Math.max(maxX, leafBounds.maxX);
      minY = Math.min(minY, leafBounds.minY);
      maxY = Math.max(maxY, leafBounds.maxY);
      minZ = Math.min(minZ, leafBounds.minZ);
      maxZ = Math.max(maxZ, leafBounds.maxZ);
    }

    for (const cfg of BATTLE_SATELLITE_CONFIGS) {
      const size = cfg.size * BATTLE_TREE_SCALE;
      const radius = cfg.radius * BATTLE_TREE_SCALE;
      const y = cfg.y * BATTLE_TREE_SCALE;
      const x = Math.cos(cfg.phase) * radius;
      const z = Math.sin(cfg.phase) * radius;

      minX = Math.min(minX, x - size * SATELLITE_AURA_OUTER_SCALE * 0.5);
      maxX = Math.max(maxX, x + size * SATELLITE_AURA_OUTER_SCALE * 0.5);
      minY = Math.min(minY, y - size * SATELLITE_AURA_OUTER_SCALE * 0.5);
      maxY = Math.max(maxY, y + size * SATELLITE_AURA_OUTER_SCALE * 0.5);
      minZ = Math.min(minZ, z - size * SATELLITE_AURA_OUTER_SCALE * 0.5);
      maxZ = Math.max(maxZ, z + size * SATELLITE_AURA_OUTER_SCALE * 0.5);
    }

    return [
      -((minX + maxX) / 2),
      -((minY + maxY) / 2),
      -((minZ + maxZ) / 2),
    ];
  }, [leafPoints, sceneBounds]);

  useEffect(() => {
    if (!rotate && groupRef.current) {
      groupRef.current.rotation.y = 0;
    }
  }, [rotate]);

  useFrame((state) => {
    if (!rotate || !groupRef.current) return;
    groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
  });

  return (
    <group ref={groupRef}>
      <group position={contentOffset}>
        <primitive object={scene} />
        <BattleTreeLeaves points={leafPoints} />
        <BattleTreeSatellites />
      </group>
    </group>
  );
}

export function YggdrasilTree({ rotate = true }: { rotate?: boolean }) {
  return (
    <Suspense fallback={null}>
      <BattleTreeSystem rotate={rotate} />
    </Suspense>
  );
}

export type TreeLayerProps = {
  transparent?: boolean;
  scale?: [number, number, number];
  position?: [number, number, number];
  pointerEvents?: 'none' | 'auto';
  className?: string;
  rotate?: boolean;
};

export function TreeLayer({
  transparent = true,
  scale = [0.5, 0.5, 0.5],
  position = [0, 80, 0],
  pointerEvents = 'none',
  className = '',
  rotate = true,
}: TreeLayerProps) {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ pointerEvents }}>
      <Canvas
        gl={{ antialias: false, alpha: transparent }}
        camera={{ position: [0, 240, 620], fov: 55, near: 1, far: 1400 }}
        style={{ background: transparent ? 'transparent' : '#020202' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[100, 200, 100]} intensity={0.8} />
        <pointLight position={[-100, 150, -100]} intensity={0.5} />
        <group scale={scale} position={position}>
          <YggdrasilTree rotate={rotate} />
        </group>
      </Canvas>
    </div>
  );
}

export function TreeSceneStandalone() {
  return (
    <div className="relative h-screen w-full bg-[#020202]">
      <TreeLayer transparent={false} scale={[1, 1, 1]} position={[0, 0, 0]} pointerEvents="auto" />
    </div>
  );
}

useGLTF.preload(TREE_PATH);
