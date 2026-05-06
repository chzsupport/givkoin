'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { apiPost } from '@/utils/api';
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

type VastTracking = Partial<Record<'impression' | 'start' | 'complete' | 'error', string[]>>;

type StartResponse = {
  sessionId: string;
  creativeId?: string;
  vast?: {
    vastUrl?: string;
    vastXml?: string;
    mediaUrl?: string;
    mediaType?: string;
    tracking?: VastTracking;
  };
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

function readText(node: Element | null) {
  return (node?.textContent || '').replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function parseVastXml(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const mediaFiles = Array.from(doc.querySelectorAll('MediaFile'))
      .map((node) => ({
        url: readText(node),
        type: (node.getAttribute('type') || '').toLowerCase(),
        width: Number(node.getAttribute('width') || 0) || 0,
      }))
      .filter((item) => item.url)
      .sort((a, b) => {
        const aMp4 = a.type.includes('mp4') ? 1 : 0;
        const bMp4 = b.type.includes('mp4') ? 1 : 0;
        if (aMp4 !== bMp4) return bMp4 - aMp4;
        return b.width - a.width;
      });

    const tracking = (event: string) => Array.from(doc.querySelectorAll(`Tracking[event="${event}"]`)).map(readText).filter(Boolean);
    return {
      mediaUrl: mediaFiles[0]?.url || '',
      tracking: {
        impression: Array.from(doc.querySelectorAll('Impression')).map(readText).filter(Boolean),
        start: tracking('start'),
        complete: tracking('complete'),
        error: tracking('error'),
      },
    };
  } catch {
    return { mediaUrl: '', tracking: {} as VastTracking };
  }
}

function pingUrls(urls: string[] | undefined) {
  if (!Array.isArray(urls)) return;
  urls.forEach((url) => {
    const safeUrl = String(url || '').trim();
    if (!safeUrl) return;
    const img = new Image();
    img.src = safeUrl;
  });
}

export function AdBoostHost() {
  const toast = useToast();
  const { t } = useI18n();
  const { user, updateUser } = useAuth();
  const [offer, setOffer] = useState<AdBoostOffer | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [creativeId, setCreativeId] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [tracking, setTracking] = useState<VastTracking>({});
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maxWatchedRef = useRef(0);
  const startedPingRef = useRef(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AdBoostOffer>).detail;
      if (!detail?.id) return;
      setOffer(detail);
      setSessionId('');
      setCreativeId('');
      setMediaUrl('');
      setTracking({});
      maxWatchedRef.current = 0;
      startedPingRef.current = false;
    };
    window.addEventListener('givkoin:ad-boost-offer', handler);
    return () => window.removeEventListener('givkoin:ad-boost-offer', handler);
  }, []);

  const close = useCallback(() => {
    setOffer(null);
    setSessionId('');
    setCreativeId('');
    setMediaUrl('');
    setTracking({});
    maxWatchedRef.current = 0;
    startedPingRef.current = false;
  }, []);

  const start = useCallback(async () => {
    if (!offer?.id) return;
    setLoading(true);
    try {
      const response = await apiPost<StartResponse>('/ad-boosts/start', { offerId: offer.id });
      const vast = response.vast || {};
      let nextMediaUrl = vast.mediaUrl || '';
      let nextTracking = vast.tracking || {};

      if (!nextMediaUrl && vast.vastXml) {
        const parsed = parseVastXml(vast.vastXml);
        nextMediaUrl = parsed.mediaUrl;
        nextTracking = { ...nextTracking, ...parsed.tracking };
      }

      if (!nextMediaUrl && vast.vastUrl) {
        try {
          const direct = await fetch(vast.vastUrl, { credentials: 'omit' });
          const xml = await direct.text();
          const parsed = parseVastXml(xml);
          nextMediaUrl = parsed.mediaUrl;
          nextTracking = { ...nextTracking, ...parsed.tracking };
        } catch {
          // Если сеть не отдала XML браузеру, серверный разбор уже был последней попыткой.
        }
      }

      if (!response.sessionId || !nextMediaUrl) {
        throw new Error(t('ads.boost_video_missing'));
      }

      setSessionId(response.sessionId);
      setCreativeId(response.creativeId || '');
      setMediaUrl(nextMediaUrl);
      setTracking(nextTracking);
      pingUrls(nextTracking.impression);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ads.boost_video_unavailable');
      toast.error(t('ads.boost_unavailable'), message);
      close();
    } finally {
      setLoading(false);
    }
  }, [close, offer?.id, t, toast]);

  const recordVastEvent = useCallback((eventType: 'vast_start' | 'vast_complete' | 'vast_error') => {
    const page = offer?.page || 'ad_boost';
    apiPost('/ads/impression', {
      page,
      placement: 'rewarded_vast',
      creativeId: creativeId || undefined,
      eventType,
    }).catch(() => {});
  }, [creativeId, offer?.page]);

  const complete = useCallback(async () => {
    if (!sessionId || completing) return;
    setCompleting(true);
    try {
      pingUrls(tracking.complete);
      recordVastEvent('vast_complete');
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
      toast.success(t('ads.boost_received'), response?.title || t('ads.boost_reward_received'));
      close();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('ads.boost_complete_failed');
      toast.error(t('ads.boost_error'), message);
    } finally {
      setCompleting(false);
    }
  }, [close, completing, recordVastEvent, sessionId, t, toast, tracking.complete, updateUser, user]);

  const onPlay = () => {
    if (startedPingRef.current) return;
    startedPingRef.current = true;
    pingUrls(tracking.start);
    recordVastEvent('vast_start');
  };

  return (
    <AnimatePresence>
      {offer && (
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

            {mediaUrl ? (
              <div className="relative mt-4 overflow-hidden rounded-2xl border border-yellow-200/25 bg-black shadow-[0_0_30px_rgba(14,165,233,0.18)]">
                <video
                  src={mediaUrl}
                  ref={videoRef}
                  className="aspect-video w-full"
                  controls
                  autoPlay
                  playsInline
                  onLoadedMetadata={() => {
                    maxWatchedRef.current = 0;
                  }}
                  onTimeUpdate={(event) => {
                    maxWatchedRef.current = Math.max(maxWatchedRef.current, event.currentTarget.currentTime);
                  }}
                  onSeeking={(event) => {
                    if (event.currentTarget.currentTime > maxWatchedRef.current + 0.75) {
                      event.currentTarget.currentTime = maxWatchedRef.current;
                    }
                  }}
                  onPlay={onPlay}
                  onEnded={() => void complete()}
                  onError={() => {
                    pingUrls(tracking.error);
                    recordVastEvent('vast_error');
                    toast.error(t('ads.boost_video_failed'), t('ads.boost_try_later'));
                  }}
                />
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

            {mediaUrl && (
              <div className="relative mt-3 text-center text-xs font-semibold text-yellow-100/78">
                {t('ads.boost_reward_after_video')}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
