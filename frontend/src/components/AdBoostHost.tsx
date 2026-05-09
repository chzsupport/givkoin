'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';

type AdBoostOffer = {
  id: string;
  type: string;
  title?: string;
  description?: string;
  page?: string;
  expiresAt?: string;
};

type ShopBoosts = {
  battleDamage?: { pending?: boolean; battleId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
  battleLumensDiscount?: { pending?: boolean; battleId?: string; activatedAt?: string; discountPercent?: number; adBoosted?: boolean };
  weakZoneDamage?: { pending?: boolean; battleId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
  chatK?: { pending?: boolean; chatId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
  solarExtraLmCharges?: number;
  solarExtraLmAmount?: number;
  solarFocusAdBoosted?: boolean;
  referralBlessingUntil?: string;
  referralBlessingPercent?: number;
  referralBlessingAdBoosted?: boolean;
  referralManualBoost?: {
    cycleKey?: string;
    watchedSteps?: number[];
    completed?: boolean;
    percent?: number;
    completedAt?: string | null;
    activeUntil?: string | null;
  };
  practiceTreeBlessingUntil?: string;
  practiceTreeBlessingPercent?: number;
  practiceTreeBlessingAdBoosted?: boolean;
};

type StartResponse = {
  sessionId: string;
  creativeId?: string;
};

type CompleteResponse = {
  ok: boolean;
  offerType?: string;
  title?: string;
  result?: {
    k?: number;
    lumens?: number;
    stars?: number;
    shopBoosts?: ShopBoosts;
    rouletteExtraSpins?: number;
    lotteryFreeTickets?: number;
    referralManualBoost?: {
      watchedSteps?: number[];
      completed?: boolean;
      active?: boolean;
      activeUntil?: string | null;
      percent?: number;
    };
  };
};

type DaoVideoInstance = {
  loadAd: (callback: () => void) => void;
  preroll: (options: { videoId: string }) => void;
};

type DaoVideoConstructor = new (config: { sourceId: number; tagUrl: string }) => DaoVideoInstance;

declare global {
  interface Window {
    DaoVideo?: DaoVideoConstructor;
    daoVideoPreRoll?: DaoVideoInstance;
  }
}

const DAO_PREROLL_VIDEO_ID = 'givkoin-ad-boost-video';
const DAO_PREROLL_CREATIVE_ID = 'dao_preroll_61874';
const DAO_PREROLL_SOURCE_ID = 61874;
const DAO_PREROLL_SCRIPT_SRC = 'https://video.agenteimmobiliare.info/d-video.js?b=32';
const DAO_PREROLL_TAG_URL = 'https://video.agenteimmobiliare.info/api/video/tag?sourceId=61874&tmax=500&video-skipafter=15&count=1';
const DAO_PREROLL_REWARD_DELAY_MS = 15_000;
const DAO_REWARD_NOTICE_MS = 1_400;
const TECHNICAL_VIDEO_SRC = '/bonus.mp4';

let daoVideoScriptPromise: Promise<void> | null = null;

function readDaoVideoConstructor() {
  if (typeof window === 'undefined') return undefined;
  if (window.DaoVideo) return window.DaoVideo;

  try {
    const candidate = Function('return typeof DaoVideo !== "undefined" ? DaoVideo : undefined;')() as DaoVideoConstructor | undefined;
    if (candidate) {
      window.DaoVideo = candidate;
      return candidate;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function loadDaoVideoScript() {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('dao_browser_unavailable'));
  }
  if (readDaoVideoConstructor()) {
    return Promise.resolve();
  }
  if (daoVideoScriptPromise) {
    return daoVideoScriptPromise;
  }

  daoVideoScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${DAO_PREROLL_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => {
        if (readDaoVideoConstructor()) {
          resolve();
        } else {
          reject(new Error('dao_player_missing'));
        }
      }, { once: true });
      existing.addEventListener('error', () => reject(new Error('dao_load_failed')), { once: true });
      if (readDaoVideoConstructor()) resolve();
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = DAO_PREROLL_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (readDaoVideoConstructor()) {
        resolve();
      } else {
        reject(new Error('dao_player_missing'));
      }
    };
    script.onerror = () => reject(new Error('dao_load_failed'));
    document.body.appendChild(script);
  });

  return daoVideoScriptPromise;
}

export function AdBoostHost() {
  const toast = useToast();
  const { t } = useI18n();
  const { user, updateUser } = useAuth();
  const [offer, setOffer] = useState<AdBoostOffer | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [creativeId, setCreativeId] = useState('');
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [daoPlayerActive, setDaoPlayerActive] = useState(false);
  const [daoStatus, setDaoStatus] = useState<'idle' | 'loading' | 'playing' | 'rewarding' | 'rewarded'>('idle');
  const [rewardNoticeVisible, setRewardNoticeVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const daoStartedRef = useRef(false);
  const dismissedOfferIdsRef = useRef<Set<string>>(new Set());
  const rewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (rewardTimerRef.current) {
      clearTimeout(rewardTimerRef.current);
      rewardTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const resetPlayerState = useCallback(() => {
    clearTimers();
    daoStartedRef.current = false;
    setDaoPlayerActive(false);
    setDaoStatus('idle');
    setRewardNoticeVisible(false);
  }, [clearTimers]);

  const showOffer = useCallback((detail: AdBoostOffer | null | undefined) => {
    if (!detail?.id || dismissedOfferIdsRef.current.has(detail.id)) return;
    const expiresAtMs = detail.expiresAt ? new Date(detail.expiresAt).getTime() : 0;
    if (expiresAtMs && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) return;
      resetPlayerState();
      setOffer(detail);
      setPanelOpen(false);
      setSessionId('');
      setCreativeId('');
  }, [resetPlayerState]);

  useEffect(() => {
    const handler = (event: Event) => {
      showOffer((event as CustomEvent<AdBoostOffer>).detail);
    };
    window.addEventListener('givkoin:ad-boost-offer', handler);
    return () => window.removeEventListener('givkoin:ad-boost-offer', handler);
  }, [showOffer]);

  useEffect(() => {
    if (!user?._id || offer?.id) return;
    let cancelled = false;
    apiGet<{ boostOffer?: AdBoostOffer | null }>('/ad-boosts/pending')
      .then((result) => {
        if (cancelled) return;
        showOffer(result?.boostOffer);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [offer?.id, showOffer, user?._id]);

  const close = useCallback(() => {
    if (offer?.id) {
      dismissedOfferIdsRef.current.add(offer.id);
    }
    resetPlayerState();
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setOffer(null);
    setPanelOpen(false);
    setSessionId('');
    setCreativeId('');
  }, [offer?.id, resetPlayerState]);

  useEffect(() => {
    if (!offer?.expiresAt) return undefined;
    const expiresAtMs = new Date(offer.expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs)) return undefined;
    const delayMs = expiresAtMs - Date.now();
    if (delayMs <= 0) {
      close();
      return undefined;
    }
    const timer = window.setTimeout(close, delayMs);
    return () => window.clearTimeout(timer);
  }, [close, offer?.expiresAt]);

  const getDaoErrorMessage = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (message === 'dao_browser_unavailable') return t('ads.boost_dao_browser_unavailable');
    if (message === 'dao_load_failed') return t('ads.boost_dao_load_failed');
    if (message === 'dao_player_missing') return t('ads.boost_dao_player_missing');
    return message || t('ads.boost_video_unavailable');
  }, [t]);

  const recordRewardedAdEvent = useCallback((eventType: 'vast_start' | 'vast_complete' | 'vast_error') => {
    const page = offer?.page || 'ad_boost';
    apiPost('/ads/impression', {
      page,
      placement: 'rewarded_vast',
      creativeId: creativeId || DAO_PREROLL_CREATIVE_ID,
      eventType,
    }).catch(() => {});
  }, [creativeId, offer?.page]);

  const completeReward = useCallback(async () => {
    if (!sessionId || completing) return;
    setCompleting(true);
    setDaoStatus('rewarding');
    try {
      recordRewardedAdEvent('vast_complete');
      const response = await apiPost<CompleteResponse>('/ad-boosts/complete', { sessionId });
      if (user && response?.result) {
        updateUser({
          ...user,
          ...(typeof response.result.k === 'number' ? { k: response.result.k } : {}),
          ...(typeof response.result.lumens === 'number' ? { lumens: response.result.lumens } : {}),
          ...(typeof response.result.stars === 'number' ? { stars: response.result.stars } : {}),
          ...(response.result.shopBoosts ? { shopBoosts: response.result.shopBoosts } : {}),
        });
      }
      window.dispatchEvent(new CustomEvent('givkoin:ad-boost-completed', { detail: response }));
      setRewardNoticeVisible(true);
      setDaoStatus('rewarded');
      closeTimerRef.current = setTimeout(close, DAO_REWARD_NOTICE_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ads.boost_complete_failed');
      toast.error(t('ads.boost_error'), message);
      setDaoStatus('playing');
    } finally {
      setCompleting(false);
    }
  }, [close, completing, recordRewardedAdEvent, sessionId, t, toast, updateUser, user]);

  const start = useCallback(async () => {
    if (!offer?.id) return;
    resetPlayerState();
    setLoading(true);
    setDaoStatus('loading');
    try {
      const response = await apiPost<StartResponse>('/ad-boosts/start', { offerId: offer.id });
      if (!response.sessionId) {
        throw new Error(t('ads.boost_video_missing'));
      }

      setSessionId(response.sessionId);
      setCreativeId(response.creativeId || DAO_PREROLL_CREATIVE_ID);
      setDaoPlayerActive(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ads.boost_video_unavailable');
      toast.error(t('ads.boost_unavailable'), message);
      close();
    } finally {
      setLoading(false);
    }
  }, [close, offer?.id, resetPlayerState, t, toast]);

  useEffect(() => {
    if (!daoPlayerActive || !sessionId || daoStartedRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    daoStartedRef.current = true;
    setDaoStatus('loading');

    loadDaoVideoScript()
      .then(() => {
        if (cancelled) return;
        const DaoVideo = readDaoVideoConstructor();
        if (!DaoVideo) {
          throw new Error('dao_player_missing');
        }
        const daoVideoPreRoll = new DaoVideo({
          sourceId: DAO_PREROLL_SOURCE_ID,
          tagUrl: DAO_PREROLL_TAG_URL,
        });
        window.daoVideoPreRoll = daoVideoPreRoll;
        daoVideoPreRoll.loadAd(() => {
          if (cancelled) return;
          daoVideoPreRoll.preroll({ videoId: DAO_PREROLL_VIDEO_ID });
          recordRewardedAdEvent('vast_start');
          setDaoStatus('playing');
          rewardTimerRef.current = setTimeout(() => {
            void completeReward();
          }, DAO_PREROLL_REWARD_DELAY_MS);
          video.play().catch(() => {});
        });
      })
      .catch((error) => {
        if (cancelled) return;
        recordRewardedAdEvent('vast_error');
        toast.error(t('ads.boost_video_failed'), getDaoErrorMessage(error));
        close();
      });

    return () => {
      cancelled = true;
    };
  }, [close, completeReward, daoPlayerActive, getDaoErrorMessage, recordRewardedAdEvent, sessionId, t, toast]);

  return (
    <>
      <AnimatePresence>
        {offer && !panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed inset-x-0 bottom-4 z-[10001] flex justify-center px-4"
          >
            <div className="flex w-full max-w-xl items-center gap-3 rounded-2xl border border-yellow-200/35 bg-slate-950/92 p-3 shadow-[0_0_34px_rgba(250,204,21,0.2)] backdrop-blur-md">
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                aria-label={offer.title || t('ads.boost_title')}
                className="min-w-0 flex-1 rounded-xl bg-gradient-to-r from-sky-500 via-rose-500 to-yellow-300 px-4 py-3 text-sm font-black uppercase tracking-widest text-slate-950 shadow-[0_0_24px_rgba(250,204,21,0.45)] transition hover:brightness-110 animate-pulse"
              >
                {t('ads.boost_button')}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-3 text-xs font-bold uppercase tracking-widest text-white/65 transition hover:bg-white/10 hover:text-white"
              >
                {t('common.close')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
      {offer && panelOpen && (
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
              <button type="button" onClick={close} className="relative rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white/70 transition hover:bg-white/10">
                {t('common.close')}
              </button>
            </div>

            {daoPlayerActive ? (
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-yellow-200/25 bg-black shadow-[0_0_30px_rgba(14,165,233,0.18)]">
                <video
                  id={DAO_PREROLL_VIDEO_ID}
                  ref={videoRef}
                  className="aspect-video w-full bg-black"
                  controls
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
            ) : (
              <button
                type="button"
                onClick={() => void start()}
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
      )}
    </AnimatePresence>
    </>
  );
}
