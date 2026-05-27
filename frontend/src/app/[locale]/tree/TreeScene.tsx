'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  BASE_TREE_TARGET_SIZE,
  COORDINATE_PATH,
  TREE_PATH,
  TREE_SCENE_LIFT_RATIO,
  TREE_SCENE_SCALE,
} from './treeSceneConfig';
import {
  getEnergyPhase,
} from './treeSceneMath';
import {
  getPointBounds,
  parseLeafPoints,
  scaleLeafPoints,
} from './treeSceneLeafPoints';
import { makeRadialTexture } from './treeSceneTexture';
import {
  createGroundGlow,
  updateGroundGlow,
} from './treeSceneGroundGlow';
import {
  createSatelliteState,
  disposeSatelliteState,
  updateSatellites,
} from './treeSceneSatellites';
import { createSilhouetteMaterial } from './treeSceneSilhouette';
import {
  createLeafSystem,
  updateLeaves,
} from './treeSceneLeaves';
import type {
  GroundGlowState,
  LeafState,
  SatelliteState,
  TreeSceneProps,
  TreeState,
  WaveState,
} from './treeSceneTypes';

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

  return new Promise<THREE.Group>((resolve, reject) => {
    loader.load(
      TREE_PATH,
      (gltf) => {
        resolve(gltf.scene.clone(true));
      },
      undefined,
      (error) => {
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 1.26;
    renderer.domElement.style.background = 'transparent';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 210, 0);
    controls.enablePan = false;
    controls.screenSpacePanning = false;
    controls.enableZoom = true;
    controls.enableRotate = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: null,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    controls.update();
    const lockedPolarAngle = controls.getPolarAngle();
    controls.minPolarAngle = lockedPolarAngle;
    controls.maxPolarAngle = lockedPolarAngle;

    scene.add(new THREE.HemisphereLight('#8cc8ff', '#09050e', 0));
    const fillLight = new THREE.DirectionalLight('#bfe9ff', 0);
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
      renderer.render(scene, camera);
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
      leafGlowTexture.dispose();
      disposeSatelliteState(satelliteState);
      renderer.dispose();
      container.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} className="fixed inset-0 z-1" />;
}
