import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const container = document.getElementById('app');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 240, 620);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.26;
container.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.2, 0.72, 0.05);
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

const statusEl = document.createElement('div');
statusEl.style.cssText = 'position:fixed;left:12px;bottom:12px;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;opacity:0.82;pointer-events:none;';
document.body.appendChild(statusEl);

const ENERGY_CYCLE = 15;
const ENERGY_CHARGE_DURATION = 2.8;
const ENERGY_FLOW_DURATION = 4.8;
const ENERGY_PULSE_COUNT = 3;
const ENERGY_PULSE_PERIOD = 0.816;
const ENERGY_PULSE_WIDTH = 0.528;
const ENERGY_FLOW_END = ENERGY_CHARGE_DURATION + ENERGY_FLOW_DURATION;
const LEAF_WAVE_TOP_ZONE = 0.16;

const GEM_LEAF_PALETTE = [
  new THREE.Color('#f6fbff'),
  new THREE.Color('#3ee6a8'),
  new THREE.Color('#ff4f6f'),
  new THREE.Color('#5f92ff'),
  new THREE.Color('#ffd15c'),
  new THREE.Color('#c98cff'),
];
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

const clock = new THREE.Clock();

let treeState = null;
let waveState = null;
let groundState = null;
let leafState = null;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smooth01(value) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function hash01(value) {
  const s = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function hslToRgb(h, s, l) {
  const color = new THREE.Color();
  color.setHSL((((h % 360) + 360) % 360) / 360, clamp01(s), clamp01(l));
  return color;
}

function applyColorContrast(color, contrast) {
  color.r = clamp01((color.r - 0.5) * contrast + 0.5);
  color.g = clamp01((color.g - 0.5) * contrast + 0.5);
  color.b = clamp01((color.b - 0.5) * contrast + 0.5);
  return color;
}

function sampleGemPalette(value) {
  const wrapped = ((value % 1) + 1) % 1;
  const scaled = wrapped * GEM_LEAF_PALETTE.length;
  const index = Math.floor(scaled) % GEM_LEAF_PALETTE.length;
  const nextIndex = (index + 1) % GEM_LEAF_PALETTE.length;
  const localT = smooth01(scaled - Math.floor(scaled));
  return GEM_LEAF_PALETTE[index].clone().lerp(GEM_LEAF_PALETTE[nextIndex], localT);
}

function makeRadialTexture({ inner, outer, stops }) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

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

function makeLeafPointTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  ctx.clearRect(0, 0, 256, 256);
  ctx.beginPath();
  ctx.arc(128, 128, 72, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(128, 128, 84, 0, Math.PI * 2);
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const leafGlowTexture = makeRadialTexture({
  inner: 0,
  outer: 128,
  stops: [
    [0, 1],
    [0.34, 0.82],
    [0.7, 0.22],
    [1, 0],
  ],
});

const leafPointTexture = makeLeafPointTexture();

function parseLeafPoints(text) {
  const points = [];
  const re = /\[leaf-point\]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(re);
    if (!match) continue;
    const x = Number(match[1]);
    const y = Number(match[2]);
    const z = Number(match[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

function getPointBounds(points) {
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

function getEnergyPhase(timeSeconds) {
  const cycleT = ((timeSeconds % ENERGY_CYCLE) + ENERGY_CYCLE) % ENERGY_CYCLE;
  const charge = cycleT < ENERGY_CHARGE_DURATION
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

function createGroundGlow() {
  const group = new THREE.Group();
  group.position.set(0, 52, 0);
  group.renderOrder = 4;

  const light = new THREE.PointLight('#74fff1', 4, 360, 1.5);
  light.position.set(0, 10, 0);
  group.add(light);

  const ringMaterial = new THREE.MeshBasicMaterial({
    map: leafGlowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.CircleGeometry(88, 96), ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
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

function createSilhouetteMaterial(uniforms) {
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

function createLeafSystem(points) {
  const count = points.length;
  const coreColors = new Float32Array(count * 3);
  const auraColors = new Float32Array(count * 3);
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = points[i].x;
    positions[i * 3 + 1] = points[i].y;
    positions[i * 3 + 2] = points[i].z;
  }

  const sphereGeometry = new THREE.SphereGeometry(1.25, 8, 8);
  const core = new THREE.InstancedMesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({
      toneMapped: false,
    }),
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
      size: 10.5,
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

function updateGroundGlow(timeSeconds) {
  if (!groundState) return;

  const phase = getEnergyPhase(timeSeconds);
  const glow = phase.cycleT < ENERGY_CHARGE_DURATION
    ? 0.18 + phase.charge * 1.25
    : 0.12 + Math.max(0, 1 - phase.flow) * 0.32;

  const size = 72 + glow * 60;
  groundState.core.scale.set(size, size, 1);

  const scale = 1 + glow * 0.2;
  groundState.ring.scale.set(scale, scale * 0.82, 1);
  groundState.ring.rotation.z = timeSeconds * 0.08;

  groundState.coreMaterial.opacity = Math.min(0.4, 0.09 + glow * 0.22);
  groundState.coreMaterial.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.55);

  groundState.ringMaterial.opacity = Math.min(0.22, 0.05 + glow * 0.1);
  groundState.ringMaterial.color.set('#74fff1').lerp(new THREE.Color('#ffd56c'), phase.charge * 0.42);

  groundState.light.intensity = 2.4 + glow * 10 + phase.leafPulse * 3.2;
  groundState.light.distance = 300 + glow * 180;
  groundState.light.color.set('#74fff1').lerp(new THREE.Color('#ffe08c'), phase.charge * 0.46);
}

function updateWave(timeSeconds) {
  if (!waveState || !treeState) return;

  const phase = getEnergyPhase(timeSeconds);
  waveState.uniforms.uTime.value = timeSeconds;
  waveState.uniforms.uBottomY.value = treeState.waveBottomY;
  waveState.uniforms.uTopY.value = treeState.waveTopY;
  waveState.uniforms.uCharge.value = phase.charge;
  waveState.uniforms.uWaveFrontY.value = THREE.MathUtils.lerp(treeState.waveBottomY, treeState.waveTopY, phase.flow);
  waveState.uniforms.uWaveActive.value = phase.flowActive ? 1 : 0;
  waveState.uniforms.uPulse.value = phase.leafPulse;
}

function updateLeaves(timeSeconds) {
  if (!leafState || !treeState) return;

  const phase = getEnergyPhase(timeSeconds);
  const { points, bounds, coreColors, auraColors, coreColorAttr, auraColorAttr } = leafState;
  const { minY, maxY } = bounds;
  const range = maxY - minY || 1;
  const waveRange = Math.max(1, treeState.waveTopY - treeState.waveBottomY);
  const waveFrontY = THREE.MathUtils.lerp(treeState.waveBottomY, treeState.waveTopY, phase.flow);
  const waveBand = Math.max(10, waveRange * 0.085);

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const py = point.y;
    const normY = (py - minY) / range;
    const tipWeight = smooth01((normY - (1 - LEAF_WAVE_TOP_ZONE)) / LEAF_WAVE_TOP_ZONE);
    const gemSeed = hash01(i * 17.13 + point.x * 0.051 + point.y * 0.023 + point.z * 0.041);
    const gemShift = hash01(i * 9.31 + point.x * 0.017 - point.z * 0.013 + normY * 5.7);
    const rainbowCycle = ((timeSeconds + gemShift * LEAF_RAINBOW_HALF_CYCLE * 2) / LEAF_RAINBOW_HALF_CYCLE) % 2;
    const rainbowPing = 1 - Math.abs(rainbowCycle - 1);
    const hue = THREE.MathUtils.lerp(0, 280, rainbowPing);
    const sat = 0.9 + gemSeed * 0.08;
    const light = 0.55 + gemShift * 0.14;
    let color = hslToRgb(hue, sat, light);

    const twinkle = 0.78 + 0.22 * Math.sin(timeSeconds * (1.7 + gemSeed * 0.8) + i * 0.61 + gemShift * 7.4);
    const breath = 1 + Math.sin(timeSeconds * Math.PI + gemShift * Math.PI * 2 + gemSeed * 4) * LEAF_BREATH_AMPLITUDE;
    const whiteSpark = Math.pow(clamp01(Math.sin(timeSeconds * (5.8 + gemSeed * 2.2) + i * 1.67 + gemShift * 10.2) * 0.5 + 0.5), 22) * (0.04 + gemSeed * 0.1);
    const diamondFlash = Math.pow(clamp01(Math.sin(timeSeconds * (3.1 + gemSeed * 1.3) + i * 0.27 + gemShift * 17) * 0.5 + 0.5), 28) * (0.06 + gemShift * 0.12);
    const flowTouch = phase.flowActive
      ? smooth01(1 - Math.abs(py - waveFrontY) / Math.max(14, waveBand * 1.22))
      : 0;
    const pulseTouch = phase.leafPulse;

    color = color.lerp(LEAF_SPARK_WHITE, whiteSpark * 0.18 + diamondFlash * 0.28);
    color = color.lerp(LEAF_WAVE_GOLD, flowTouch * (0.16 + tipWeight * 0.1));
    color = color.lerp(LEAF_SPARK_WHITE, pulseTouch * 0.985 * LEAF_PULSE_WHITE_SCALE + whiteSpark * 0.1 + diamondFlash * 0.14);
    applyColorContrast(color, LEAF_CORE_CONTRAST);

    const corePower = (1.15 + twinkle * 0.38 + whiteSpark * 0.42 + diamondFlash * 0.78 + flowTouch * 0.9 + pulseTouch * 5.4 * LEAF_PULSE_POWER_SCALE) * LEAF_BRIGHTNESS_SCALE * LEAF_CORE_BRIGHTNESS_BOOST * breath;
    const auraPower = (0.34 + twinkle * 0.14 + whiteSpark * 0.14 + diamondFlash * 0.22 + flowTouch * 0.52 + pulseTouch * 1.9 * LEAF_PULSE_POWER_SCALE) * LEAF_BRIGHTNESS_SCALE * LEAF_AURA_BRIGHTNESS_SCALE * (0.8 + (breath - 1) * 0.35);

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
  const response = await fetch('/coordinate.txt');
  const text = await response.text();
  const points = parseLeafPoints(text);
  if (!points.length) {
    throw new Error('Не удалось найти точки листвы в coordinate.txt');
  }
  return points;
}

async function loadTree() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');
  dracoLoader.setDecoderConfig({ type: 'js' });
  dracoLoader.preload();
  loader.setDRACOLoader(dracoLoader);

  return new Promise((resolve, reject) => {
    loader.load(
      '/tree.glb',
      (gltf) => {
        dracoLoader.dispose();
        resolve(gltf);
      },
      undefined,
      (error) => {
        dracoLoader.dispose();
        reject(error);
      }
    );
  });
}

function normalizeTree(root) {
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const targetSize = 420;
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

async function init() {
  statusEl.textContent = 'Загрузка дерева и точек...';

  const leafPoints = await loadLeafPoints();
  statusEl.textContent = 'Точки загружены, загружаю дерево...';
  const gltf = await loadTree();
  statusEl.textContent = 'Дерево загружено, собираю сцену...';

  const root = normalizeTree(gltf.scene.clone(true));
  treeRig.add(root);

  const finalBox = new THREE.Box3().setFromObject(root);
  const sceneBounds = {
    minY: Number.isFinite(finalBox.min.y) ? finalBox.min.y : 0,
    maxY: Number.isFinite(finalBox.max.y) ? finalBox.max.y : 1,
  };
  const leafBounds = getPointBounds(leafPoints);
  const waveBottomY = sceneBounds.minY;
  const waveTopY = Math.max(waveBottomY + 1, Math.min(sceneBounds.maxY, leafBounds.maxY));

  groundState = createGroundGlow();
  treeRig.add(groundState.group);

  const waveUniforms = {
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

  leafState = createLeafSystem(leafPoints);
  treeRig.add(leafState.group);

  treeState = { waveBottomY, waveTopY };
  waveState = { overlay, uniforms: waveUniforms };

  statusEl.textContent = 'Локальная сцена готова к проверке.';

  function animate() {
    requestAnimationFrame(animate);

    const timeSeconds = clock.getElapsedTime();
    treeRig.rotation.y = timeSeconds * 0.05;

    updateGroundGlow(timeSeconds);
    updateWave(timeSeconds);
    updateLeaves(timeSeconds);

    controls.update();
    composer.render();
  }

  animate();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);

init().catch((error) => {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
  statusEl.textContent = `Ошибка локальной сцены: ${message}`;
  console.error(error);
});
