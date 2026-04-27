'use client';

import React, { useEffect, useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
(useGLTF as unknown as { setDecoderPath: (path: string) => void }).setDecoderPath(DRACO_DECODER_PATH);

type SatelliteCfg = {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  y: number;
  size: number;
  light: number;
  lightDistance: number;
  lightDecay: number;
  radius: number;
  speed: number;
  dir: 1 | -1;
};

const SATELLITE_BOB_AMP = 6;

function buildLeafTipsPointsGeometry(root: THREE.Object3D, opts?: { count?: number }) {
  const count = opts?.count ?? 1600;

  const box = new THREE.Box3().setFromObject(root);
  const minY = box.min.y;
  const maxY = box.max.y;
  const height = Math.max(1e-6, maxY - minY);
  const yGate = minY + height * 0.72;

  const candidates: THREE.Vector3[] = [];

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry as THREE.BufferGeometry | undefined;
    const posAttr = geo?.getAttribute?.('position') as THREE.BufferAttribute | undefined;
    if (!posAttr || posAttr.itemSize !== 3) return;

    const world = new THREE.Matrix4();
    world.copy(mesh.matrixWorld);

    const stride = Math.max(1, Math.floor(posAttr.count / 1400));
    const v = new THREE.Vector3();
    for (let i = 0; i < posAttr.count; i += stride) {
      v.fromBufferAttribute(posAttr, i).applyMatrix4(world);
      if (v.y < yGate) continue;
      candidates.push(v.clone());
    }
  });

  if (candidates.length === 0) {
    return new THREE.BufferGeometry();
  }

  let maxR = 0;
  for (const p of candidates) {
    const r = Math.hypot(p.x, p.z);
    if (r > maxR) maxR = r;
  }

  const rGate = maxR * 0.78;
  const outer: THREE.Vector3[] = [];
  for (const p of candidates) {
    const r = Math.hypot(p.x, p.z);
    if (r >= rGate) outer.push(p);
  }

  const src = outer.length > 0 ? outer : candidates;
  const chosenCount = Math.min(count, src.length);

  const positions = new Float32Array(chosenCount * 3);
  for (let i = 0; i < chosenCount; i++) {
    const p = src[(Math.random() * src.length) | 0];
    const j = 0.9;
    positions[i * 3 + 0] = p.x + (Math.random() - 0.5) * j;
    positions[i * 3 + 1] = p.y + (Math.random() - 0.5) * j;
    positions[i * 3 + 2] = p.z + (Math.random() - 0.5) * j;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return g;
}

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

function makeCircleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.clearRect(0, 0, 256, 256);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function Satellite({
  cfg,
  auraSoft,
}: {
  cfg: SatelliteCfg;
  auraSoft: THREE.Texture;
}) {
  const ref = useRef<THREE.Group>(null!);
  const lensflareRef = useRef<Lensflare | null>(null);

  const lensflare = useMemo(() => {
    if (cfg.color !== '#ffffff') return null;

    const lf = new Lensflare();
    const tex = makeCircleTexture();
    lf.addElement(new LensflareElement(tex, 220, 0.0, new THREE.Color(cfg.color)));
    lf.addElement(new LensflareElement(tex, 120, 0.35, new THREE.Color('#ffffff')));
    lf.addElement(new LensflareElement(tex, 70, 0.65, new THREE.Color(cfg.color)));
    return lf;
  }, [cfg.color]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const a = t * cfg.speed * cfg.dir;
    const x = Math.cos(a) * cfg.radius;
    const z = Math.sin(a) * cfg.radius;
    const y = cfg.y + Math.sin(t * 1.1 + cfg.speed) * SATELLITE_BOB_AMP;
    ref.current.position.set(x, y, z);

    if (lensflareRef.current) {
      const s = 1 + Math.sin(t * 1.7) * 0.12;
      lensflareRef.current.scale.setScalar(s);
    }
  });

  const color = cfg.color;

  return (
    <group ref={ref}>
      <pointLight intensity={cfg.light} distance={0} decay={0} color={color} />

      <group>
        <sprite scale={[cfg.size * 13.5, cfg.size * 13.5, 1]}>
          <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.34} />
        </sprite>
        <sprite scale={[cfg.size * 6.0, cfg.size * 6.0, 1]}>
          <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.22} />
        </sprite>
        <mesh>
          <sphereGeometry args={[cfg.size, 128, 128]} />
          <meshStandardMaterial
            color={color}
            emissive={cfg.emissive}
            emissiveIntensity={cfg.emissiveIntensity}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
        {lensflare && <primitive object={lensflare} ref={lensflareRef} />}
      </group>
    </group>
  );
}

function SceneBloom() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 1.2, 0.8, 0.1);
    bloomPass.threshold = 0.0;
    bloomPass.strength = 3.0;
    bloomPass.radius = 0.9;

    composer.addPass(bloomPass);
    composer.setSize(size.width, size.height);

    composerRef.current = composer;

    return () => {
      composerRef.current = null;
      composer.dispose();
    };
  }, [gl, scene, camera, size.width, size.height]);

  useEffect(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.setSize(size.width, size.height);
  }, [size.width, size.height]);

  useFrame(() => {
    const composer = composerRef.current;
    if (!composer) return;
    composer.render();
  }, 1);

  return null;
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

  const leafTipsGeo = useMemo(() => buildLeafTipsPointsGeometry(scene, { count: 1700 }), [scene]);
  const leafDotTex = useMemo(() => makeCircleTexture(), []);

  useFrame((state) => {
    if (rotate && groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
      <points geometry={leafTipsGeo}>
        <pointsMaterial
          map={leafDotTex}
          color={new THREE.Color('#2cff3a')}
          size={2.2}
          sizeAttenuation
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
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

  const sats = useMemo<SatelliteCfg[]>(
    () => [
      {
        color: '#ffd200',
        emissive: '#ff7a00',
        emissiveIntensity: 3.6,
        y: 377,
        size: 18,
        light: 30,
        lightDistance: 0,
        lightDecay: 0,
        radius: 209,
        speed: 0.55,
        dir: 1,
      },
      {
        color: '#f3f7ff',
        emissive: '#f3f7ff',
        emissiveIntensity: 3.6,
        y: 208,
        size: 16,
        light: 30,
        lightDistance: 0,
        lightDecay: 0,
        radius: 248,
        speed: 0.35,
        dir: -1,
      },
      {
        color: '#1a7bff',
        emissive: '#0066ff',
        emissiveIntensity: 3.6,
        y: 72,
        size: 16,
        light: 30,
        lightDistance: 0,
        lightDecay: 0,
        radius: 292,
        speed: 0.7,
        dir: 1,
      },
    ],
    []
  );

  return (
    <group>
      {sats.map((cfg) => (
        <Satellite key={`${cfg.color}-${cfg.y}`} cfg={cfg} auraSoft={auraSoft} />
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
  position = [0, 56, 0],
  pointerEvents = 'none',
  className = '',
  rotate = true,
}: TreeLayerProps) {
  return (
    <div className={`absolute inset-0 ${className}`} style={{ pointerEvents }}>
      <Canvas
        gl={{ antialias: false, alpha: transparent }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ReinhardToneMapping;
          gl.toneMappingExposure = 1.3;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
        camera={{ position: [0, 240, 620], fov: 55, near: 1, far: 1400 }}
        style={{ background: transparent ? 'transparent' : '#020202' }}
      >
        <SceneBloom />
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
