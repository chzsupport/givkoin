import type { CSSProperties } from 'react';
import { motion } from 'framer-motion';
import type { FlyingText } from './types';

const MotionDivAny = motion.div as unknown as (props: Record<string, unknown>) => JSX.Element;
const MotionSpanAny = motion.span as unknown as (props: Record<string, unknown>) => JSX.Element;

export function EvilRootFlyingTextLayer({
  flyingTexts,
  onRemoveText,
}: {
  flyingTexts: FlyingText[];
  onRemoveText: (id: number) => void;
}) {
  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {flyingTexts.map((item) => {
        const chars = Array.from(item.text);
        const centerX = 50;
        const centerY = 50;
        const startX = item.startXPercent;
        const startY = item.startYPercent;
        const vectorX = centerX - startX;
        const vectorY = centerY - startY;
        const containerDuration = Math.min(28.0, Math.max(18.0, (item.duration || 11.0) * 2));

        return (
          <MotionDivAny
            key={item.id}
            initial={{
              x: `${startX}vw`,
              y: `${startY}vh`,
              opacity: 1,
              scale: 1,
              translateX: '-50%',
              translateY: '-50%',
              filter: 'blur(0px)',
            } as CSSProperties}
            animate={{
              x: '50vw',
              y: '50vh',
              opacity: 0.04,
              scale: 0.18,
              filter: 'blur(8px)',
            }}
            transition={{
              duration: containerDuration,
              ease: [0.16, 0.72, 0.35, 1],
            }}
            className="absolute text-body text-neutral-200/90 whitespace-pre-wrap text-center will-change-transform will-change-opacity"
            onAnimationComplete={() => onRemoveText(item.id)}
          >
            <div className="inline-flex flex-wrap justify-center gap-[0.5px]">
              {chars.map((ch, index) => {
                const len = Math.max(chars.length, 1);
                const progress = index / len;
                const deviationStrength = 0.18;
                const randX = (Math.random() - 0.5) * deviationStrength;
                const randY = (Math.random() - 0.5) * deviationStrength;
                const targetX = vectorX * (0.9 + progress * 0.2) + randX * 100;
                const targetY = vectorY * (0.9 + progress * 0.2) + randY * 100;
                const letterDuration = 6.0 + Math.random() * 6.0;
                const baseDelay = 0.5;
                const delayByIndex = baseDelay * progress;
                const randomJitter = Math.random() * 1.2;
                const letterDelay = delayByIndex + randomJitter;
                const maxLetterEnd = letterDelay + letterDuration;
                const adjustedDuration =
                  maxLetterEnd > containerDuration
                    ? Math.max(0.6, containerDuration - letterDelay)
                    : letterDuration;
                const blurAmount = 2 + Math.random() * 3;

                return (
                  <MotionSpanAny
                    key={`${item.id}-${index}`}
                    initial={{
                      opacity: 1,
                      x: 0,
                      y: 0,
                      filter: 'blur(0px)',
                    }}
                    animate={{
                      opacity: 0,
                      x: `${targetX}vw`,
                      y: `${targetY}vh`,
                      filter: `blur(${blurAmount}px)`,
                    }}
                    transition={{
                      duration: adjustedDuration,
                      delay: letterDelay,
                      ease: [0.22, 0.66, 0.4, 1],
                    }}
                    className="inline-block"
                  >
                    {ch === ' ' ? '\u00A0' : ch}
                  </MotionSpanAny>
                );
              })}
            </div>
          </MotionDivAny>
        );
      })}
    </div>
  );
}
