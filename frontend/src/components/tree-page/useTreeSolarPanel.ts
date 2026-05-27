import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/utils/api';
import { getErrorMessage } from './treeErrors';
import type {
  SolarCollectResponse,
  SolarPanelStatus,
  SolarShareResponse,
  SolarStatusResponse,
  TreePanel,
  UserResourceSnapshot,
} from './types';

const TAKING_DURATION = 60;

type TreeTranslate = (key: string) => string;

type TreeToast = {
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
};

type TreeSolarUser = {
  lumens?: number | null;
};

type UseTreeSolarPanelOptions = {
  activePanel: TreePanel | null;
  isRightPanelOpen: boolean;
  refreshUser: () => Promise<unknown>;
  setActivePanel: (panel: TreePanel | null) => void;
  setIsRightPanelOpen: (isOpen: boolean) => void;
  syncUserResources: (nextUser?: UserResourceSnapshot | null) => void;
  t: TreeTranslate;
  toast: TreeToast;
  user?: TreeSolarUser | null;
};

export function useTreeSolarPanel({
  activePanel,
  isRightPanelOpen,
  refreshUser,
  setActivePanel,
  setIsRightPanelOpen,
  syncUserResources,
  t,
  toast,
  user,
}: UseTreeSolarPanelOptions) {
  const [solarStatus, setSolarStatus] = useState<SolarPanelStatus>('charging');
  const [solarTimeLeft, setSolarTimeLeft] = useState(0);
  const [solarDeadlineAt, setSolarDeadlineAt] = useState<number | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareAmountLm, setShareAmountLm] = useState('10');
  const [isShareSending, setIsShareSending] = useState(false);
  const [shareCountToday, setShareCountToday] = useState<number | null>(null);
  const [shareDailyLimit, setShareDailyLimit] = useState<number | null>(null);

  const detectAdblock = useCallback(async () => {
    if (typeof document === 'undefined') return false;

    const scriptProbe = () => new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.async = true;
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
      script.onload = () => {
        script.remove();
        resolve(false);
      };
      script.onerror = () => {
        script.remove();
        resolve(true);
      };
      document.head.appendChild(script);

      window.setTimeout(() => {
        script.remove();
        resolve(false);
      }, 1500);
    });

    const bait = document.createElement('div');
    bait.className = 'ad ads ad-banner adsbox ad-placement ad-container';
    bait.style.cssText = 'position:absolute; left:-9999px; top:-9999px; width:1px; height:1px; pointer-events:none;';
    document.body.appendChild(bait);

    await new Promise<void>((resolve) => {
      window.setTimeout(() => resolve(), 30);
    });

    const style = window.getComputedStyle(bait);
    const blocked =
      bait.offsetParent === null ||
      bait.offsetHeight === 0 ||
      bait.offsetWidth === 0 ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0';

    bait.remove();

    if (blocked) return true;

    const scriptBlocked = await scriptProbe();
    return scriptBlocked;
  }, []);

  const handleTakeCharge = async () => {
    if (solarStatus !== 'ready') return;

    const blocked = await detectAdblock();
    if (blocked) {
      setIsRightPanelOpen(false);
      setActivePanel(null);
      toast.error(t('common.warning'), t('ads.adblock_body'));
      return;
    }

    setSolarStatus('taking');
    setSolarTimeLeft(TAKING_DURATION);
    setSolarDeadlineAt(Date.now() + TAKING_DURATION * 1000);
  };

  const handleShareLumens = async () => {
    try {
      const amountLm = Number(shareAmountLm);
      if (!Number.isFinite(amountLm) || amountLm < 1 || amountLm > 100) {
        toast.error(t('common.error'), t('practice.enter_lm_1_100'));
        return;
      }
      if (!user) {
        toast.error(t('common.error'), t('errors.user_not_found'));
        return;
      }
      if ((user.lumens || 0) < amountLm) {
        toast.error(t('common.error'), t('tree.not_enough_lumens'));
        return;
      }

      setIsShareSending(true);
      const data = await apiPost<SolarShareResponse>('/tree/solar/share', { amountLm });
      setShareCountToday(typeof data?.shareCountToday === 'number' ? data.shareCountToday : null);
      setShareDailyLimit(typeof data?.shareDailyLimit === 'number' ? data.shareDailyLimit : null);

      toast.success(t('tree.light_sent'), `−${data.amountLm} Lm, +${data.kAward} K, +${data.starsAward} ⭐`);
      syncUserResources(data?.user);
      void refreshUser().catch((e) => {
        console.error('Failed to refresh user after lumens share:', e);
      });
      setIsShareOpen(false);
    } catch (e: unknown) {
      toast.error(t('common.error'), getErrorMessage(e) || t('tree.failed_send_light'));
    } finally {
      setIsShareSending(false);
    }
  };

  const loadSolarStatus = useCallback(async () => {
    const solar = await apiGet<SolarStatusResponse>('/tree/solar');
    const nextAvailableAtMs = new Date(solar.nextAvailableAt).getTime();
    const nowMs = Date.now();

    if (Number.isFinite(nextAvailableAtMs) && nextAvailableAtMs > nowMs) {
      setSolarStatus('charging');
      setSolarDeadlineAt(nextAvailableAtMs);
      setSolarTimeLeft(Math.max(0, Math.ceil((nextAvailableAtMs - nowMs) / 1000)));
      return;
    }

    setSolarStatus('ready');
    setSolarDeadlineAt(null);
    setSolarTimeLeft(0);
  }, []);

  useEffect(() => {
    if (activePanel === 'solar') {
      void loadSolarStatus().catch((e) => {
        console.error('Failed to refresh solar status:', e);
      });
    }
  }, [activePanel, loadSolarStatus]);

  useEffect(() => {
    if ((solarStatus !== 'charging' && solarStatus !== 'taking') || !solarDeadlineAt) {
      return;
    }

    let transitionHandled = false;

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((solarDeadlineAt - Date.now()) / 1000));
      setSolarTimeLeft((prev) => (prev === remaining ? prev : remaining));

      if (remaining > 0 || transitionHandled) {
        return;
      }

      transitionHandled = true;

      if (solarStatus === 'taking') {
        setSolarDeadlineAt(null);
        apiPost<SolarCollectResponse>('/tree/solar/collect', {})
          .then(async (data) => {
            const lumens = data?.lmAward ?? 100;
            const k = data?.kAward ?? 10;
            toast.success(t('landing.energy'), `+${lumens} Lm, +${k} K`);
            const nextDeadlineAt = Date.now() + 3600 * 1000;
            setSolarStatus('charging');
            setSolarDeadlineAt(nextDeadlineAt);
            setSolarTimeLeft(3600);
            syncUserResources(data?.user);
            void refreshUser().catch((e) => {
              console.error('Failed to refresh user after solar collect:', e);
            });
          })
          .catch((e) => {
            console.error('Collect failed:', e);
            setSolarStatus('ready');
            setSolarDeadlineAt(null);
            setSolarTimeLeft(0);
            toast.error(t('common.error'), t('tree.absorption_error'));
          });
        return;
      }

      setSolarStatus('ready');
      setSolarDeadlineAt(null);
      setSolarTimeLeft(0);
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [solarStatus, solarDeadlineAt, refreshUser, syncUserResources, toast, t]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && solarStatus === 'taking') {
        setSolarStatus('ready');
        setSolarDeadlineAt(null);
        setSolarTimeLeft(0);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    if (solarStatus === 'taking') {
      if (!isRightPanelOpen || activePanel !== 'solar') {
        setSolarStatus('ready');
        setSolarDeadlineAt(null);
        setSolarTimeLeft(0);
      }
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [solarStatus, isRightPanelOpen, activePanel]);

  return {
    handleShareLumens,
    handleTakeCharge,
    isShareOpen,
    isShareSending,
    loadSolarStatus,
    setIsShareOpen,
    setShareAmountLm,
    shareAmountLm,
    shareCountToday,
    shareDailyLimit,
    solarStatus,
    solarTimeLeft,
    takingDuration: TAKING_DURATION,
  };
}
