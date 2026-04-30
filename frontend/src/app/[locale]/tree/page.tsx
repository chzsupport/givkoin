'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/utils/api';
import { useSocket } from '@/hooks/useSocket';
import { useRouter } from 'next/navigation';
import { useStatusTracking } from '@/hooks/useStatusTracking';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';

const TreeScene = dynamic(() => import('./TreeScene'), { ssr: false });
const MultiAdBlock = dynamic(
  () => import('@/components/MultiAdBlock').then((m) => m.MultiAdBlock),
  { ssr: false }
);
const EntityAskModal = dynamic(
  () => import('@/components/entity/EntityAskModal').then((m) => m.EntityAskModal),
  { ssr: false }
);
const DailyStreakCalendar = dynamic(
  () => import('@/components/cabinet/DailyStreakCalendar'),
  { ssr: false }
);
const SearchPortal = dynamic(
  () => import('@/components/chat/SearchPortal').then((m) => m.SearchPortal),
  { ssr: false }
);

type Injury = {
  branchName?: string;
  severityPercent?: number;
  debuffPercent?: number;
  healedPercent?: number;
  requiredRadiance?: number;
  healedRadiance?: number;
  causedAt?: string;
};

type BattleCurrentResponse = {
  status?: 'active' | 'idle' | 'pending' | string;
};

type TreeStatusResponse = {
  healthPercent: number;
  injuries?: Injury[];
  isFruitAvailable: boolean;
};

type SolarStatusResponse = {
  nextAvailableAt: string;
};

type SolarShareResponse = {
  amountLm: number;
  scAward: number;
  starsAward: number;
  shareCountToday?: number;
  shareDailyLimit?: number;
};

type CollectFruitResponse = {
  rewardType: 'sc' | 'stars' | 'lumens';
  reward: number;
};

type HealTreeResponse = {
  ok: boolean;
  lumens: number;
  starsAward: number;
};

function getErrorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Unknown error';
}

