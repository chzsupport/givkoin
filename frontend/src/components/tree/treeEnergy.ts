import * as THREE from 'three';

export const LEAF_WAVE_GOLD = new THREE.Color('#ffd76b');
export const LEAF_SPARK_WHITE = new THREE.Color('#ffffff');

const ENERGY_CYCLE = 15;
export const ENERGY_CHARGE_DURATION = 2.8;
const ENERGY_FLOW_DURATION = 4.8;
const ENERGY_PULSE_COUNT = 3;
const ENERGY_PULSE_PERIOD = 0.816;
const ENERGY_PULSE_WIDTH = 0.528;
const ENERGY_FLOW_END = ENERGY_CHARGE_DURATION + ENERGY_FLOW_DURATION;

export const LEAF_BRIGHTNESS_SCALE = 0.14112;
export const LEAF_PULSE_WHITE_SCALE = 0.5;
export const LEAF_PULSE_POWER_SCALE = 0.5;
export const LEAF_CORE_BRIGHTNESS_BOOST = 1.872;
export const LEAF_CORE_CONTRAST = 1.788;
export const LEAF_AURA_BRIGHTNESS_SCALE = 0.34;
export const LEAF_RAINBOW_HALF_CYCLE = 2;
export const LEAF_BREATH_AMPLITUDE = 1;
export const LEAF_WAVE_TOP_ZONE = 0.16;

export function hslToRgb(h: number, s: number, l: number): THREE.Color {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return new THREE.Color(r + m, g + m, b + m);
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function smooth01(value: number) {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

export function hash01(value: number) {
  const s = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function applyColorContrast(color: THREE.Color, contrast: number) {
  color.r = clamp01((color.r - 0.5) * contrast + 0.5);
  color.g = clamp01((color.g - 0.5) * contrast + 0.5);
  color.b = clamp01((color.b - 0.5) * contrast + 0.5);
  return color;
}

export function getEnergyPhase(timeSeconds: number) {
  const cycleT = ((timeSeconds % ENERGY_CYCLE) + ENERGY_CYCLE) % ENERGY_CYCLE;
  const charge = cycleT < ENERGY_CHARGE_DURATION
    ? smooth01(cycleT / ENERGY_CHARGE_DURATION)
    : Math.max(0, 1 - smooth01((cycleT - ENERGY_CHARGE_DURATION) / 0.7)) * 0.45;
  const flow = clamp01((cycleT - ENERGY_CHARGE_DURATION) / ENERGY_FLOW_DURATION);
  const flowActive = cycleT >= ENERGY_CHARGE_DURATION - 0.15
    && cycleT <= ENERGY_FLOW_END;

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
