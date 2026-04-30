'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

type TreeSceneProps = {
  isTabVisible: boolean;
};

type GroundGlowState = {
  group: THREE.Group;
  light: THREE.PointLight;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
};

type WaveState = {
  overlay: THREE.Object3D;
  worldOffsetY: number;
  uniforms: {
    uTime: { value: number };
    uBottomY: { value: number };
    uTopY: { value: number };
    uCharge: { value: number };
    uWaveFrontY: { value: number };
    uWaveActive: { value: number };
    uPulse: { value: number };
  };
};

type TreeState = {
  waveBottomY: number;
  waveTopY: number;
};

type LeafState = {
  group: THREE.Group;
  points: THREE.Vector3[];
  bounds: {
    minY: number;
    maxY: number;
  };
  coreColors: Float32Array;
  auraColors: Float32Array;
  coreColorAttr: THREE.InstancedBufferAttribute;
  auraColorAttr: THREE.BufferAttribute;
};

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
  phase: number;
};

type SatelliteEntry = {
  cfg: SatelliteCfg;
  group: THREE.Group;
};

type SatelliteState = {
  group: THREE.Group;
  entries: SatelliteEntry[];
  auraSoft: THREE.Texture;
};

const TREE_PATH = '/leaf-train/tree.glb';
const COORDINATE_PATH = '/leaf-train/coordinate.txt';
const DRACO_PATH = '/leaf-train/draco/';
const BASE_TREE_TARGET_SIZE = 420;
const TREE_SCENE_SCALE = 0.8;
const TREE_SCENE_LIFT_RATIO = 0.05;

const ENERGY_CYCLE = 15;
const ENERGY_CHARGE_DURATION = 2.8;
const ENERGY_FLOW_DURATION = 4.8;
const ENERGY_PULSE_COUNT = 3;
const ENERGY_PULSE_PERIOD = 0.816;
const ENERGY_PULSE_WIDTH = 0.528;
const ENERGY_FLOW_END = ENERGY_CHARGE_DURATION + ENERGY_FLOW_DURATION;
const LEAF_WAVE_TOP_ZONE = 0.16;

