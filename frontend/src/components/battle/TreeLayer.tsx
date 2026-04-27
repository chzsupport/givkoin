'use client';

import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
(useGLTF as unknown as { setDecoderPath: (path: string) => void }).setDecoderPath(DRACO_DECODER_PATH);

type SatelliteCfg = {
  id: number;
  color: string;
  radius: number;
  yBase: number;
  yAmp: number;
  speed: number;
  dir: 1 | -1;
  size: number;
  light: number;
};

function makeRadialTexture(opts: { inner: number; outer: number; stops: Array<[number, number]> }) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const g = ctx.createRadialGradient(128, 128, opts.inner, 128, 128, opts.outer);
  for (const [pos, alpha] of opts.stops) {
    g.addColorStop(pos, `rgba(255,255,255,${alpha})`);
  }

  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.lineWidth = 20;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.lineWidth = 48;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeStarTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, 256, 256);
  ctx.translate(128, 128);

  const rays = 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    ctx.save();
    ctx.rotate(a);
    const grad = ctx.createLinearGradient(0, 0, 120, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, -6, 120, 12);
    ctx.restore();
  }

  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function Satellite({
  cfg,
  auraSoft,
  auraHard,
  ring,
  star,
}: {
  cfg: SatelliteCfg;
  auraSoft: THREE.Texture;
  auraHard: THREE.Texture;
  ring: THREE.Texture;
  star: THREE.Texture;
}) {
  const ref = useRef<THREE.Group>(null!);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = t * cfg.speed * cfg.dir;
    ref.current.position.set(Math.cos(a) * cfg.radius, cfg.yBase + Math.sin(t * 0.9 + cfg.id) * cfg.yAmp, Math.sin(a) * cfg.radius);

    if (cfg.id === 5) {
      const s = 1 + Math.sin(t * 2.4) * 0.25;
      ref.current.scale.setScalar(s);
    } else {
      ref.current.scale.setScalar(1);
    }

    if (cfg.id === 6) {
      ref.current.rotation.z = t * 1.2;
    }
    if (cfg.id === 8) {
      ref.current.rotation.y = t * 0.8;
    }
  });

  const color = cfg.color;
  const labelOffset = cfg.size * 1.9;

  return (
    <group ref={ref}>
      <pointLight intensity={cfg.light} distance={0} decay={0} color={color} />

      {cfg.id === 1 && (
        <sprite scale={[cfg.size * 3.2, cfg.size * 3.2, 1]}>
          <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.8} />
        </sprite>
      )}

      {cfg.id === 2 && (
        <sprite scale={[cfg.size * 4.6, cfg.size * 4.6, 1]}>
          <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.95} />
        </sprite>
      )}

      {cfg.id === 3 && (
        <group>
          <sprite scale={[cfg.size * 3.6, cfg.size * 3.6, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.55} />
          </sprite>
          <sprite scale={[cfg.size * 2.2, cfg.size * 2.2, 1]}>
            <spriteMaterial map={auraHard} color={"#ffffff"} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.5} />
          </sprite>
        </group>
      )}

      {cfg.id === 4 && (
        <mesh>
          <sphereGeometry args={[cfg.size * 1.7, 32, 32]} />
          <meshStandardMaterial color={color} transparent opacity={0.18} emissive={new THREE.Color(color)} emissiveIntensity={1} />
        </mesh>
      )}

      {cfg.id === 5 && (
        <sprite scale={[cfg.size * 5.2, cfg.size * 5.2, 1]}>
          <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.55} />
        </sprite>
      )}

      {cfg.id === 6 && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[cfg.size * 2.6, cfg.size * 0.25, 16, 64]} />
          <meshBasicMaterial color={color} transparent opacity={0.75} blending={THREE.AdditiveBlending} />
        </mesh>
      )}

      {cfg.id === 7 && (
        <sprite scale={[cfg.size * 6.2, cfg.size * 6.2, 1]}>
          <spriteMaterial map={star} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.9} />
        </sprite>
      )}

      {cfg.id === 8 && (
        <sprite scale={[cfg.size * 5.4, cfg.size * 5.4, 1]}>
          <spriteMaterial map={ring} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.85} />
        </sprite>
      )}

      {cfg.id === 9 && (
        <group>
          <mesh>
            <sphereGeometry args={[cfg.size * 1.4, 32, 32]} />
            <meshBasicMaterial color={"#ffffff"} />
          </mesh>
          <sprite scale={[cfg.size * 6.8, cfg.size * 6.8, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.35} />
          </sprite>
        </group>
      )}

      {cfg.id === 10 && (
        <group>
          <sprite scale={[cfg.size * 7.8, cfg.size * 7.8, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.28} />
          </sprite>
          <sprite scale={[cfg.size * 4.2, cfg.size * 4.2, 1]}>
            <spriteMaterial map={ring} color={"#ffffff"} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.35} />
          </sprite>
          <sprite scale={[cfg.size * 2.4, cfg.size * 2.4, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.55} />
          </sprite>
        </group>
      )}

      <mesh>
        <sphereGeometry args={[cfg.size, 32, 32]} />
        <meshBasicMaterial color={color} />
      </mesh>

      <Text color="#ffffff" fontSize={cfg.size * 0.95} anchorX="center" anchorY="middle" position={[0, labelOffset, 0]}>
        {String(cfg.id)}
      </Text>
    </group>
  );
}

