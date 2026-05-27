import { AnimatePresence, motion } from 'framer-motion';
import { DAO_PREROLL_VIDEO_ID, TECHNICAL_VIDEO_SRC } from './constants';
import type { AdBoostStatus, AdBoostTranslate } from './types';

type AdBoostVideoFrameProps = {
  daoStatus: AdBoostStatus;
  rewardNoticeVisible: boolean;
  technicalVideoVisible: boolean;
  t: AdBoostTranslate;
  videoRef: React.RefObject<HTMLVideoElement>;
};

export function AdBoostVideoFrame({
  daoStatus,
  rewardNoticeVisible,
  technicalVideoVisible,
  t,
  videoRef,
}: AdBoostVideoFrameProps) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-yellow-200/25 bg-black shadow-[0_0_30px_rgba(14,165,233,0.18)]">
      <video
        id={DAO_PREROLL_VIDEO_ID}
        ref={videoRef}
        className={`aspect-video w-full bg-black transition-opacity duration-300 ${technicalVideoVisible ? 'opacity-100' : 'opacity-0'}`}
        controls={technicalVideoVisible}
        playsInline
        preload="metadata"
      >
        <source src={TECHNICAL_VIDEO_SRC} type="video/mp4" />
      </video>

      {daoStatus === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white/80">
          {t('ads.boost_loading_video')}
        </div>
      )}

      <AnimatePresence>
        {rewardNoticeVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
          >
            <div className="rounded-2xl border border-yellow-200/50 bg-slate-950/92 px-7 py-5 text-center text-lg font-black text-white shadow-[0_0_36px_rgba(250,204,21,0.28)]">
              {t('ads.boost_reward_notice')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
