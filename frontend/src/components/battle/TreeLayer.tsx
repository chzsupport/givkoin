'use client';

import React, { useEffect, useMemo, useRef, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

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

function makeNoiseTexture(seed: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  const img = ctx.createImageData(128, 128);
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(200 + rnd() * 55);
    img.data[i + 0] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.floor(180 + rnd() * 75);
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
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

const raymarchVertex = `
varying vec3 vPos;
void main(){
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const raymarchFragment = `
uniform vec3 uColor;
uniform float uRadius;
uniform float uGlow;
varying vec3 vPos;
void main(){
  float d = length(vPos);
  float surface = smoothstep(uRadius, uRadius - 0.02, d);
  float outside = max(d - uRadius, 0.0);
  float glow = exp(-outside * uGlow);
  float a = clamp(surface * 0.25 + glow * 0.55, 0.0, 1.0);
  vec3 col = uColor * (glow * 1.2);
  gl_FragColor = vec4(col, a);
}
`;

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

function Satellite({
  cfg,
  auraSoft,
  auraHard,
}: {
  cfg: SatelliteCfg;
  auraSoft: THREE.Texture;
  auraHard: THREE.Texture;
}) {
  const ref = useRef<THREE.Group>(null!);
  const lensflareRef = useRef<Lensflare | null>(null);

  const emissionMap = useMemo(() => makeNoiseTexture(cfg.id * 1337 + 7), [cfg.id]);

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
          <sprite scale={[cfg.size * 10.5, cfg.size * 10.5, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.14} />
          </sprite>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={6} roughness={0.2} metalness={0.0} />
          </mesh>
        </group>
      )}

      {cfg.id === 2 && (
        <group>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.2} />
          </mesh>
          <mesh>
            <sphereGeometry args={[cfg.size * 1.45, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      )}

      {cfg.id === 3 && (
        <group>
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
                uPower: { value: 2.6 },
                uIntensity: { value: 1.9 },
              }}
            />
          </mesh>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} />
          </mesh>
        </group>
      )}

      {cfg.id === 4 && (
        <group>
          <mesh>
            <planeGeometry args={[cfg.size * 12.5, cfg.size * 12.5]} />
            <meshBasicMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.2} />
          </mesh>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.14} />
          </mesh>
        </group>
      )}

      {cfg.id === 5 && (
        <group>
          <sprite scale={[cfg.size * 14.0, cfg.size * 14.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.18} />
          </sprite>
          <sprite scale={[cfg.size * 7.0, cfg.size * 7.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.12} />
          </sprite>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.14} />
          </mesh>
        </group>
      )}

      {cfg.id === 6 && (
        <group>
          <sprite scale={[cfg.size * 10.5, cfg.size * 10.5, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.14} />
          </sprite>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4.5} roughness={0.15} metalness={0.0} />
          </mesh>
        </group>
      )}

      {cfg.id === 7 && (
        <group>
          <sprite scale={[cfg.size * 18.0, cfg.size * 18.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.1} />
          </sprite>
          <sprite position={[0, 0, -cfg.size * 1.2]} scale={[cfg.size * 14.0, cfg.size * 14.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.07} />
          </sprite>
          <sprite position={[0, 0, cfg.size * 1.2]} scale={[cfg.size * 14.0, cfg.size * 14.0, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.07} />
          </sprite>
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.12} />
          </mesh>
        </group>
      )}

      {cfg.id === 8 && (
        <group>
          <mesh>
            <sphereGeometry args={[cfg.size, 64, 64]} />
            <shaderMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              vertexShader={raymarchVertex}
              fragmentShader={raymarchFragment}
              uniforms={{
                uColor: { value: new THREE.Color(color) },
                uRadius: { value: cfg.size * 0.95 },
                uGlow: { value: 0.35 },
              }}
            />
          </mesh>
        </group>
      )}

      {cfg.id === 9 && (
        <group>
          <sprite scale={[cfg.size * 12.5, cfg.size * 12.5, 1]}>
            <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.2} />
          </sprite>
          <sprite scale={[cfg.size * 6.0, cfg.size * 6.0, 1]}>
            <spriteMaterial map={auraHard} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.16} />
          </sprite>
          {lensflare && <primitive object={lensflare} ref={lensflareRef} />}
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.14} />
          </mesh>
        </group>
      )}

      {cfg.id === 10 && (
        <group>
          <sprite scale={[cfg.size * 11.5, cfg.size * 11.5, 1]}>
            <spriteMaterial map={emissionMap} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.22} />
          </sprite>
          <mesh>
            <planeGeometry args={[cfg.size * 17.0, cfg.size * 17.0]} />
            <shaderMaterial
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              vertexShader={rayGlowVertex}
              fragmentShader={rayGlowFragment}
              uniforms={{
                uColor: { value: new THREE.Color(color) },
                uStrength: { value: 1.15 },
                uSoftness: { value: 0.45 },
              }}
            />
          </mesh>
          {lensflare && <primitive object={lensflare} ref={lensflareRef} />}
          <mesh>
            <sphereGeometry args={[cfg.size, 32, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={7.5} roughness={0.1} metalness={0.0} />
          </mesh>
        </group>
      )}

      <Text color="#ffffff" fontSize={cfg.size * 0.95} anchorX="center" anchorY="middle" position={[0, labelOffset, 0]}>
        {String(cfg.id)}
      </Text>
    </group>
  );
}

function SceneBloom() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.9, 0.85, 0.15);
    bloomPass.threshold = 0.0;
    bloomPass.strength = 0.9;
    bloomPass.radius = 0.75;

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

  const sats = useMemo<SatelliteCfg[]>(
    () => [
      {
        id: 1,
        color: '#8fd3ff',
        yBase: 250,
        yAmp: 0,
        size: 16,
        light: 140,
      },
      {
        id: 2,
        color: '#8fd3ff',
        yBase: 205,
        yAmp: 0,
        size: 16,
        light: 110,
      },
      {
        id: 3,
        color: '#8fd3ff',
        yBase: 160,
        yAmp: 0,
        size: 16,
        light: 100,
      },
      {
        id: 4,
        color: '#8fd3ff',
        yBase: 115,
        yAmp: 0,
        size: 16,
        light: 90,
      },
      {
        id: 5,
        color: '#8fd3ff',
        yBase: 70,
        yAmp: 0,
        size: 16,
        light: 90,
      },
      {
        id: 6,
        color: '#8fd3ff',
        yBase: 25,
        yAmp: 0,
        size: 16,
        light: 125,
      },
      {
        id: 7,
        color: '#8fd3ff',
        yBase: -20,
        yAmp: 0,
        size: 16,
        light: 105,
      },
      {
        id: 8,
        color: '#8fd3ff',
        yBase: -65,
        yAmp: 0,
        size: 16,
        light: 90,
      },
      {
        id: 9,
        color: '#8fd3ff',
        yBase: -110,
        yAmp: 0,
        size: 16,
        light: 140,
      },
      {
        id: 10,
        color: '#8fd3ff',
        yBase: -155,
        yAmp: 0,
        size: 16,
        light: 180,
      },
    ],
    []
  );

  return (
    <group>
      {sats.map((cfg) => (
        <Satellite key={cfg.id} cfg={cfg} auraSoft={auraSoft} auraHard={auraHard} />
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
