import { motion } from 'framer-motion';
import { AdBoostVideoFrame } from './AdBoostVideoFrame';
import type { AdBoostOffer, AdBoostStatus, AdBoostTranslate } from './types';

type AdBoostPanelProps = {
  completing: boolean;
  daoPlayerActive: boolean;
  daoStatus: AdBoostStatus;
  loading: boolean;
  offer: AdBoostOffer;
  rewardNoticeVisible: boolean;
  technicalVideoVisible: boolean;
  t: AdBoostTranslate;
  videoRef: React.RefObject<HTMLVideoElement>;
  onClose: () => void;
  onStart: () => void;
};

export function AdBoostPanel({
  completing,
  daoPlayerActive,
  daoStatus,
  loading,
  offer,
  rewardNoticeVisible,
  technicalVideoVisible,
  t,
  videoRef,
  onClose,
  onStart,
}: AdBoostPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.96, y: 12, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.96, y: 12, opacity: 0 }}
        className="relative w-full max-w-xl overflow-hidden rounded-[2rem] border border-sky-300/35 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.38),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(239,68,68,0.3),transparent_34%),linear-gradient(135deg,#071226,#150812_55%,#1f1604)] p-5 shadow-[0_0_65px_rgba(250,204,21,0.24)]"
      >
        <div className="pointer-events-none absolute -left-16 -top-16 h-36 w-36 rounded-full bg-sky-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-8 h-32 w-32 rounded-full bg-rose-500/30 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-yellow-200/80 to-transparent" />
        <div className="flex items-start justify-between gap-4">
          <div className="relative">
            <div className="inline-flex rounded-full border border-yellow-200/35 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-yellow-100">
              {t('ads.boost_title')}
            </div>
            <div className="mt-3 text-2xl font-black text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.24)]">{offer.title || t('ads.boost_title')}</div>
            <div className="mt-2 max-w-md text-sm leading-relaxed text-white/78">{offer.description || t('ads.boost_description')}</div>
          </div>
          <button type="button" onClick={onClose} className="relative rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white/70 transition hover:bg-white/10">
            {t('common.close')}
          </button>
        </div>

        {daoPlayerActive ? (
          <AdBoostVideoFrame
            daoStatus={daoStatus}
            rewardNoticeVisible={rewardNoticeVisible}
            technicalVideoVisible={technicalVideoVisible}
            t={t}
            videoRef={videoRef}
          />
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={loading}
            className="relative mt-5 w-full rounded-2xl border border-yellow-200/55 bg-gradient-to-r from-sky-500 via-rose-500 to-yellow-300 px-5 py-4 text-sm font-black uppercase tracking-widest text-slate-950 shadow-[0_0_34px_rgba(250,204,21,0.3)] transition hover:brightness-110 disabled:opacity-60"
          >
            {loading ? t('ads.boost_loading_video') : t('ads.boost_watch_video')}
          </button>
        )}

        {daoPlayerActive && (
          <div className="relative mt-3 text-center text-xs font-semibold text-yellow-100/78">
            {completing || daoStatus === 'rewarding' ? t('ads.boost_loading_video') : t('ads.boost_reward_after_ad')}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
