import { AnimatePresence, motion } from 'framer-motion';
import type { RadianceBurst } from './types';

export function TreeRadianceBursts({
  bursts,
  onBurstComplete,
}: {
  bursts: RadianceBurst[];
  onBurstComplete: (id: string) => void;
}) {
  return (
    <AnimatePresence>
      {bursts.map((b) => (
        <motion.div
          key={b.id}
          className="fixed z-[200] pointer-events-none rounded-full"
          initial={{ x: b.startX, y: b.startY, opacity: 0, scale: 0.7 }}
          animate={{
            x: [b.startX, b.midX, b.endX],
            y: [b.startY, b.midY, b.endY],
            opacity: [0, 1, 0],
            scale: [0.7, 1, 0.4],
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9, delay: b.delay, ease: [0.2, 0.8, 0.2, 1] }}
          onAnimationComplete={() => onBurstComplete(b.id)}
          style={{
            width: b.size,
            height: b.size,
            left: 0,
            top: 0,
            background:
              'radial-gradient(circle, rgba(16,185,129,0.95) 0%, rgba(16,185,129,0.35) 45%, rgba(16,185,129,0) 70%)',
            boxShadow: '0 0 20px rgba(16,185,129,0.55)',
            filter: 'blur(0.2px)',
          }}
        />
      ))}
    </AnimatePresence>
  );
}
