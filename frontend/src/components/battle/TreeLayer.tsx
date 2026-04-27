'use client';

import React, { useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.6/';
(useGLTF as unknown as { setDecoderPath: (path: string) => void }).setDecoderPath(DRACO_DECODER_PATH);

type SatelliteCfg = {
  id: number;
  color: string;
  yBase: number;
  yAmp: number;
  size: number;
  light: number;
};

const SATELLITE_COLUMN_X = 160;

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

const fresnelVertex = `
varying vec3 vNormalW;
varying vec3 vViewDirW;
void main(){
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDirW = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const fresnelFragment = `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormalW;
varying vec3 vViewDirW;
void main(){
  float fres = pow(1.0 - max(dot(vNormalW, vViewDirW), 0.0), uPower);
  vec3 col = uColor * (fres * uIntensity);
  gl_FragColor = vec4(col, fres);
}
`;

const rayGlowVertex = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const rayGlowFragment = `
uniform vec3 uColor;
uniform float uStrength;
uniform float uSoftness;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float glow = exp(-pow(max(r - 0.35, 0.0) / max(uSoftness, 0.0001), 2.0)) * uStrength;
  float a = clamp(glow, 0.0, 1.0);
  gl_FragColor = vec4(uColor * glow, a);
}
`;

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
  const lensflareRef = useRef<Lensflare | null>(null);

  const lensflare = useMemo(() => {
    if (cfg.id !== 9) return null;

    const lf = new Lensflare();
    const tex = makeCircleTexture();
    lf.addElement(new LensflareElement(tex, 220, 0.0, new THREE.Color(cfg.color)));
    lf.addElement(new LensflareElement(tex, 120, 0.35, new THREE.Color('#ffffff')));
    lf.addElement(new LensflareElement(tex, 70, 0.65, new THREE.Color(cfg.color)));
    return lf;
  }, [cfg.id, cfg.color]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    ref.current.position.set(SATELLITE_COLUMN_X, cfg.yBase + Math.sin(t * 0.9 + cfg.id) * cfg.yAmp, 0);

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

    if (cfg.id === 9 && lensflareRef.current) {
      const s = 1 + Math.sin(t * 1.7) * 0.12;
      lensflareRef.current.scale.setScalar(s);
    }
  });

  const color = cfg.color;
  const labelOffset = cfg.size * 1.9;

  return (
    <group ref={ref}>
      <pointLight intensity={cfg.light} distance={0} decay={0} color={color} />

      {cfg.id === 1 && (
        <group>
          <sprite scale={[cfg.size * 7.5, cfg.size * 7.5, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.28} />
          </sprite>
          <sprite scale={[cfg.size * 3.4, cfg.size * 3.4, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.35} />
          </sprite>
        </group>
      )}

      {cfg.id === 2 && (
        <group>
          <sprite scale={[cfg.size * 9.0, cfg.size * 6.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.22} />
          </sprite>
          <sprite scale={[cfg.size * 4.2, cfg.size * 2.8, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.26} />
          </sprite>
        </group>
      )}

      {cfg.id === 3 && (
        <mesh>
          <sphereGeometry args={[cfg.size, 32, 32]} />
          <shaderMaterial
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            vertexShader={fresnelVertex}
            fragmentShader={fresnelFragment}
            uniforms={{
              uColor: { value: new THREE.Color(color) },
              uPower: { value: 2.8 },
              uIntensity: { value: 1.6 },
            }}
          />
        </mesh>
      )}

      {cfg.id === 4 && (
        <group>
          <sprite scale={[cfg.size * 11.0, cfg.size * 11.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.16} />
          </sprite>
        </group>
      )}

      {cfg.id === 5 && (
        <group>
          <sprite scale={[cfg.size * 8.5, cfg.size * 8.5, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.24} />
          </sprite>
          <sprite scale={[cfg.size * 4.0, cfg.size * 4.0, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.2} />
          </sprite>
        </group>
      )}

      {cfg.id === 6 && (
        <group>
          <sprite scale={[cfg.size * 12.0, cfg.size * 7.5, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.14} />
          </sprite>
          <sprite scale={[cfg.size * 6.5, cfg.size * 4.2, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.18} />
          </sprite>
        </group>
      )}

      {cfg.id === 7 && (
        <group>
          <sprite scale={[cfg.size * 7.2, cfg.size * 7.2, 1]}>
            <spriteMaterial map={star} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.2} />
          </sprite>
          <sprite scale={[cfg.size * 4.2, cfg.size * 4.2, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.18} />
          </sprite>
        </group>
      )}

      {cfg.id === 8 && (
        <group>
          <sprite scale={[cfg.size * 10.0, cfg.size * 10.0, 1]}>
            <spriteMaterial map={ring} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.12} />
          </sprite>
          <sprite scale={[cfg.size * 6.0, cfg.size * 6.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.16} />
          </sprite>
        </group>
      )}

      {cfg.id === 9 && (
        <group>
          <sprite scale={[cfg.size * 10.5, cfg.size * 10.5, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.2} />
          </sprite>
          <sprite scale={[cfg.size * 5.0, cfg.size * 5.0, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.18} />
          </sprite>
          {lensflare && <primitive object={lensflare} ref={lensflareRef} />}
        </group>
      )}

      {cfg.id === 10 && (
        <group>
          <mesh>
            <planeGeometry args={[cfg.size * 12.0, cfg.size * 12.0]} />
            <shaderMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              vertexShader={rayGlowVertex}
              fragmentShader={rayGlowFragment}
              uniforms={{
                uColor: { value: new THREE.Color(color) },
                uStrength: { value: 0.85 },
                uSoftness: { value: 0.55 },
              }}
            />
          </mesh>
          <sprite scale={[cfg.size * 7.0, cfg.size * 7.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.18} />
          </sprite>
        </group>
      )}

      <mesh>
        <sphereGeometry args={[cfg.size, 32, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.18} />
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
      { id: 1, color: '#8fd3ff', yBase: 250, yAmp: 0, size: 16, light: 90 },
      { id: 2, color: '#8fd3ff', yBase: 205, yAmp: 0, size: 16, light: 90 },
      { id: 3, color: '#8fd3ff', yBase: 160, yAmp: 0, size: 16, light: 90 },
      { id: 4, color: '#8fd3ff', yBase: 115, yAmp: 0, size: 16, light: 90 },
      { id: 5, color: '#8fd3ff', yBase: 70, yAmp: 0, size: 16, light: 90 },
      { id: 6, color: '#8fd3ff', yBase: 25, yAmp: 0, size: 16, light: 90 },
      { id: 7, color: '#8fd3ff', yBase: -20, yAmp: 0, size: 16, light: 90 },
      { id: 8, color: '#8fd3ff', yBase: -65, yAmp: 0, size: 16, light: 90 },
      { id: 9, color: '#8fd3ff', yBase: -110, yAmp: 0, size: 16, light: 90 },
      { id: 10, color: '#8fd3ff', yBase: -155, yAmp: 0, size: 16, light: 90 },
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
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.25;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
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
