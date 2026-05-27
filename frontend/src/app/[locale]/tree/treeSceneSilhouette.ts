import * as THREE from 'three';
import type { WaveState } from './treeSceneTypes';

export function createSilhouetteMaterial(uniforms: WaveState['uniforms']) {
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