export default function TreePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const { t, localePath } = useI18n();

  const [isFoundNotice, setIsFoundNotice] = useState(false);
  const [isUnderAttack, setIsUnderAttack] = useState(false);
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<'entity' | 'search' | 'solar' | null>(null);

  const [isFruitAvailable, setIsFruitAvailable] = useState(false);
  const [isEntityAskOpen, setIsEntityAskOpen] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  const [isHealOpen, setIsHealOpen] = useState(false);
  const [healLumens, setHealLumens] = useState('100');
  const [isHealing, setIsHealing] = useState(false);

  const [radianceBursts, setRadianceBursts] = useState<
    Array<{
      id: string;
      startX: number;
      startY: number;
      midX: number;
      midY: number;
      endX: number;
      endY: number;
      size: number;
      delay: number;
    }>
  >([]);

  const spawnRadianceBurst = (lumens: number) => {
    const startX = window.innerWidth / 2;
    const startY = window.innerHeight / 2;
    const endX = window.innerWidth / 2;
    const endY = Math.max(120, window.innerHeight * 0.38);

    const count = Math.max(6, Math.min(18, Math.round(Math.sqrt(Math.max(1, lumens)) * 2)));

    const created = Array.from({ length: count }, (_, i) => {
      const id = `${Date.now()}_${i}_${Math.random().toString(16).slice(2)}`;
      const jitterX = (Math.random() - 0.5) * 140;
      const jitterY = (Math.random() - 0.5) * 140;
      const midX = startX + jitterX * 0.6;
      const midY = startY - 160 + jitterY * 0.2;
      return {
        id,
        startX: startX + jitterX,
        startY: startY + jitterY,
        midX,
        midY,
        endX: endX + (Math.random() - 0.5) * 40,
        endY: endY + (Math.random() - 0.5) * 30,
        size: 6 + Math.random() * 10,
        delay: i * 0.02 + Math.random() * 0.06,
      };
    });

    setRadianceBursts((prev) => [...prev, ...created]);
  };

  // Status tracking: busy when solar panel is active
  useStatusTracking(user?._id, activePanel === 'solar' && isRightPanelOpen);

  useEffect(() => {
    const syncVisibility = () => {
      setIsTabVisible(document.visibilityState !== 'hidden');
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  // Solar Charge State
  const TAKING_DURATION = 60;
  const [solarStatus, setSolarStatus] = useState<'charging' | 'ready' | 'taking'>('charging');
  const [solarTimeLeft, setSolarTimeLeft] = useState(0);
  const [solarDeadlineAt, setSolarDeadlineAt] = useState<number | null>(null);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareAmountLm, setShareAmountLm] = useState('10');
  const [isShareSending, setIsShareSending] = useState(false);
  const [shareCountToday, setShareCountToday] = useState<number | null>(null);
  const [shareDailyLimit, setShareDailyLimit] = useState<number | null>(null);

  const openPanel = (panel: 'entity' | 'search' | 'solar') => {
    setActivePanel(panel);
    setIsRightPanelOpen(true);
  };

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

    // Start client-side taking process
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

      toast.success(t('tree.light_sent'), `−${data.amountLm} Lm, +${data.scAward} K, +${data.starsAward} ⭐`);
      refreshUser();
      setIsShareOpen(false);
    } catch (e: unknown) {
      toast.error(t('common.error'), getErrorMessage(e) || t('tree.failed_send_light'));
    } finally {
      setIsShareSending(false);
    }
  };

  const handleCollectFruit = async () => {
    try {
      const data = await apiPost<CollectFruitResponse>('/tree/collect-fruit', {});
      const rewardType = data?.rewardType;
      const reward = data?.reward;

      if (rewardType === 'stars') {
        toast.success(t('tree.fruit_collected'), `${reward} ⭐`);
      } else if (rewardType === 'lumens') {
        toast.success(t('tree.fruit_collected'), `${reward} Lm`);
      } else {
        toast.success(t('tree.fruit_collected'), `${reward} K`);
      }
      setIsFruitAvailable(false);
      refreshUser();
      // Reload tree data to update fruit availability status
      await loadTreeStatus();
    } catch (e: unknown) {
      toast.error(t('common.error'), getErrorMessage(e) || t('tree.failed_collect_fruit'));
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const loadTreeStatus = useCallback(async () => {
    const tree = await apiGet<TreeStatusResponse>('/tree/status');
    setInjuries(Array.isArray(tree.injuries) ? tree.injuries : []);
    setIsFruitAvailable(Boolean(tree.isFruitAvailable));
  }, []);

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

  const loadBattleStatus = useCallback(async () => {
    const battle = await apiGet<BattleCurrentResponse>('/battles/current');
    setIsUnderAttack(battle.status === 'active');
  }, []);

  const loadTreeData = useCallback(async () => {
    try {
      await loadTreeStatus();

      void loadSolarStatus().catch((e) => {
        console.error('Failed to load solar status:', e);
      });

      void loadBattleStatus().catch((e) => {
        console.error('Failed to load battle status:', e);
      });
    } catch (e) {
      console.error('Failed to load tree status:', e);
    }
  }, [loadBattleStatus, loadSolarStatus, loadTreeStatus]);

  useEffect(() => {
    void loadBattleStatus().catch((e) => {
      console.error('Failed to refresh battle status:', e);
    });

    const timer = window.setInterval(() => {
      void loadBattleStatus().catch((e) => {
        console.error('Failed to refresh battle status:', e);
      });
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [loadBattleStatus]);

  // Загружаем реальные данные дерева/солнечного заряда при монтировании
  useEffect(() => {
    void loadTreeData();
  }, [loadTreeData]);

  // Когда открываем панель энергии, обновляем только солнечную часть.
  useEffect(() => {
    if (activePanel === 'solar') {
      void loadSolarStatus().catch((e) => {
        console.error('Failed to refresh solar status:', e);
      });
    }
  }, [activePanel, loadSolarStatus]);

  // Timer Logic
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
        apiPost<{ lmAward?: number; scAward?: number }>('/tree/solar/collect', {})
          .then((data) => {
            const lumens = data?.lmAward ?? 100;
            const sc = data?.scAward ?? 10;
            toast.success(t('landing.energy'), `+${lumens} Lm, +${sc} K`);
            const nextDeadlineAt = Date.now() + 3600 * 1000;
            setSolarStatus('charging');
            setSolarDeadlineAt(nextDeadlineAt);
            setSolarTimeLeft(3600);
            refreshUser();
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
  }, [solarStatus, solarDeadlineAt, refreshUser, toast, t]);

  // Interruption Handling (Reset if tab closed/hidden/panel closed)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && solarStatus === 'taking') {
        setSolarStatus('ready');
        setSolarDeadlineAt(null);
        setSolarTimeLeft(0);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check if panel is closed or switched while taking
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

  // Socket events for search
  const socket = useSocket(user?._id);
  const [isSearching, setIsSearching] = useState(false);

  const handleFindPartner = () => {
    if (isSearching) return;
    if (!socket?.connected) {
      toast.error(t('chat.no_connection'), t('chat.connection_not_established'));
      return;
    }
    setIsFoundNotice(false);
    socket.emit('find_partner');
    setIsSearching(true);
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('chat_preparing', () => {
      setIsSearching(false);
      setIsFoundNotice(false);
    });

    socket.on('partner_found', ({ chatId }) => {
      setIsSearching(false);
      setIsFoundNotice(true);
      router.push(localePath(`/chat/${chatId}`));
    });

    socket.on('no_partner', () => {
      setIsSearching(false);
      setIsFoundNotice(false);
      toast.error(t('chat.not_found'), t('chat.no_partner_found'));
    });

    return () => {
      socket.off('chat_preparing');
      socket.off('partner_found');
      socket.off('no_partner');
    };
  }, [socket, router, localePath, toast, t]);

  const healingSummary = injuries.reduce(
    (acc, injury) => {
      const required = typeof injury.requiredRadiance === 'number' && injury.requiredRadiance > 0
        ? injury.requiredRadiance
        : (injury.severityPercent || 0) * 1000;
      const healed = injury.healedRadiance || 0;
      const percent = required > 0 ? (healed / required) * 100 : (injury.healedPercent || 0);
      if (percent >= 100 || required <= 0) {
        return acc;
      }
      acc.activeCount += 1;
      acc.requiredTotal += required;
      acc.healedTotal += Math.min(required, healed);
      return acc;
    },
    { activeCount: 0, requiredTotal: 0, healedTotal: 0 }
  );

  const hasTrauma = healingSummary.activeCount > 0;
  const healingPercent = healingSummary.requiredTotal > 0
    ? Math.min(100, Math.round((healingSummary.healedTotal / healingSummary.requiredTotal) * 100))
    : 0;
  const healingRemaining = Math.max(0, healingSummary.requiredTotal - healingSummary.healedTotal);

  return (
    <>
      <DailyStreakCalendar inline={false} />
      {/* Background Image */}
      <div className="fixed inset-0 z-0">
        <Image src="/8k_stars_milky_way.jpg" alt="Milky Way" fill quality={60} sizes="100vw" className="object-cover opacity-90" />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Full Screen 3D Scene */}
      <TreeScene isTabVisible={isTabVisible} />

      <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden" style={{ top: 'var(--header-height, 64px)', bottom: 0 }}>

        {/* Top Center Navigation (Galaxy, Settings, Fortune) */}
        <div className="absolute left-1/2 -translate-x-1/2 top-4 sm:top-6 lg:top-8 2xl:top-10 pointer-events-auto flex gap-1 sm:gap-2 lg:gap-2 2xl:gap-4">
          {[
            { href: localePath('/galaxy'), icon: '🌌', label: t('galaxy.title') },
            { href: localePath('/bridges'), icon: '🌉', label: t('bridges.title') },
            { href: localePath('/fortune'), icon: '🎰', label: t('fortune.title') },
            { href: localePath('/shop'), icon: '🛒', label: t('shop.title') },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative px-2 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 lg:px-5 lg:py-2.5 xl:px-6 xl:py-3 2xl:px-6 2xl:py-3 rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
            >
              <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 2xl:gap-3">
                <span className="text-2xl sm:text-3xl">{item.icon}</span>
                <span className="text-secondary font-medium text-white/80 group-hover:text-white hidden sm:inline">{item.label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Left Side Action Buttons (Conditional) */}
        <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-auto flex flex-col gap-6">
          {isUnderAttack && (
            <Link
              href={localePath('/battle')}
              className="group flex flex-col items-center gap-2 animate-pulse"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.8)] border-2 border-red-400 transition-transform hover:scale-110">
                <span className="text-3xl">⚔️</span>
              </div>
              <span className="text-tiny font-bold text-red-400 uppercase tracking-tighter text-center bg-black/60 px-2 py-1 rounded">
                {t('tree.tree_under_attack')}<br />{t('tree.defend')}
              </span>
            </Link>
          )}

          {hasTrauma && !isUnderAttack && (
            <button
              onClick={() => setIsHealOpen(true)}
              className="group flex flex-col items-center gap-2"
            >
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_0_30px_rgba(16,185,129,0.8)] border-2 border-emerald-400 transition-transform hover:scale-110">
                <span className="text-3xl">💊</span>
              </div>
              <span className="text-tiny font-bold text-emerald-400 uppercase tracking-widest bg-black/60 px-2 py-1 rounded">
                {t('tree.heal')}
              </span>
            </button>
          )}

          {isFruitAvailable && (
            <button
              onClick={handleCollectFruit}
              className="group flex flex-col items-center gap-2"
            >
              <motion.div
                animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-white shadow-[0_0_30px_rgba(249,115,22,0.8)] border-2 border-orange-300 transition-transform hover:scale-110"
              >
                <span className="text-3xl">🍎</span>
              </motion.div>
              <span className="text-tiny font-bold text-orange-400 uppercase tracking-widest bg-black/60 px-2 py-1 rounded">
                {t('tree.collect_fruit')}
              </span>
            </button>
          )}
        </div>

        {/* Right Side Buttons (🔵 ⚪ 🟡) */}
        <div className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 pointer-events-auto flex flex-col gap-3 sm:gap-6">
          <button
            onClick={() => openPanel('entity')}
            className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-500/80 border-2 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.5)] backdrop-blur-md transition-all hover:scale-110 hover:brightness-125"
            title={t('entity.title')}
          >
            <span className="text-lg sm:text-2xl">🔵</span>
          </button>
          <button
            onClick={() => openPanel('search')}
            className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/80 border-2 border-neutral-300 shadow-[0_0_15px_rgba(255,255,255,0.5)] backdrop-blur-md transition-all hover:scale-110 hover:brightness-125"
            title={t('chat.find_partner')}
          >
            <span className="text-lg sm:text-2xl">⚪</span>
          </button>
          <button
            onClick={() => openPanel('solar')}
            className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-yellow-500/80 border-2 border-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.5)] backdrop-blur-md transition-all hover:scale-110 hover:brightness-125"
            title={t('history.solar_charge_noun')}
          >
            <span className="text-lg sm:text-2xl">🟡</span>
          </button>
        </div>

        {hasTrauma && (
          <div className="absolute left-1/2 -translate-x-1/2 top-24 sm:top-[120px] md:top-[145px] lg:top-[175px] xl:top-[135px] 2xl:top-[165px] pointer-events-auto px-4 py-2 rounded-xl border border-emerald-500/20 bg-black/40 backdrop-blur-sm shadow-lg w-[260px] sm:w-[320px] md:w-[360px] max-w-[90vw]">
            <div className="flex items-center justify-between text-tiny text-white/70 mb-1">
              <span>{t('tree.healing_injury')}</span>
              <span className="text-emerald-300 font-semibold">{healingPercent}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                style={{ width: `${healingPercent}%` }}
              />
            </div>
            <div className="mt-1 text-caption text-white/60">
              {t('tree.radiance_remaining')} <span className="text-emerald-200 font-semibold">{healingRemaining.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Bottom Center Navigation (Settings, News, Evil Root) */}
        <div className="absolute left-1/2 -translate-x-1/2 bottom-4 sm:bottom-6 lg:bottom-8 2xl:bottom-10 pointer-events-auto flex gap-1 sm:gap-2 lg:gap-2 2xl:gap-4">
          <Link
            href={localePath('/evil-root')}
            className="group relative px-2 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 lg:px-5 lg:py-2.5 xl:px-6 xl:py-3 2xl:px-6 2xl:py-3 rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 2xl:gap-3">
              <span className="text-2xl sm:text-3xl">👁️</span>
              <span className="text-secondary font-medium text-white/80 group-hover:text-white hidden sm:inline">{t('landing.root')}</span>
            </div>
          </Link>
          <Link
            href={localePath('/news')}
            className="group relative px-2 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 lg:px-5 lg:py-2.5 xl:px-6 xl:py-3 2xl:px-6 2xl:py-3 rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 2xl:gap-3">
              <span className="text-2xl sm:text-3xl">📰</span>
              <span className="text-secondary font-medium text-white/80 group-hover:text-white hidden sm:inline">{t('landing.news_nav')}</span>
            </div>
          </Link>
          <Link
            href={localePath('/chronicle')}
            className="group relative px-2 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 lg:px-5 lg:py-2.5 xl:px-6 xl:py-3 2xl:px-6 2xl:py-3 rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 2xl:gap-3">
              <span className="text-2xl sm:text-3xl">📜</span>
              <span className="text-secondary font-medium text-white/80 group-hover:text-white hidden sm:inline">{t('chronicle.title')}</span>
            </div>
          </Link>
          <Link
            href={localePath('/practice')}
            className="group relative px-2 py-1.5 sm:px-4 sm:py-2 md:px-6 md:py-3 lg:px-5 lg:py-2.5 xl:px-6 xl:py-3 2xl:px-6 2xl:py-3 rounded-lg border border-white/20 bg-black/40 backdrop-blur-sm transition-all hover:bg-white/10 hover:border-white/40 hover:-translate-y-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.3)]"
          >
            <div className="flex items-center gap-1 sm:gap-1.5 lg:gap-2 2xl:gap-3">
              <span className="text-2xl sm:text-3xl">🧘</span>
              <span className="text-secondary font-medium text-white/80 group-hover:text-white hidden sm:inline">{t('landing.practice_nav')}</span>
            </div>
          </Link>
        </div>



        {/* Right Slide-in Panel */}
        {isRightPanelOpen && (
          <>
            {/* Backdrop to close panel on click outside */}
            <div
              className="absolute inset-0 z-0 pointer-events-auto"
              onClick={() => setIsRightPanelOpen(false)}
            />
            <div className="absolute inset-y-0 right-0 w-full sm:w-[380px] bg-neutral-900 border-l border-white/10 pointer-events-auto shadow-2xl transition-transform transform translate-x-0 z-10">
              <div className={`${(activePanel === 'solar' || activePanel === 'entity' || activePanel === 'search') ? 'p-0' : 'pt-4 px-4 pb-[10px] sm:pt-6 sm:px-6 sm:pb-[10px]'} h-full flex flex-col overflow-hidden`}>
                <div className={`relative flex items-center ${(activePanel === 'solar' || activePanel === 'entity' || activePanel === 'search') ? 'px-[10px] pt-[15px] sm:pt-[10px] mb-0' : 'mb-4 sm:mb-8'}`}>
                  <h2 className="w-full text-center text-secondary font-bold text-white uppercase tracking-widest">
                    {activePanel === 'entity' && t('entity.title')}
                    {activePanel === 'search' && t('chat.find_partner')}
                    {activePanel === 'solar' && t('landing.energy')}
                  </h2>
                  <button onClick={() => setIsRightPanelOpen(false)} className="absolute right-[10px] text-white/50 hover:text-white text-2xl">✕</button>
                </div>

                <div className="flex-1 flex flex-col min-h-0 overflow-y-auto sm:overflow-hidden no-scrollbar">
                  {activePanel === 'entity' && (
                    <div className="flex flex-col h-full p-4 sm:p-[20px] gap-4 overflow-hidden">
                      {/* Main Image/Placeholder */}
                      <div className="shrink-0 w-full flex items-center justify-center">
                        {!user?.entity ? (
                          <div className="w-full max-w-[220px] h-[180px] rounded-2xl overflow-hidden border-2 border-blue-500/30 bg-black/40 shadow-2xl flex items-center justify-center">
                            <span className="text-6xl opacity-20">👤</span>
                          </div>
                        ) : (
                          <div className="relative w-[320px] max-w-full aspect-square max-h-[28vh] overflow-hidden flex items-center justify-center">
                            <Image
                              src={user.entity.avatarUrl}
                              alt={user.entity.name}
                              fill
                              sizes="320px"
                              className="object-contain"
                              unoptimized
                            />
                          </div>
                        )}
                      </div>

                      {/* Content - Optimal Size */}
                      <div className="shrink-0">
                        {!user?.entity ? (
                          <div className="space-y-4">
                            <div className="text-center">
                              <h3 className="text-amber-200 font-bold uppercase tracking-widest text-tiny mb-2">{t('entity.no_soul_reflection')}</h3>
                              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-2">
                                <p className="text-tiny text-red-400 font-bold uppercase tracking-tight">{t('entity.attention')}</p>
                                <p className="text-tiny text-neutral-400 leading-tight text-left">
                                  {t('entity.soul_reflection_desc')}
                                </p>
                              </div>
                            </div>
                            <Link
                              href={localePath('/entity/create')}
                              className="block w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl font-bold text-white shadow-lg hover:shadow-blue-500/50 transition-all hover:scale-[1.02] uppercase tracking-widest text-tiny text-center"
                            >
                              {t('entity.create_soul_reflection')}
                            </Link>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="text-center">
                              <div className="text-h2 font-bold text-white uppercase tracking-[0.2em]">{user.entity.name}</div>
                              <div className="text-tiny text-neutral-500 uppercase tracking-widest">{t('entity.created')} {new Date(user.entity.createdAt).toLocaleDateString()}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <Link
                                href={localePath('/entity/profile')}
                                className="py-2.5 bg-white/5 border border-white/10 rounded-xl text-tiny uppercase tracking-widest hover:bg-white/10 transition-all font-bold text-center"
                              >
                                👤 {t('landing.profile')}
                              </Link>
                              <button
                                type="button"
                                onClick={() => setIsEntityAskOpen(true)}
                                className="py-2.5 bg-white/5 border border-white/10 rounded-xl text-tiny uppercase tracking-widest hover:bg-white/10 transition-all font-bold"
                              >
                                🤔 {t('entity.ask')}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Ad Blocks - adaptive count */}
                      <div className="flex-1 min-h-[50px] overflow-hidden flex flex-col">
                        <MultiAdBlock
                          page="entity"
                          placement="sidebar"
                          gap={30}
                        />
                      </div>
                    </div>
                  )}

                  {activePanel === 'search' && (
                    <div className="flex flex-col h-full overflow-hidden">
                      {/* Top Section - Optimal Size */}
                      <div className="px-4 sm:px-[20px] pt-4 pb-2 shrink-0 flex flex-col items-center gap-4 text-center">
                        <button
                          onClick={handleFindPartner}
                          className="group relative w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg font-bold text-white text-tiny shadow-lg hover:shadow-blue-500/50 transition-all hover:scale-[1.02] uppercase tracking-wider"
                        >
                          ✨ {t('chat.find_partner')} ✨
                        </button>
                      </div>

                      {/* Middle Section - Rules with Internal Scroll */}
                      <div className="px-4 sm:px-[20px] py-2 overflow-y-auto sm:overflow-hidden custom-scrollbar">
                        <div className="text-left w-full space-y-4">
                          <div className="text-tiny font-bold text-neutral-400 uppercase tracking-widest border-b border-white/5 pb-2">{t('entity.rules_warnings')}</div>
                          <ul className="space-y-3 text-tiny text-neutral-500 leading-relaxed list-none">
                            <li className="flex gap-2">
                              <span className="text-blue-500">•</span>
                              <span><strong className="text-neutral-400">{t('tree.rule_spam_title')}:</strong> {t('tree.rule_spam_desc')}</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-blue-500">•</span>
                              <span><strong className="text-neutral-400">{t('tree.rule_rudeness_title')}:</strong> {t('tree.rule_rudeness_desc')}</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-blue-500">•</span>
                              <span><strong className="text-neutral-400">{t('tree.rule_chatter_title')}:</strong> {t('tree.rule_chatter_desc')}</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-blue-500">•</span>
                              <span><strong className="text-neutral-400">{t('tree.rule_flirt_title')}:</strong> {t('tree.rule_flirt_desc')}</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-blue-500">•</span>
                              <span><strong className="text-neutral-400">{t('tree.rule_provocation_title')}:</strong> {t('tree.rule_provocation_desc')}</span>
                            </li>
                            <li className="flex gap-2">
                              <span className="text-blue-500">•</span>
                              <span><strong className="text-neutral-400">{t('tree.rule_forbidden_title')}:</strong> {t('tree.rule_forbidden_desc')}</span>
                            </li>
                          </ul>

                          <div className="pt-2">
                            <div className="text-tiny font-bold text-neutral-400 uppercase tracking-widest mb-2">{t('tree.conditions_title')}</div>
                            <ul className="space-y-2 text-tiny text-neutral-500 leading-relaxed list-none">
                              <li className="flex gap-2">
                                <span className="text-indigo-500">○</span>
                                <span>{t('tree.condition_no_review')}</span>
                              </li>
                              <li className="flex gap-2">
                                <span className="text-indigo-500">○</span>
                                <span>{t('tree.condition_off_platform')}</span>
                              </li>
                            </ul>
                          </div>
                        </div>
                      </div>

                      {/* Ad Blocks - adaptive count */}
                      <div className="flex-1 min-h-0 mx-4 sm:mx-[20px] mb-4 sm:mb-[20px] mt-4 sm:mt-[20px] flex flex-col overflow-hidden">
                        <MultiAdBlock
                          page="chat"
                          placement="sidebar"
                          gap={30}
                        />
                      </div>
                    </div>
                  )}

                  {activePanel === 'solar' && (
                    <div className="flex flex-col h-full p-4 sm:p-[20px] gap-4 overflow-hidden">
                      {/* Video Object - 20px margins, Square for larger sphere */}
                      <div className="m-4 sm:m-[20px] shrink-0 relative w-[260px] h-[260px] max-w-full rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl self-center">
                        <video
                          key={solarStatus}
                          src={
                            solarStatus === 'charging' ? '/charge.mp4' :
                              solarStatus === 'ready' ? '/ready.mp4' : '/take.mp4'
                          }
                          autoPlay
                          loop
                          muted
                          playsInline
                          preload="metadata"
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Middle Content - Optimal Size */}
                      <div className="px-[10px] space-y-3 shrink-0">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-tiny uppercase tracking-widest text-neutral-400 px-1">
                            <span>
                              {solarStatus === 'charging' ? t('tree.charge_progress') :
                                solarStatus === 'ready' ? t('tree.charged') : t('tree.absorption_process')}
                            </span>
                            <span className="text-yellow-500 font-bold">
                              {solarStatus === 'charging' ? `${Math.round((1 - solarTimeLeft / 3600) * 100)}%` :
                                solarStatus === 'ready' ? '100%' : `${Math.round(((60 - solarTimeLeft) / 60) * 100)}%`}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden border border-white/5">
                            <div
                              className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 transition-all duration-1000 ease-linear"
                              style={{
                                width: solarStatus === 'charging' ? `${Math.max(0, Math.min(100, (1 - solarTimeLeft / 3600) * 100))}%` :
                                  solarStatus === 'ready' ? '100%' : `${Math.max(0, Math.min(100, (1 - solarTimeLeft / TAKING_DURATION) * 100))}%`
                              }}
                            />
                          </div>
                        </div>

                        <div className="py-1.5 px-4 rounded-xl bg-white/5 border border-white/10 shadow-inner text-center">
                          <div className="text-tiny uppercase tracking-widest text-neutral-500 mb-0.5">
                            {solarStatus === 'charging' ? t('tree.until_full_charge') :
                              solarStatus === 'ready' ? t('tree.energy_ready') : t('tree.remaining_absorb')}
                          </div>
                          <div className={`text-h3 font-mono font-bold tracking-widest ${solarStatus === 'ready' ? 'text-yellow-400' : 'text-white'}`}>
                            {formatTime(solarTimeLeft)}
                          </div>
                        </div>

                        <button
                          onClick={handleTakeCharge}
                          disabled={solarStatus !== 'ready'}
                          className={`w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny ${solarStatus === 'ready'
                            ? 'bg-yellow-600 text-white border-yellow-400 hover:scale-[1.02] active:scale-[0.98]'
                            : 'bg-neutral-800 text-neutral-500 border-neutral-700 cursor-not-allowed'
                            }`}
                        >
                          {solarStatus === 'charging' ? t('tree.charging') :
                            solarStatus === 'ready' ? t('tree.absorb_energy') : t('tree.absorbing')}
                        </button>

                        <button
                          onClick={() => setIsShareOpen(true)}
                          className="w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny bg-black/40 text-amber-200 border-amber-500/30 hover:bg-amber-500/10"
                        >
                          {t('tree.share')}
                        </button>

                        {(shareCountToday !== null || shareDailyLimit !== null) && (
                          <div className="text-caption text-center text-white/50">
                            {t('tree.share_limit')}: {shareCountToday ?? '—'} / {shareDailyLimit ?? '—'}
                          </div>
                        )}
                      </div>

                      {/* Ad Blocks - same pattern as Entity tab (directly under the action button) */}
                      <div className="flex-1 min-h-[50px] overflow-hidden flex flex-col">
                        <MultiAdBlock
                          page="solar"
                          placement="sidebar"
                          gap={30}
                          minWidth={300}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

      </div>

      <AnimatePresence>
        {isShareOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-950 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-white font-bold uppercase tracking-widest text-tiny">{t('tree.share_light')}</div>
                <button
                  onClick={() => setIsShareOpen(false)}
                  className="text-white/50 hover:text-white text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-tiny text-white/60">
                  {t('tree.share_random_user')}
                </div>

                <div className="space-y-2">
                  <label className="text-tiny uppercase tracking-widest text-white/40">{t('tree.amount_lm')}</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={shareAmountLm}
                    onChange={(e) => setShareAmountLm(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50"
                  />
                  <div className="text-caption text-white/50">
                    {t('tree.available')}: {(user?.lumens ?? 0).toLocaleString()} Lm
                  </div>
                </div>

                <button
                  onClick={handleShareLumens}
                  disabled={isShareSending}
                  className="w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny bg-amber-600 text-white border-amber-400 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isShareSending ? t('password_reset.sending') : t('common.send')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isHealOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl border border-emerald-500/20 bg-neutral-950 p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="text-white font-bold uppercase tracking-widest text-tiny">{t('tree.heal_tree')}</div>
                <button
                  onClick={() => setIsHealOpen(false)}
                  className="text-white/50 hover:text-white text-xl"
                  disabled={isHealing}
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-tiny text-white/60">
                  {t('tree.give_lumens_heal')}
                </div>

                <div className="space-y-2">
                  <label className="text-tiny uppercase tracking-widest text-white/40">{t('tree.amount_lm')}</label>
                  <input
                    type="number"
                    min={1}
                    value={healLumens}
                    onChange={(e) => setHealLumens(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50"
                  />
                  <div className="text-caption text-white/50">
                    {t('tree.available')}: {(user?.lumens ?? 0).toLocaleString()} Lm
                  </div>
                </div>

                <button
                  onClick={async () => {
                    const lumens = Number(healLumens);
                    if (!Number.isFinite(lumens) || lumens <= 0) {
                      toast.error(t('common.error'), t('tree.enter_lm_amount'));
                      return;
                    }
                    setIsHealing(true);
                    try {
                      const data = await apiPost<HealTreeResponse>('/tree/heal', { lumens });
                      if (data?.starsAward) {
                        toast.success(t('tree.healing'), `${t('common.thank_you')}! +${data.starsAward} ⭐`);
                      } else {
                        toast.success(t('tree.healing'), t('common.thank_you') + '!');
                      }
                      spawnRadianceBurst(lumens);
                      await refreshUser();
                      await loadTreeData();
                      setIsHealOpen(false);
                    } catch (e: unknown) {
                      toast.error(t('common.error'), getErrorMessage(e) || t('tree.failed_heal'));
                    } finally {
                      setIsHealing(false);
                    }
                  }}
                  disabled={isHealing}
                  className="w-full py-3 font-bold rounded-xl border transition-all uppercase tracking-[0.2em] text-tiny bg-emerald-600 text-white border-emerald-400 hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isHealing ? t('password_reset.sending') : t('tree.give_lumens')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {radianceBursts.map((b) => (
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
            onAnimationComplete={() => {
              setRadianceBursts((prev) => prev.filter((x) => x.id !== b.id));
            }}
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

      <EntityAskModal
        isOpen={isEntityAskOpen}
        onClose={() => setIsEntityAskOpen(false)}
        entityName={user?.entity?.name}
      />

      <AnimatePresence>
        {isSearching && (
          <SearchPortal
            onCancel={() => {
              if (socket) socket.emit('cancel_search');
              setIsSearching(false);
              setIsFoundNotice(false);
            }}
          />
        )}
        {isFoundNotice && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/40 backdrop-blur-sm pointer-events-none"
          >
            <div className="px-6 py-3 rounded-full bg-emerald-600/90 border border-emerald-300/60 text-white text-body font-semibold shadow-lg pointer-events-auto">
              {t('chat.partner_found_wait')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        html, body {
          overflow: hidden;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 3s infinite ease-in-out;
        }
      `}</style>
    </>
  );
}

