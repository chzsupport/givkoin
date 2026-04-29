'use client';

import dynamic from 'next/dynamic';

const TreeLayer = dynamic(
  () => import('@/components/tree/TreeLayer').then((m) => m.TreeLayer),
  { ssr: false }
);

type TreeSceneProps = {
  isTabVisible: boolean;
};

export default function TreeScene({ isTabVisible }: TreeSceneProps) {
  void isTabVisible;

  return (
    <div className="fixed inset-0 z-1">
      <TreeLayer
        transparent
        scale={[1, 1, 1]}
        position={[0, 0, 0]}
        pointerEvents="auto"
      />
    </div>
  );
}
