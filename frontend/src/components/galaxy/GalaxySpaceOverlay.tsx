'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { PageBackground } from '@/components/PageBackground';

type GalaxyOrb = {
  id: number;
  size: number;
  top: string;
  left: string;
  duration: number;
  delay: number;
  gradient: string;
};

export function GalaxySpaceOverlay() {
  const floatingOrbs = useMemo<GalaxyOrb[]>(
    () =>
      Array.from({ length: 10 }).map((_, idx) => ({
        id: idx,
        size: 80 + Math.random() * 120,
        top: `${5 + Math.random() * 70}%`,
        left: `${Math.random() * 100}%`,
        duration: 12 + Math.random() * 10,
        delay: Math.random() * 4,
        gradient:
          idx % 2 === 0
            ? 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.45), rgba(59, 130, 246, 0.05))'
            : 'radial-gradient(circle at 70% 70%, rgba(56, 189, 248, 0.35), rgba(168, 85, 247, 0.05))',
      })),
    [],
  );

  return (
    <>
      <PageBackground />

      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-10 -left-10 w-[32rem] h-[32rem] bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-transparent blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-0 right-[-6rem] w-[36rem] h-[36rem] bg-gradient-to-br from-indigo-500/20 via-cyan-400/15 to-transparent blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-30">
          {floatingOrbs.map((orb) => (
            <motion.div
              key={orb.id}
              className="absolute rounded-full"
              style={{ width: orb.size, height: orb.size, top: orb.top, left: orb.left, background: orb.gradient, filter: 'blur(14px)' }}
              animate={{ y: [-20, 30, -10], opacity: [0.2, 0.65, 0.35], rotate: [0, 6, -4, 0] }}
              transition={{ duration: orb.duration, repeat: Infinity, delay: orb.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