const LEAF_WAVE_GOLD = new THREE.Color('#ffd76b');
const LEAF_SPARK_WHITE = new THREE.Color('#ffffff');
const LEAF_BRIGHTNESS_SCALE = 0.14112;
const LEAF_PULSE_WHITE_SCALE = 0.5;
const LEAF_PULSE_POWER_SCALE = 0.5;
const LEAF_CORE_BRIGHTNESS_BOOST = 1.872;
const LEAF_CORE_CONTRAST = 1.788;
const LEAF_AURA_BRIGHTNESS_SCALE = 0.34;
const LEAF_RAINBOW_HALF_CYCLE = 2;
const LEAF_BREATH_AMPLITUDE = 1;
const SATELLITE_SIZE = 16;
const SATELLITE_BOB_AMP = 6 * TREE_SCENE_SCALE;
const TREE_LIGHT_MULT_PCT = 4;
const TREE_LIGHT_MULT = TREE_LIGHT_MULT_PCT / 100;
const SATELLITE_LIGHT_BOOST = 0.9;
const SATELLITE_GLOW_SCALE = 0.3;
const SATELLITE_CONFIGS: SatelliteCfg[] = [
  {
    color: '#ffc95c',
    emissive: '#ff5d1f',
    emissiveIntensity: 3.2,
    y: 377,
    size: SATELLITE_SIZE,
    light: 26,
    lightDistance: 340,
    lightDecay: 1.8,
    radius: 210,
    speed: 0.55,
    dir: 1,
    phase: 0,
  },
  {
    color: '#f7fbff',
    emissive: '#ffffff',
    emissiveIntensity: 3.2,
    y: 208,
    size: SATELLITE_SIZE,
    light: 26,
    lightDistance: 340,
    lightDecay: 1.8,
    radius: 240,
    speed: 0.35,
    dir: -1,
    phase: (Math.PI * 2) / 3,
  },
  {
    color: '#78a8ff',
    emissive: '#2d63ff',
    emissiveIntensity: 3.2,
    y: 72,
    size: SATELLITE_SIZE,
    light: 26,
    lightDistance: 340,
    lightDecay: 1.8,
    radius: 285,
    speed: 0.7,
    dir: 1,
    phase: (Math.PI * 4) / 3,
  },
];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function hash01(value: number) {
  const s = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function hslToRgb(h: number, s: number, l: number) {
  const color = new THREE.Color();
  color.setHSL((((h % 360) + 360) % 360) / 360, clamp01(s), clamp01(l));
  return color;
}

function applyColorContrast(color: THREE.Color, contrast: number) {
  color.r = clamp01((color.r - 0.5) * contrast + 0.5);
  color.g = clamp01((color.g - 0.5) * contrast + 0.5);
  color.b = clamp01((color.b - 0.5) * contrast + 0.5);
  return color;
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

function getPointBounds(points: THREE.Vector3[]) {
  let minY = Infinity;
  let maxY = -Infinity;

  for (const point of points) {
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    minY: Number.isFinite(minY) ? minY : 0,
    maxY: Number.isFinite(maxY) ? maxY : 1,
  };
}

function scaleLeafPoints(points: THREE.Vector3[]) {
  return points.map((point) => point.clone().multiplyScalar(TREE_SCENE_SCALE));
}

function getEnergyPhase(timeSeconds: number) {
  const cycleT = ((timeSeconds % ENERGY_CYCLE) + ENERGY_CYCLE) % ENERGY_CYCLE;
  const charge =
    cycleT < ENERGY_CHARGE_DURATION
      ? smooth01(cycleT / ENERGY_CHARGE_DURATION)
      : Math.max(0, 1 - smooth01((cycleT - ENERGY_CHARGE_DURATION) / 0.7)) * 0.45;
  const flow = clamp01((cycleT - ENERGY_CHARGE_DURATION) / ENERGY_FLOW_DURATION);
  const flowActive = cycleT >= ENERGY_CHARGE_DURATION - 0.15 && cycleT <= ENERGY_FLOW_END;

  let leafPulse = 0;
  const pulseT = cycleT - ENERGY_FLOW_END;
  if (pulseT >= 0) {
    for (let i = 0; i < ENERGY_PULSE_COUNT; i += 1) {
      const localT = pulseT - i * ENERGY_PULSE_PERIOD;
      if (localT < 0 || localT > ENERGY_PULSE_WIDTH) continue;
      const pulse = Math.sin((localT / ENERGY_PULSE_WIDTH) * Math.PI);
      leafPulse = Math.max(leafPulse, pulse);
    }
  }

  return { cycleT, charge, flow, flowActive, leafPulse };
}

function createGroundGlow(leafGlowTexture: THREE.Texture): GroundGlowState {
  const group = new THREE.Group();
  group.position.set(0, 52 * TREE_SCENE_SCALE, 0);
  group.renderOrder = 4;

  const light = new THREE.PointLight('#74fff1', 4, 360 * TREE_SCENE_SCALE, 1.5);
  light.position.set(0, 10 * TREE_SCENE_SCALE, 0);
  group.add(light);

  const ringMaterial = new THREE.MeshBasicMaterial({
    map: leafGlowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const ring = new THREE.Mesh(new THREE.CircleGeometry(88 * TREE_SCENE_SCALE, 96), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4 * TREE_SCENE_SCALE;
  group.add(ring);

  const coreMaterial = new THREE.SpriteMaterial({
    map: leafGlowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const core = new THREE.Sprite(coreMaterial);
  core.rotation.x = Math.PI / 2;
  group.add(core);

  return { group, light, ring, ringMaterial, core, coreMaterial };
}

function createSatelliteState() {
  const group = new THREE.Group();
  const auraSoft = makeRadialTexture(6, 120, [
    [0, 0.9],
    [0.22, 0.55],
    [0.55, 0.18],
    [1, 0],
  ]);

  const entries = SATELLITE_CONFIGS.map((cfg) => {
    const scaledCfg: SatelliteCfg = {
      ...cfg,
      y: cfg.y * TREE_SCENE_SCALE,
      size: cfg.size * TREE_SCENE_SCALE,
      lightDistance: cfg.lightDistance * TREE_SCENE_SCALE,
      radius: cfg.radius * TREE_SCENE_SCALE,
    };

    const satGroup = new THREE.Group();
    const color = new THREE.Color(scaledCfg.color);

    const pointLight = new THREE.PointLight(
      scaledCfg.color,
      scaledCfg.light * TREE_LIGHT_MULT * SATELLITE_LIGHT_BOOST * SATELLITE_GLOW_SCALE,
      scaledCfg.lightDistance,
      scaledCfg.lightDecay
    );
    satGroup.add(pointLight);

    const visualGroup = new THREE.Group();

    const outerAuraMaterial = new THREE.SpriteMaterial({
      map: auraSoft,
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.374 * SATELLITE_GLOW_SCALE,
      toneMapped: false,
    });
    const outerAura = new THREE.Sprite(outerAuraMaterial);
    outerAura.scale.set(scaledCfg.size * 13.5, scaledCfg.size * 13.5, 1);
    visualGroup.add(outerAura);

    const innerAuraMaterial = new THREE.SpriteMaterial({
      map: auraSoft,
      color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.242 * SATELLITE_GLOW_SCALE,
      toneMapped: false,
    });
    const innerAura = new THREE.Sprite(innerAuraMaterial);
    innerAura.scale.set(scaledCfg.size * 6.0, scaledCfg.size * 6.0, 1);
    visualGroup.add(innerAura);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(scaledCfg.size, 48, 48),
      new THREE.MeshStandardMaterial({
        color: scaledCfg.color,
        emissive: scaledCfg.emissive,
        emissiveIntensity: scaledCfg.emissiveIntensity * SATELLITE_LIGHT_BOOST * SATELLITE_GLOW_SCALE,
        roughness: 0.25,
        metalness: 0.1,
      })
    );
    visualGroup.add(sphere);

    satGroup.add(visualGroup);
    group.add(satGroup);

    return {
      cfg: scaledCfg,
      group: satGroup,
    };
  });

  return {
    group,
    entries,
    auraSoft,
  };
}

function updateSatellites(timeSeconds: number, satelliteState: SatelliteState | null) {
  if (!satelliteState) return;

  for (const entry of satelliteState.entries) {
    const { cfg, group } = entry;
    const angle = timeSeconds * cfg.speed * cfg.dir + cfg.phase;
    const x = Math.cos(angle) * cfg.radius;
    const z = Math.sin(angle) * cfg.radius;
    const y = cfg.y + Math.sin(timeSeconds * 1.1 + cfg.speed) * SATELLITE_BOB_AMP;

    group.position.set(x, y, z);
  }
}

function disposeSatelliteState(satelliteState: SatelliteState | null) {
  if (!satelliteState) return;

  satelliteState.auraSoft.dispose();

  satelliteState.group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.geometry.dispose();
      if (Array.isArray(node.material)) {
        for (const material of node.material) {
          material.dispose();
        }
      } else {
        node.material.dispose();
      }
      return;
    }

    if (node instanceof THREE.Sprite) {
      node.material.dispose();
    }
  });
}

function createSilhouetteMaterial(uniforms: WaveState['uniforms']) {
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vViewNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vViewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uBottomY;
      uniform float uTopY;
      uniform float uCharge;
      uniform float uWaveFrontY;
      uniform float uWaveActive;
      uniform float uPulse;

      varying vec3 vWorldPosition;
      varying vec3 vViewNormal;

      void main() {
        float rangeY = max(0.0001, uTopY - uBottomY);
        float waveWidth = rangeY * 0.13;
        float waveTrail = rangeY * 0.26;
        float cappedY = clamp(vWorldPosition.y, uBottomY, uTopY);
        float level = clamp((cappedY - uBottomY) / rangeY, 0.0, 1.0);
        float edge = pow(clamp(1.0 - abs(normalize(vViewNormal).z), 0.0, 1.0), 1.9);
        edge = smoothstep(0.08, 0.95, edge);
        float topFade = 1.0 - smoothstep(uTopY, uTopY + rangeY * 0.025, vWorldPosition.y);

        float chargeGlow = uCharge * (1.0 - smoothstep(uBottomY, uBottomY + rangeY * 0.34, cappedY)) * 1.25;
        float waveGlow = 0.0;
        float trailGlow = 0.0;

        if (uWaveActive > 0.5) {
          waveGlow = 1.0 - smoothstep(0.0, waveWidth, abs(cappedY - uWaveFrontY));
          if (uWaveFrontY > cappedY) {
            trailGlow = max(0.0, 1.0 - (uWaveFrontY - cappedY) / waveTrail) * 0.32;
          }
        }

        waveGlow *= topFade;
        trailGlow *= topFade;

        float topPulse = uPulse
          * smoothstep(uTopY - rangeY * 0.18, uTopY - rangeY * 0.03, cappedY)
          * (1.0 - smoothstep(uTopY, uTopY + rangeY * 0.02, vWorldPosition.y));

        float shimmer = 0.028 + 0.022 * sin(uTime * 1.7 + level * 12.0);
        float glow = (shimmer + chargeGlow + waveGlow * 2.35 + trailGlow + topPulse * 1.35) * edge;

        vec3 cool = vec3(0.33, 1.0, 0.95);
        vec3 warm = vec3(1.0, 0.84, 0.42);
        vec3 color = mix(cool, warm, clamp(chargeGlow * 0.75 + waveGlow * 0.92, 0.0, 1.0));
        color = mix(color, vec3(1.0), clamp(topPulse * 0.52 + waveGlow * 0.14, 0.0, 1.0));

        gl_FragColor = vec4(color * glow, clamp(glow * 0.72, 0.0, 1.0));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });

  material.toneMapped = false;
  return material;
}

function createLeafSystem(points: THREE.Vector3[], leafGlowTexture: THREE.Texture): LeafState {
  const count = points.length;
  const coreColors = new Float32Array(count * 3);
  const auraColors = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
  }

  const sphereGeometry = new THREE.SphereGeometry(1.25 * TREE_SCENE_SCALE, 8, 8);
  const core = new THREE.InstancedMesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({ toneMapped: false }),
    count
  );
  core.renderOrder = 8;

  const auraGeometry = new THREE.BufferGeometry();
  auraGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const auraColorAttr = new THREE.BufferAttribute(auraColors, 3);
  auraGeometry.setAttribute('color', auraColorAttr);

  const aura = new THREE.Points(
    auraGeometry,
    new THREE.PointsMaterial({
      size: 10.5 * TREE_SCENE_SCALE,
      map: leafGlowTexture,
      alphaMap: leafGlowTexture,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      depthTest: true,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      sizeAttenuation: true,
    })
  );
  aura.renderOrder = 7;

  const coreColorAttr = new THREE.InstancedBufferAttribute(coreColors, 3);
  core.instanceColor = coreColorAttr;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i += 1) {
    dummy.position.copy(points[i]);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(1);
    dummy.updateMatrix();
    core.setMatrixAt(i, dummy.matrix);
  }

  core.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(aura);
  group.add(core);

  return {
    group,
    points,
    bounds: getPointBounds(points),
    coreColors,
    auraColors,
    coreColorAttr,
    auraColorAttr,
  };
}

