'use client';

import { motion } from 'framer-motion';

interface BoostBannerProps {
  label: string;
  rewardText: string;
  onWatch: () => void;
  onDismiss: () => void;
  isReward?: boolean;
}

export function BoostBanner({ label, rewardText, onWatch, onDismiss, isReward }: BoostBannerProps) {
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      className="fixed bottom-0 left-0 right-0 z-[10002] flex justify-center px-4 pb-4 pointer-events-none"
    >
      <div
        className={`pointer-events-auto w-full max-w-lg rounded-2xl border backdrop-blur-xl shadow-2xl px-5 py-4 flex items-center gap-4 ${
          isReward
            ? 'bg-emerald-950/70 border-emerald-500/30'
            : 'bg-black/80 border-white/15'
        }`}
      >
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-bold ${isReward ? 'text-emerald-200' : 'text-white'}`}>
            {isReward ? '✅' : '🎬'} {label}
          </div>
          {rewardText && (
            <div className="text-xs mt-0.5 text-white/50">{rewardText}</div>
          )}
        </div>

        {!isReward && (
          <button
            type="button"
            onClick={onWatch}
            className="shrink-0 rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/30 active:scale-95"
          >
            Смотреть
          </button>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5 transition"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
