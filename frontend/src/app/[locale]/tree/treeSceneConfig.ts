import * as THREE from 'three';

export type SatelliteCfg = {
  color: string;
  emissive: string;
  emissiveIntensity: number;
  y: number;
  size: number;
  light: number;
  treeLightScale: number;
  lightDistance: number;
  lightDecay: number;
  radius: number;
  speed: number;
  dir: 1 | -1;
  phase: number;
};

export const TREE_PATH = '/tree.glb';
export const COORDINATE_PATH = '/tree-data/coordinate.txt';
export const BASE_TREE_TARGET_SIZE = 420;
export const TREE_SCENE_SCALE = 0.8;
export const TREE_SCENE_LIFT_RATIO = 0.05;

export const ENERGY_CYCLE = 15;
export const ENERGY_CHARGE_DURATION = 2.8;
export const ENERGY_FLOW_DURATION = 4.8;
export const ENERGY_PULSE_COUNT = 3;
export const ENERGY_PULSE_PERIOD = 0.816;
export const ENERGY_PULSE_WIDTH = 0.528;
export const ENERGY_FLOW_END = ENERGY_CHARGE_DURATION + ENERGY_FLOW_DURATION;
export const LEAF_WAVE_TOP_ZONE = 0.16;

export const LEAF_WAVE_GOLD = new THREE.Color('#ffd76b');
export const LEAF_SPARK_WHITE = new THREE.Color('#ffffff');
export const LEAF_BRIGHTNESS_SCALE = 0.14112;
export const LEAF_PULSE_WHITE_SCALE = 0.5;
export const LEAF_PULSE_POWER_SCALE = 0.5;
export const LEAF_CORE_BRIGHTNESS_BOOST = 1.872;
export const LEAF_CORE_CONTRAST = 1.788;
export const LEAF_AURA_BRIGHTNESS_SCALE = 0.34;
export const LEAF_RAINBOW_HALF_CYCLE = 2;
export const LEAF_BREATH_AMPLITUDE = 1;

export const SATELLITE_SIZE = 8;
export const SATELLITE_SMALL_SIZE = SATELLITE_SIZE;
export const SATELLITE_MID_SIZE = SATELLITE_SIZE;
export const SATELLITE_TOP_Y = 377;
export const SATELLITE_BOTTOM_Y = 72;
export const SATELLITE_VERTICAL_STEP = (SATELLITE_TOP_Y - SATELLITE_BOTTOM_Y) / 4;
export const SATELLITE_MIRROR_PHASE_SHIFT = Math.PI;
export const SATELLITE_BOB_AMP = 6 * TREE_SCENE_SCALE;
export const SATELLITE_AURA_OUTER_SCALE = 3.0;
export const TREE_LIGHT_MULT_PCT = 18;
export const TREE_LIGHT_MULT = TREE_LIGHT_MULT_PCT / 100;
export const SATELLITE_LIGHT_BOOST = 0.9;
export const SATELLITE_GLOW_SCALE = 0.3;

export const SATELLITE_CONFIGS: SatelliteCfg[] = [
  {
    color: '#ffc95c',
    emissive: '#ff5d1f',
    emissiveIntensity: 3.2,
    y: SATELLITE_TOP_Y,
    size: SATELLITE_SMALL_SIZE,
    light: 26,
    treeLightScale: 300,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 210,
    speed: 0.55,
    dir: 1,
    phase: 0,
  },
  {
    color: '#9fffb7',
    emissive: '#2edd72',
    emissiveIntensity: 3.2,
    y: SATELLITE_TOP_Y - SATELLITE_VERTICAL_STEP,
    size: SATELLITE_MID_SIZE,
    light: 26,
    treeLightScale: 400,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 225,
    speed: 0.42,
    dir: -1,
    phase: (Math.PI * 2) / 5,
  },
  {
    color: '#78a8ff',
    emissive: '#2d63ff',
    emissiveIntensity: 3.2,
    y: SATELLITE_TOP_Y - SATELLITE_VERTICAL_STEP * 2,
    size: SATELLITE_SIZE,
    light: 26,
    treeLightScale: 600,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 240,
    speed: 0.35,
    dir: 1,
    phase: (Math.PI * 4) / 5,
  },
  {
    color: '#d1a0ff',
    emissive: '#8b4dff',
    emissiveIntensity: 3.2,
    y: SATELLITE_TOP_Y - SATELLITE_VERTICAL_STEP * 3,
    size: SATELLITE_MID_SIZE,
    light: 26,
    treeLightScale: 900,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 262.5,
    speed: 0.62,
    dir: -1,
    phase: (Math.PI * 6) / 5,
  },
  {
    color: '#f7fbff',
    emissive: '#ffffff',
    emissiveIntensity: 3.2,
    y: SATELLITE_BOTTOM_Y,
    size: SATELLITE_SMALL_SIZE,
    light: 26,
    treeLightScale: 1500,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 285,
    speed: 0.7,
    dir: 1,
    phase: (Math.PI * 8) / 5,
  },
  {
    color: '#d1a0ff',
    emissive: '#8b4dff',
    emissiveIntensity: 3.2,
    y: SATELLITE_TOP_Y - SATELLITE_VERTICAL_STEP * 3,
    size: SATELLITE_MID_SIZE,
    light: 26,
    treeLightScale: 900,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 262.5,
    speed: 0.62,
    dir: -1,
    phase: (Math.PI * 6) / 5 + SATELLITE_MIRROR_PHASE_SHIFT,
  },
  {
    color: '#f7fbff',
    emissive: '#ffffff',
    emissiveIntensity: 3.2,
    y: SATELLITE_BOTTOM_Y,
    size: SATELLITE_SMALL_SIZE,
    light: 26,
    treeLightScale: 1500,
    lightDistance: 420,
    lightDecay: 1.3,
    radius: 285,
    speed: 0.7,
    dir: 1,
    phase: (Math.PI * 8) / 5 + SATELLITE_MIRROR_PHASE_SHIFT,
  },
];