function updateGroundGlow(timeSeconds: number, groundState: GroundGlowState | null) {
  if (!groundState) return;

  const phase = getEnergyPhase(timeSeconds);
  const glow =
    phase.cycleT < ENERGY_CHARGE_DURATION
      ? 0.18 + phase.charge * 1.25
      : 0.12 + Math.max(0, 1 - phase.flow) * 0.32;

  const size = (72 + glow * 60) * TREE_SCENE_SCALE;
  groundState.core.scale.set(size, size, 1);

  const scale = 1 + glow * 0.2;
  groundState.ring.scale.set(scale, scale * 0.82, 1);
  groundState.ring.rotation.z = timeSeconds * 0.08;

  groundState.coreMaterial.opacity = Math.min(0.4, 0.09 + glow * 0.22);
  groundState.coreMaterial.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.55);

  groundState.ringMaterial.opacity = Math.min(0.22, 0.05 + glow * 0.1);
  groundState.ringMaterial.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.42);

  groundState.light.intensity = 2.4 + glow * 10 + phase.leafPulse * 3.2;
  groundState.light.distance = (300 + glow * 180) * TREE_SCENE_SCALE;
  groundState.light.color.set('#74fff1').lerp(new THREE.Color('#ffe08c'), phase.charge * 0.46);
}

