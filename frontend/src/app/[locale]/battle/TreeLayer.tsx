'use client';

import Image from 'next/image';
import { useMemo } from 'react';
import { getBattleDomeDiameterPx, type BattleSceneLayout } from './battleLayout';

const BATTLE_TREE_SRC = '/battle-tree.png';
const BATTLE_TREE_ASPECT_RATIO = 512 / 545;
const BASE_TREE_HEIGHT_FIT = 0.9;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export type TreeLayerProps = {
  transparent?: boolean;
  scale?: [number, number, number];
  position?: [number, number, number];
  pointerEvents?: 'none' | 'auto';
  className?: string;
  rotate?: boolean;
  performanceTier?: 'low' | 'medium' | 'high';
  layout?: BattleSceneLayout;
};

export function TreeLayer({
  transparent = true,
  scale = [0.66, 0.66, 0.66],
  position = [0, -132.3, -100],
  pointerEvents = 'none',
  className = '',
  rotate = false,
  performanceTier = 'high',
  layout,
}: TreeLayerProps) {
  void transparent;
  void rotate;

  const style = useMemo(() => {
    const averageScale = (Number(scale[0]) + Number(scale[1]) + Number(scale[2])) / 3 || 0.66;
    const layoutScale = layout?.viewport.scale ?? 1;
    const domeDiameterPx = layout
      ? getBattleDomeDiameterPx(layout.viewport, layout.dome.radius, layout.dome.visualScale)
      : 520 * layoutScale;
    const tierFit =
      performanceTier === 'low'
        ? 0.94
        : performanceTier === 'medium'
          ? 0.97
          : 1;
    const scaleFit = clamp(averageScale / 0.66, 0.84, 1.08);
    const treeHeightPx = domeDiameterPx * BASE_TREE_HEIGHT_FIT * tierFit * scaleFit;
    const treeWidthPx = treeHeightPx * BATTLE_TREE_ASPECT_RATIO;
    const offsetX = (Number(position[0]) || 0) * layoutScale * 0.08;
    const offsetY = ((Number(position[1]) || -132.3) + 132.3) * layoutScale * 0.08;

    return {
      left: layout ? `${layout.dome.center.x * 100}%` : '50%',
      top: layout ? `${layout.dome.center.y * 100}%` : '57%',
      width: `${treeWidthPx}px`,
      height: `${treeHeightPx}px`,
      transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
    };
  }, [layout, performanceTier, position, scale]);

  return (
    <div className={`absolute inset-0 ${className}`} style={{ pointerEvents }}>
      <div className="absolute" style={style}>
        <Image
          src={BATTLE_TREE_SRC}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-contain select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}

export function TreeSceneStandalone() {
  return (
    <div className="relative h-screen w-full bg-[#020202]">
      <TreeLayer transparent={false} pointerEvents="auto" />
    </div>
  );
}
