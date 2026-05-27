import * as THREE from 'three';

export function makeRadialTexture(inner: number, outer: number, stops: Array<[number, number]>) {
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