function updateWave(timeSeconds: number, waveState: WaveState | null, treeState: TreeState | null) {
  if (!waveState || !treeState) return;

  const phase = getEnergyPhase(timeSeconds);
  const worldBottomY = treeState.waveBottomY + waveState.worldOffsetY;
  const worldTopY = treeState.waveTopY + waveState.worldOffsetY;
  waveState.uniforms.uTime.value = timeSeconds;
  waveState.uniforms.uBottomY.value = worldBottomY;
  waveState.uniforms.uTopY.value = worldTopY;
  waveState.uniforms.uCharge.value = phase.charge;
  waveState.uniforms.uWaveFrontY.value = THREE.MathUtils.lerp(
    worldBottomY,
    worldTopY,
    phase.flow
  );
  waveState.uniforms.uWaveActive.value = phase.flowActive ? 1 : 0;
  waveState.uniforms.uPulse.value = phase.leafPulse;
}

function updateLeaves(timeSeconds: number, leafState: LeafState | null, treeState: TreeState | null) {
  if (!leafState || !treeState) return;

  const phase = getEnergyPhase(timeSeconds);
  const { points, bounds, coreColors, auraColors, coreColorAttr, auraColorAttr } = leafState;
  const { minY, maxY } = bounds;
  const range = maxY - minY || TREE_SCENE_SCALE;
  const waveRange = Math.max(TREE_SCENE_SCALE, treeState.waveTopY - treeState.waveBottomY);
  const waveFrontY = THREE.MathUtils.lerp(treeState.waveBottomY, treeState.waveTopY, phase.flow);
  const waveBand = Math.max(10 * TREE_SCENE_SCALE, waveRange * 0.085);

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const py = point.y;
    const normY = (py - minY) / range;
    const tipWeight = smooth01((normY - (1 - LEAF_WAVE_TOP_ZONE)) / LEAF_WAVE_TOP_ZONE);
    const gemSeed = hash01(i * 17.13 + point.x * 0.051 + point.y * 0.023 + point.z * 0.041);
    const gemShift = hash01(i * 9.31 + point.x * 0.017 - point.z * 0.013 + normY * 5.7);
    const rainbowCycle =
      ((timeSeconds + gemShift * LEAF_RAINBOW_HALF_CYCLE * 2) / LEAF_RAINBOW_HALF_CYCLE) % 2;
    const rainbowPing = 1 - Math.abs(rainbowCycle - 1);
    const hue = THREE.MathUtils.lerp(0, 280, rainbowPing);
    const sat = 0.9 + gemSeed * 0.08;
    const light = 0.55 + gemShift * 0.14;
    let color = hslToRgb(hue, sat, light);

    const twinkle =
      0.78 + 0.22 * Math.sin(timeSeconds * (1.7 + gemSeed * 0.8) + i * 0.61 + gemShift * 7.4);
    const breath =
      1 + Math.sin(timeSeconds * Math.PI + gemShift * Math.PI * 2 + gemSeed * 4) * LEAF_BREATH_AMPLITUDE;
    const whiteSpark =
      Math.pow(
        clamp01(
          Math.sin(timeSeconds * (5.8 + gemSeed * 2.2) + i * 1.67 + gemShift * 10.2) * 0.5 + 0.5
        ),
        22
      ) * (0.04 + gemSeed * 0.1);
    const diamondFlash =
      Math.pow(
        clamp01(
          Math.sin(timeSeconds * (3.1 + gemSeed * 1.3) + i * 0.27 + gemShift * 17) * 0.5 + 0.5
        ),
        28
      ) * (0.06 + gemShift * 0.12);
    const flowTouch = phase.flowActive
      ? smooth01(1 - Math.abs(py - waveFrontY) / Math.max(14 * TREE_SCENE_SCALE, waveBand * 1.22))
      : 0;
    const pulseTouch = phase.leafPulse;

    color = color.lerp(LEAF_SPARK_WHITE, whiteSpark * 0.18 + diamondFlash * 0.28);
    color = color.lerp(LEAF_WAVE_GOLD, flowTouch * (0.16 + tipWeight * 0.1));
    color = color.lerp(
      LEAF_SPARK_WHITE,
      pulseTouch * 0.985 * LEAF_PULSE_WHITE_SCALE + whiteSpark * 0.1 + diamondFlash * 0.14
    );
    applyColorContrast(color, LEAF_CORE_CONTRAST);

    const corePower =
      (1.15 +
        twinkle * 0.38 +
        whiteSpark * 0.42 +
        diamondFlash * 0.78 +
        flowTouch * 0.9 +
        pulseTouch * 5.4 * LEAF_PULSE_POWER_SCALE) *
      LEAF_BRIGHTNESS_SCALE *
      LEAF_CORE_BRIGHTNESS_BOOST *
      breath;

    const auraPower =
      (0.34 +
        twinkle * 0.14 +
        whiteSpark * 0.14 +
        diamondFlash * 0.22 +
        flowTouch * 0.52 +
        pulseTouch * 1.9 * LEAF_PULSE_POWER_SCALE) *
      LEAF_BRIGHTNESS_SCALE *
      LEAF_AURA_BRIGHTNESS_SCALE *
      (0.8 + (breath - 1) * 0.35);

    coreColors[i * 3] = color.r * corePower;
    coreColors[i * 3 + 1] = color.g * corePower;
    coreColors[i * 3 + 2] = color.b * corePower;

    auraColors[i * 3] = color.r * auraPower;
    auraColors[i * 3 + 1] = color.g * auraPower;
    auraColors[i * 3 + 2] = color.b * auraPower;
  }

  coreColorAttr.needsUpdate = true;
  auraColorAttr.needsUpdate = true;
}