function TreeModel({ rotate = true }: { rotate?: boolean }) {
  const groupRef = useRef<THREE.Group>(null!);
  const { scene: loadedScene } = useGLTF('/tree-model.glb', true);

  const scene = useMemo(() => {
    const cloned = loadedScene.clone(true);

    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);

    cloned.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const targetSize = 420;
    const scale = targetSize / maxDim;
    cloned.scale.setScalar(scale);

    const boxAfter = new THREE.Box3().setFromObject(cloned);
    if (Number.isFinite(boxAfter.min.y)) {
      cloned.position.y -= boxAfter.min.y;
    }

    return cloned;
  }, [loadedScene]);

  useFrame((state) => {
    if (rotate && groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

export function YggdrasilTree({ rotate = true }: { rotate?: boolean }) {
  return (
    <Suspense fallback={null}>
      <group>
        <TreeModel rotate={rotate} />
        <TreeSatellites />
      </group>
    </Suspense>
  );
}

function TreeSatellites() {
  const auraSoft = useMemo(
    () =>
      makeRadialTexture({
        inner: 6,
        outer: 120,
        stops: [
          [0, 0.9],
          [0.22, 0.55],
          [0.55, 0.18],
          [1, 0],
        ],
      }),
    []
  );

  const auraHard = useMemo(
    () =>
      makeRadialTexture({
        inner: 0,
        outer: 92,
        stops: [
          [0, 1],
          [0.12, 0.95],
          [0.35, 0.25],
          [1, 0],
        ],
      }),
    []
  );

  const ring = useMemo(() => makeRingTexture(), []);
  const star = useMemo(() => makeStarTexture(), []);

  const sats = useMemo<SatelliteCfg[]>(
    () => [
      { id: 1, color: '#6bbcff', radius: 150, yBase: 130, yAmp: 22, speed: 0.7, dir: 1, size: 10, light: 140 },
      { id: 2, color: '#ffb16b', radius: 185, yBase: 170, yAmp: 26, speed: 0.55, dir: -1, size: 12, light: 130 },
      { id: 3, color: '#e7d7ff', radius: 220, yBase: 210, yAmp: 34, speed: 0.42, dir: 1, size: 13, light: 150 },
      { id: 4, color: '#7dffb3', radius: 260, yBase: 150, yAmp: 18, speed: 0.62, dir: -1, size: 11, light: 120 },
      { id: 5, color: '#ffd36b', radius: 300, yBase: 240, yAmp: 30, speed: 0.33, dir: 1, size: 14, light: 190 },
      { id: 6, color: '#ff6bd6', radius: 340, yBase: 190, yAmp: 22, speed: 0.48, dir: -1, size: 12, light: 140 },
      { id: 7, color: '#6bffea', radius: 380, yBase: 260, yAmp: 36, speed: 0.28, dir: 1, size: 15, light: 220 },
      { id: 8, color: '#b26bff', radius: 420, yBase: 230, yAmp: 28, speed: 0.22, dir: -1, size: 16, light: 200 },
      { id: 9, color: '#ffffff', radius: 460, yBase: 170, yAmp: 26, speed: 0.36, dir: 1, size: 11, light: 160 },
      { id: 10, color: '#ff7a6b', radius: 520, yBase: 290, yAmp: 40, speed: 0.18, dir: -1, size: 18, light: 260 },
    ],
    []
  );

  return (
    <group>
      {sats.map((cfg) => (
        <Satellite key={cfg.id} cfg={cfg} auraSoft={auraSoft} auraHard={auraHard} ring={ring} star={star} />
      ))}
    </group>
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
        <ambientLight intensity={0.25} />
        <group scale={scale} position={position}>
          <YggdrasilTree rotate={rotate} />
        </group>
      </Canvas>
    </div>
  );
}

export function TreeSceneStandalone() {
  return (
    <div className="relative w-full h-screen bg-[#020202]">
      <TreeLayer transparent={false} scale={[1, 1, 1]} position={[0, 0, 0]} pointerEvents="auto" />
    </div>
  );
}
