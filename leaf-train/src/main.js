import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const container = document.getElementById('app');

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 5000);
camera.position.set(0, 240, 620);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.3;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

const SATELLITE_BOB_AMP = 6;
const TREE_LIGHT_MULT_PCT = 5;
const TREE_LIGHT_MULT = TREE_LIGHT_MULT_PCT / 100;

const sats = [
  { color: '#ffd200', emissive: '#ff7a00', emissiveIntensity: 3.6, y: 377, size: 18, light: 30, lightDistance: 0, lightDecay: 0, r: 209, speed: 0.55, dir: 1 },
  { color: '#f3f7ff', emissive: '#f3f7ff', emissiveIntensity: 3.6, y: 208, size: 16, light: 30, lightDistance: 0, lightDecay: 0, r: 248, speed: 0.35, dir: -1 },
  { color: '#1a7bff', emissive: '#0066ff', emissiveIntensity: 3.6, y: 72, size: 16, light: 30, lightDistance: 0, lightDecay: 0, r: 292, speed: 0.7, dir: 1 },
];

function makeRadialTexture(opts) {
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

const auraSoft = makeRadialTexture({
  inner: 6,
  outer: 120,
  stops: [
    [0, 0.9],
    [0.22, 0.55],
    [0.55, 0.18],
    [1, 0],
  ],
});

const satObjects = [];
for (const cfg of sats) {
  const group = new THREE.Group();

  const light = new THREE.PointLight(cfg.color, cfg.light * TREE_LIGHT_MULT, cfg.lightDistance, cfg.lightDecay);
  group.add(light);

  const s1 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: auraSoft,
      color: cfg.color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.34,
    })
  );
  s1.scale.setScalar(cfg.size * 13.5);
  group.add(s1);

  const s2 = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: auraSoft,
      color: cfg.color,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.22,
    })
  );
  s2.scale.setScalar(cfg.size * 6.0);
  group.add(s2);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(cfg.size, 128, 128),
    new THREE.MeshStandardMaterial({
      color: cfg.color,
      emissive: cfg.emissive,
      emissiveIntensity: cfg.emissiveIntensity,
      roughness: 0.25,
      metalness: 0.1,
    })
  );
  group.add(mesh);

  scene.add(group);
  satObjects.push({ cfg, group });
}

let modelRoot = null;
const loader = new GLTFLoader();

const draco = new DRACOLoader();
draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
loader.setDRACOLoader(draco);

const statusEl = document.createElement('div');
statusEl.style.cssText = 'position:fixed; left:12px; bottom:12px; color:#fff; font-family:Arial,sans-serif; font-size:14px; opacity:0.85; pointer-events:none;';
statusEl.textContent = 'Загрузка дерева...';
document.body.appendChild(statusEl);

loader.load('/tree.glb', (gltf) => {
  const root = gltf.scene;

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

  const boxAfter = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(boxAfter.min.y)) {
    root.position.y -= boxAfter.min.y;
  }

  scene.add(root);
  modelRoot = root;
  statusEl.textContent = 'Дерево загружено.';
}, undefined, (err) => {
  statusEl.textContent = 'ОШИБКА: дерево не загрузилось. Проверь tree.glb.';
  console.error(err);
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let placeMode = false;

const ghostGeo = new THREE.SphereGeometry(1, 16, 16);
const ghostMat = new THREE.MeshStandardMaterial({ color: '#00ff44', emissive: '#00ff44', emissiveIntensity: 10 });
const ghost = new THREE.Mesh(ghostGeo, ghostMat);
ghost.visible = false;
ghost.scale.setScalar(1.6);
scene.add(ghost);

function setMouseFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
}

function findHitPoint() {
  if (!modelRoot) return null;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(modelRoot, true);
  if (!hits.length) return null;
  return hits[0].point;
}

async function logPoint(p) {
  try {
    await fetch('http://localhost:5174/point', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ x: p.x, y: p.y, z: p.z }),
    });
  } catch {
    // игнор
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === '1') {
    placeMode = !placeMode;
    ghost.visible = placeMode;
  }
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!placeMode) return;
  setMouseFromEvent(e);
  const p = findHitPoint();
  if (!p) return;
  ghost.position.copy(p);
});

renderer.domElement.addEventListener('pointerdown', async (e) => {
  if (!placeMode) return;
  if (e.button !== 0) return;
  setMouseFromEvent(e);
  const p = findHitPoint();
  if (!p) return;

  const fixed = ghost.clone();
  fixed.visible = true;
  scene.add(fixed);
  await logPoint(p);
});

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function animate(tMs) {
  requestAnimationFrame(animate);

  const t = tMs / 1000;
  for (const item of satObjects) {
    const a = t * item.cfg.speed * item.cfg.dir;
    const x = Math.cos(a) * item.cfg.r;
    const z = Math.sin(a) * item.cfg.r;
    const y = item.cfg.y + Math.sin(t * 1.1 + item.cfg.speed) * SATELLITE_BOB_AMP;
    item.group.position.set(x, y, z);
  }

  controls.update();
  renderer.render(scene, camera);
}
animate(0);
