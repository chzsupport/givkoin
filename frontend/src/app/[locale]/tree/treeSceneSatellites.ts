import * as THREE from 'three';
import {
  SATELLITE_AURA_OUTER_SCALE,
  SATELLITE_BOB_AMP,
  SATELLITE_CONFIGS,
  SATELLITE_GLOW_SCALE,
  SATELLITE_LIGHT_BOOST,
  TREE_LIGHT_MULT,
  TREE_SCENE_SCALE,
  type SatelliteCfg,
} from './treeSceneConfig';
import { makeRadialTexture } from './treeSceneTexture';
import type { SatelliteState } from './treeSceneTypes';

export function createSatelliteState() {
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
      scaledCfg.light *
        TREE_LIGHT_MULT *
        SATELLITE_LIGHT_BOOST *
        SATELLITE_GLOW_SCALE *
        scaledCfg.treeLightScale,
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
    outerAura.scale.set(
      scaledCfg.size * SATELLITE_AURA_OUTER_SCALE,
      scaledCfg.size * SATELLITE_AURA_OUTER_SCALE,
      1
    );
    visualGroup.add(outerAura);

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

export function updateSatellites(timeSeconds: number, satelliteState: SatelliteState | null) {
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

export function disposeSatelliteState(satelliteState: SatelliteState | null) {
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