async function loadLeafPoints() {
  const response = await fetch(COORDINATE_PATH);
  const text = await response.text();
  const points = scaleLeafPoints(parseLeafPoints(text));
  if (!points.length) {
    throw new Error('Leaf points not found');
  }
  return points;
}

async function loadTree() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_PATH);
  dracoLoader.setDecoderConfig({ type: 'js' });
  dracoLoader.preload();
  loader.setDRACOLoader(dracoLoader);

  return new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      TREE_PATH,
      (gltf) => {
        dracoLoader.dispose();
        resolve(gltf.scene.clone(true));
      },
      undefined,
      (error) => {
        dracoLoader.dispose();
        reject(error);
      }
    );
  });
}

function normalizeTree(root: THREE.Group) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = BASE_TREE_TARGET_SIZE * TREE_SCENE_SCALE;
  const scale = targetSize / maxDim;
  root.scale.setScalar(scale);

  const groundedBox = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(groundedBox.min.y)) {
    root.position.y -= groundedBox.min.y;
  }

  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.castShadow = false;
    node.receiveShadow = false;
    node.renderOrder = 2;

    if (Array.isArray(node.material)) return;
    if ('emissiveIntensity' in node.material) {
      node.material.emissiveIntensity *= 1.03;
    }
  });

  return root;
}

