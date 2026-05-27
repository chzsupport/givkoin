import type { RadianceBurst } from './types';

export function createRadianceBursts(lumens: number, viewportWidth: number, viewportHeight: number): RadianceBurst[] {
  const startX = viewportWidth / 2;
  const startY = viewportHeight / 2;
  const endX = viewportWidth / 2;
  const endY = Math.max(120, viewportHeight * 0.38);
  const count = Math.max(6, Math.min(18, Math.round(Math.sqrt(Math.max(1, lumens)) * 2)));
  const timestamp = Date.now();

  return Array.from({ length: count }, (_, i) => {
    const id = `${timestamp}_${i}_${Math.random().toString(16).slice(2)}`;
    const jitterX = (Math.random() - 0.5) * 140;
    const jitterY = (Math.random() - 0.5) * 140;
    const midX = startX + jitterX * 0.6;
    const midY = startY - 160 + jitterY * 0.2;

    return {
      id,
      startX: startX + jitterX,
      startY: startY + jitterY,
      midX,
      midY,
      endX: endX + (Math.random() - 0.5) * 40,
      endY: endY + (Math.random() - 0.5) * 30,
      size: 6 + Math.random() * 10,
      delay: i * 0.02 + Math.random() * 0.06,
    };
  });
}
