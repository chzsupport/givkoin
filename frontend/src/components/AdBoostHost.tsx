'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';
import {
  DAO_PREROLL_CREATIVE_ID,
  DAO_PREROLL_MANAGER_POLL_MS,
  DAO_PREROLL_MANAGER_TIMEOUT_MS,
  DAO_PREROLL_MIN_REWARD_DELAY_MS,
  DAO_PREROLL_SOURCE_ID,
  DAO_PREROLL_TAG_URL,
  DAO_PREROLL_VIDEO_ID,
  DAO_REWARD_NOTICE_MS,
} from '@/components/ad-boost/constants';
import { AdBoostMiniPrompt } from '@/components/ad-boost/AdBoostMiniPrompt';
import { AdBoostPanel } from '@/components/ad-boost/AdBoostPanel';
import { loadDaoVideoScript, readDaoVideoConstructor } from '@/components/ad-boost/daoVideo';
import type {
  AdBoostOffer,
  AdBoostStatus,
  CompleteResponse,
  DaoAdEventManager,
  DaoVideoInstance,
  StartResponse,
} from '@/components/ad-boost/types';

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
  const [daoStatus, setDaoStatus] = useState<AdBoostStatus>('idle');
  const [rewardNoticeVisible, setRewardNoticeVisible] = useState(false);
  const [technicalVideoVisible, setTechnicalVideoVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const daoInstanceRef = useRef<DaoVideoInstance | null>(null);
  const daoStartedRef = useRef(false);
  const adStartedRef = useRef(false);
  const adStartedAtRef = useRef(0);
  const adSkippedRef = useRef(false);
  const adCompletionHandledRef = useRef(false);
  const rewardRequestStartedRef = useRef(false);
  const dismissedOfferIdsRef = useRef<Set<string>>(new Set());
  const rewardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adManagerPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (rewardTimerRef.current) {
      clearTimeout(rewardTimerRef.current);
      rewardTimerRef.current = null;
    }
    if (adManagerPollTimerRef.current) {
      clearTimeout(adManagerPollTimerRef.current);
      adManagerPollTimerRef.current = null;
    }
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const destroyDaoInstance = useCallback(() => {
    if (daoInstanceRef.current?.destroy) {
      try {
        daoInstanceRef.current.destroy();
      } catch {
        // DAO.AD may throw if its container was already removed.
      }
    }
    daoInstanceRef.current = null;
    if (typeof window !== 'undefined') {
      window.daoVideoPreRoll = undefined;
    }
  }, []);

  const resetPlayerState = useCallback(() => {
    clearTimers();
    destroyDaoInstance();
    daoStartedRef.current = false;
    adStartedRef.current = false;
    adStartedAtRef.current = 0;
    adSkippedRef.current = false;
    adCompletionHandledRef.current = false;
    rewardRequestStartedRef.current = false;
    setDaoPlayerActive(false);
    setDaoStatus('idle');
    setRewardNoticeVisible(false);
    setTechnicalVideoVisible(false);
  }, [clearTimers, destroyDaoInstance]);

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
    if (!sessionId || rewardRequestStartedRef.current) return;
    rewardRequestStartedRef.current = true;
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
      rewardRequestStartedRef.current = false;
    } finally {
      setCompleting(false);
    }
  }, [close, recordRewardedAdEvent, sessionId, t, toast, updateUser, user]);

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
    setTechnicalVideoVisible(false);

    const failAdWatch = (message: string) => {
      if (cancelled || adCompletionHandledRef.current || rewardRequestStartedRef.current) return;
      adCompletionHandledRef.current = true;
      recordRewardedAdEvent('vast_error');
      video.pause();
      toast.error(t('ads.boost_video_failed'), message);
      close();
    };

    const finishAdWatch = () => {
      if (cancelled || adCompletionHandledRef.current) return;

      if (!adStartedRef.current || adSkippedRef.current) {
        failAdWatch(t('ads.boost_ad_not_completed'));
        return;
      }

      adCompletionHandledRef.current = true;
      const elapsedMs = Date.now() - (adStartedAtRef.current || Date.now());
      const waitMs = Math.max(0, DAO_PREROLL_MIN_REWARD_DELAY_MS - elapsedMs);

      if (waitMs > 250) {
        setTechnicalVideoVisible(true);
        try {
          video.currentTime = 0;
        } catch {
          // The browser may reject seeking if metadata is not ready yet.
        }
        video.play().catch(() => {});
        rewardTimerRef.current = setTimeout(() => {
          video.pause();
          void completeReward();
        }, waitMs);
        return;
      }

      video.pause();
      void completeReward();
    };

    const attachAdManagerGuards = (adsManager: DaoAdEventManager) => {
      const googleIma = (window as typeof window & {
        google?: {
          ima?: {
            AdEvent?: { Type?: Record<string, string> };
            AdErrorEvent?: { Type?: Record<string, string> };
          };
        };
      }).google?.ima;
      const adEventTypes = googleIma?.AdEvent?.Type;
      const adErrorTypes = googleIma?.AdErrorEvent?.Type;
      const addListener = (eventType: string | undefined, callback: () => void) => {
        if (eventType) {
          adsManager.addEventListener?.(eventType, callback);
        }
      };

      addListener(adEventTypes?.STARTED, () => {
        if (adStartedRef.current) return;
        adStartedRef.current = true;
        adStartedAtRef.current = Date.now();
        recordRewardedAdEvent('vast_start');
        setDaoStatus('playing');
      });
      addListener(adEventTypes?.SKIPPED, () => {
        adSkippedRef.current = true;
        failAdWatch(t('ads.boost_ad_not_completed'));
      });
      addListener(adEventTypes?.USER_CLOSE, () => {
        adSkippedRef.current = true;
        failAdWatch(t('ads.boost_ad_not_completed'));
      });
      addListener(adEventTypes?.ALL_ADS_COMPLETED, finishAdWatch);
      addListener(adErrorTypes?.AD_ERROR, () => failAdWatch(t('ads.boost_ad_unavailable')));
    };

    const waitForAdsManager = (daoVideoPreRoll: DaoVideoInstance) => {
      const startedAt = Date.now();

      const tick = () => {
        if (cancelled) return;
        const adsManager = daoVideoPreRoll.adsManager;
        if (adsManager) {
          adManagerPollTimerRef.current = null;
          attachAdManagerGuards(adsManager);
          video.currentTime = 0;
          video.play().catch(() => {
            failAdWatch(t('ads.boost_video_unavailable'));
          });
          return;
        }

        if (Date.now() - startedAt >= DAO_PREROLL_MANAGER_TIMEOUT_MS) {
          adManagerPollTimerRef.current = null;
          failAdWatch(t('ads.boost_ad_unavailable'));
          return;
        }

        adManagerPollTimerRef.current = setTimeout(tick, DAO_PREROLL_MANAGER_POLL_MS);
      };

      tick();
    };

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
          allAdsComplete: finishAdWatch,
          notSupported: () => failAdWatch(t('ads.boost_video_unavailable')),
        });
        daoInstanceRef.current = daoVideoPreRoll;
        window.daoVideoPreRoll = daoVideoPreRoll;
        daoVideoPreRoll.loadAd(() => {
          if (cancelled) return;
          daoVideoPreRoll.preroll({ videoId: DAO_PREROLL_VIDEO_ID });
          waitForAdsManager(daoVideoPreRoll);
        }, () => failAdWatch(t('ads.boost_dao_load_failed')));
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
          <AdBoostMiniPrompt
            offer={offer}
            t={t}
            onClose={close}
            onOpen={() => setPanelOpen(true)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {offer && panelOpen && (
          <AdBoostPanel
            completing={completing}
            daoPlayerActive={daoPlayerActive}
            daoStatus={daoStatus}
            loading={loading}
            offer={offer}
            rewardNoticeVisible={rewardNoticeVisible}
            technicalVideoVisible={technicalVideoVisible}
            t={t}
            videoRef={videoRef}
            onClose={close}
            onStart={() => void start()}
          />
        )}
      </AnimatePresence>
    </>
  );
}
