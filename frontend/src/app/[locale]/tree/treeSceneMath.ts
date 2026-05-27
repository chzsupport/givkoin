import * as THREE from 'three';
import {
  ENERGY_CHARGE_DURATION,
  ENERGY_CYCLE,
  ENERGY_FLOW_DURATION,
  ENERGY_FLOW_END,
  ENERGY_PULSE_COUNT,
  ENERGY_PULSE_PERIOD,
  ENERGY_PULSE_WIDTH,
} from './treeSceneConfig';

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

export function hslToRgb(h: number, s: number, l: number) {
  const color = new THREE.Color();
  color.setHSL((((h % 360) + 360) % 360) / 360, clamp01(s), clamp01(l));
  return color;
}

export function applyColorContrast(color: THREE.Color, contrast: number) {
  color.r = clamp01((color.r - 0.5) * contrast + 0.5);
  color.g = clamp01((color.g - 0.5) * contrast + 0.5);
  color.b = clamp01((color.b - 0.5) * contrast + 0.5);
  return color;
}

export function getEnergyPhase(timeSeconds: number) {
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