export default function TreeScene({ isTabVisible }: TreeSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const visibleRef = useRef(isTabVisible);

  useEffect(() => {
    visibleRef.current = isTabVisible;
  }, [isTabVisible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 5000);
    camera.position.set(0, 240, 620);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.26;
    container.appendChild(renderer.domElement);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.2, 0.72, 0.05);
    bloomPass.threshold = 0;
    bloomPass.strength = 1.35;
    bloomPass.radius = 0.72;
    composer.addPass(bloomPass);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 210, 0);

    scene.add(new THREE.HemisphereLight('#8cc8ff', '#09050e', 0.56));
    const fillLight = new THREE.DirectionalLight('#bfe9ff', 0.38);
    fillLight.position.set(-180, 320, 220);
    scene.add(fillLight);

    const treeRig = new THREE.Group();
    scene.add(treeRig);

    const clock = new THREE.Clock();
    const leafGlowTexture = makeRadialTexture(0, 128, [
      [0, 1],
      [0.34, 0.82],
      [0.7, 0.22],
      [1, 0],
    ]);

    let frameId = 0;
    let disposed = false;
    let treeState: TreeState | null = null;
    let waveState: WaveState | null = null;
    let groundState: GroundGlowState | null = null;
    let leafState: LeafState | null = null;
    let satelliteState: SatelliteState | null = null;

    const onResize = () => {
      const nextWidth = container.clientWidth || window.innerWidth;
      const nextHeight = container.clientHeight || window.innerHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
      composer.setSize(nextWidth, nextHeight);
    };

    const animate = () => {
      frameId = window.requestAnimationFrame(animate);
      if (!visibleRef.current) return;

      const timeSeconds = clock.getElapsedTime();
      treeRig.rotation.y = timeSeconds * 0.05;

      updateGroundGlow(timeSeconds, groundState);
      updateWave(timeSeconds, waveState, treeState);
      updateLeaves(timeSeconds, leafState, treeState);
      updateSatellites(timeSeconds, satelliteState);

      controls.update();
      composer.render();
    };

    const init = async () => {
      const leafPoints = await loadLeafPoints();
      const root = normalizeTree(await loadTree());
      if (disposed) return;

      treeRig.add(root);

      const finalBox = new THREE.Box3().setFromObject(root);
      const sceneBounds = {
        minY: Number.isFinite(finalBox.min.y) ? finalBox.min.y : 0,
        maxY: Number.isFinite(finalBox.max.y) ? finalBox.max.y : 1,
      };
      const leafBounds = getPointBounds(leafPoints);
      const waveBottomY = sceneBounds.minY;
      const waveTopY = Math.max(
        waveBottomY + TREE_SCENE_SCALE,
        Math.min(sceneBounds.maxY, leafBounds.maxY)
      );
      const structureMinY = Math.min(sceneBounds.minY, leafBounds.minY);
      const structureMaxY = Math.max(sceneBounds.maxY, leafBounds.maxY);
      const structureHeight =
        structureMaxY - structureMinY || BASE_TREE_TARGET_SIZE * TREE_SCENE_SCALE;
      const treeLiftY = structureHeight * TREE_SCENE_LIFT_RATIO;

      treeRig.position.y = treeLiftY;

      groundState = createGroundGlow(leafGlowTexture);
      treeRig.add(groundState.group);

      const waveUniforms: WaveState['uniforms'] = {
        uTime: { value: 0 },
        uBottomY: { value: waveBottomY },
        uTopY: { value: waveTopY },
        uCharge: { value: 0 },
        uWaveFrontY: { value: waveBottomY },
        uWaveActive: { value: 0 },
        uPulse: { value: 0 },
      };

      const overlay = root.clone(true);
      overlay.scale.multiplyScalar(1.018);
      overlay.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        node.material = createSilhouetteMaterial(waveUniforms);
        node.frustumCulled = false;
        node.renderOrder = 4;
      });
      treeRig.add(overlay);

      leafState = createLeafSystem(leafPoints, leafGlowTexture);
      treeRig.add(leafState.group);

      satelliteState = createSatelliteState();
      treeRig.add(satelliteState.group);

      treeState = { waveBottomY, waveTopY };
      waveState = { overlay, uniforms: waveUniforms, worldOffsetY: treeLiftY };

      animate();
    };

    window.addEventListener('resize', onResize);
    void init().catch((error) => {
      console.error(error);
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      composer.dispose();
      leafGlowTexture.dispose();
      disposeSatelliteState(satelliteState);
      renderer.dispose();
      container.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} className="fixed inset-0 z-1" />;
}
