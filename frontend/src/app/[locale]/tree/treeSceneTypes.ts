import * as THREE from 'three';
import type { SatelliteCfg } from './treeSceneConfig';

export type TreeSceneProps = {
  isTabVisible: boolean;
};

export type GroundGlowState = {
  group: THREE.Group;
  light: THREE.PointLight;
  ring: THREE.Mesh;
  ringMaterial: THREE.MeshBasicMaterial;
  core: THREE.Sprite;
  coreMaterial: THREE.SpriteMaterial;
};

export type WaveState = {
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

export type TreeState = {
  waveBottomY: number;
  waveTopY: number;
};

export type LeafState = {
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

export type SatelliteEntry = {
  cfg: SatelliteCfg;
  group: THREE.Group;
};

export type SatelliteState = {
  group: THREE.Group;
  entries: SatelliteEntry[];
  auraSoft: THREE.Texture;
};
