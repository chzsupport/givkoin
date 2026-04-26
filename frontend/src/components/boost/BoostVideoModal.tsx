'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface BoostVideoModalProps {
  onComplete: () => void;
  onClose: () => void;
}

const VIDEO_DURATION_SECONDS = 30;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function BoostVideoModal({ onComplete, onClose }: BoostVideoModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(VIDEO_DURATION_SECONDS);
  const [canClose, setCanClose] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setCanClose(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleClose = useCallback(() => {
    if (!canClose) return;
    onComplete();
  }, [canClose, onComplete]);

  // TODO: Replace placeholder with real Dao.ad VAST video player integration
  // The VAST player will fire an event when video ends, which should call onComplete

  return (
    <div className="fixed inset-0 z-[10003] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full h-full flex flex-col items-center justify-center">
        {/* Video area — placeholder until Dao.ad VAST integration */}
        <div className="w-full max-w-2xl aspect-video bg-neutral-900 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden">
          <div className="text-center px-6">
            <div className="text-6xl mb-4">🎬</div>
            <div className="text-white/60 text-lg font-medium">Ad video</div>
            <div className="text-white/30 text-sm mt-2">Dao.ad VAST integration placeholder</div>
          </div>
        </div>

        {/* Timer bar */}
        <div className="w-full max-w-2xl mt-4 px-4">
          <div className="relative h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-emerald-500/70 rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${((VIDEO_DURATION_SECONDS - secondsLeft) / VIDEO_DURATION_SECONDS) * 100}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-white/40">
            <span>{secondsLeft > 0 ? `${secondsLeft} sec` : 'Completed'}</span>
            <span>{VIDEO_DURATION_SECONDS} sec</span>
          </div>
        </div>

        {/* Close button — only visible when video ended */}
        {canClose && (
          <button
            type="button"
            onClick={handleClose}
            className="mt-6 rounded-2xl border border-emerald-400/30 bg-emerald-500/20 px-8 py-3 text-base font-semibold text-emerald-200 transition hover:bg-emerald-500/30 active:scale-95"
          >
            Claim reward ✅
          </button>
        )}

        {/* Fake close button while video is playing — disabled */}
        {!canClose && (
          <button
            type="button"
            disabled
            className="mt-6 rounded-2xl border border-white/5 bg-white/5 px-8 py-3 text-base font-medium text-white/20 cursor-not-allowed"
          >
            Please wait...
          </button>
        )}
      </div>
    </div>
  );
}
