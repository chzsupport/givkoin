import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { makeCircleTexture, makeRadialTexture } from './treeTextures';

type SatelliteCfg = {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  boost?: number;
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
const TREE_LIGHT_MULT_PCT = 5;
const TREE_LIGHT_MULT = TREE_LIGHT_MULT_PCT / 100;
const SATELLITE_LIGHT_BOOST = 1.1;

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
  const boost = cfg.boost ?? 1;

  return (
    <group ref={ref}>
      <pointLight intensity={cfg.light * TREE_LIGHT_MULT * SATELLITE_LIGHT_BOOST * boost} distance={cfg.lightDistance} decay={cfg.lightDecay} color={color} />

      <group>
        <sprite scale={[cfg.size * 13.5, cfg.size * 13.5, 1]}>
          <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.374 * boost} />
        </sprite>
        <sprite scale={[cfg.size * 6.0, cfg.size * 6.0, 1]}>
          <spriteMaterial map={auraSoft} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} opacity={0.242 * boost} />
        </sprite>
        <mesh>
          <sphereGeometry args={[cfg.size, 128, 128]} />
          <meshStandardMaterial
            color={color}
            emissive={cfg.emissive}
            emissiveIntensity={cfg.emissiveIntensity * SATELLITE_LIGHT_BOOST * boost}
            roughness={0.25}
            metalness={0.1}
          />
        </mesh>
        {lensflare && <primitive object={lensflare} ref={lensflareRef} />}
      </group>
    </group>
  );
}

export function TreeSatellites() {
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
        boost: 1.1,
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
