'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PageBackground } from '@/components/PageBackground';
import Link from 'next/link';
import { Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/utils/api';
import { useToast } from '@/context/ToastContext';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { formatUserSc } from '@/utils/formatters';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import Image from 'next/image';
import {
  getCachedBridgeList,
  getCachedBridgeStats,
  setCachedBridgeList,
  setCachedBridgeStats,
} from '@/utils/sessionWarmup';
import { useI18n } from '@/context/I18nContext';

// --- TYPES ---

interface Bridge {
  _id: string;
  fromCountry: string;
  toCountry: string;
  status: 'building' | 'completed' | 'planning';
  currentStones: number;
  requiredStones: number;
  contributors: { user?: { _id: string; nickname: string } | null; stones: number }[];
  createdAt: string;
  updatedAt: string;
  lastContributionAt?: string;
}

interface BridgesResponse {
  bridges: Bridge[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface BridgeStatsResponse {
  createdToday: number;
  stonesToday: number;
  limits: {
    newBridgesPerDay: number;
    existingBridgeStonesPerDay: number;
  };
  serverNow?: string;
}

type BridgeTab = 'building' | 'my' | 'completed';

const NEW_BRIDGE_COST_SC = 10;
const STONE_COST_SC = 1;
const DAILY_NEW_BRIDGE_LIMIT = 3;
const DAILY_EXISTING_STONE_LIMIT = 10;

const getBridgePairKey = (from: string, to: string) => [from, to].sort().join('::');

const mergeBridgeItems = (current: Bridge[], nextItems: Bridge[], append: boolean) => {
  if (!append) return nextItems;
  return [...current, ...nextItems.filter((bridge) => !current.some((row) => row._id === bridge._id))];
};

const upsertBridge = (items: Bridge[], bridge: Bridge, { prepend = false } = {}) => {
  const next = items.filter((row) => row._id !== bridge._id);
  return prepend ? [bridge, ...next] : [...next, bridge];
};

const applyContributionToBridge = (bridge: Bridge, userId: string, nickname: string, stones: number) => {
  const contributors = Array.isArray(bridge.contributors)
    ? bridge.contributors.map((row) => ({
        user: row.user ? { ...row.user } : null,
        stones: row.stones,
      }))
    : [];
  const contributorIndex = contributors.findIndex((row) => row.user?._id === userId);

  if (contributorIndex >= 0) {
    contributors[contributorIndex] = {
      ...contributors[contributorIndex],
      stones: contributors[contributorIndex].stones + stones,
    };
  } else {
    contributors.push({
      user: { _id: userId, nickname },
      stones,
    });
  }

  const currentStones = Math.min(bridge.requiredStones, bridge.currentStones + stones);
  return {
    ...bridge,
    currentStones,
    status: currentStones >= bridge.requiredStones ? 'completed' : bridge.status,
    contributors,
    lastContributionAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

const getBridgeImagePath = (from: string, to: string, type: 'preview' | 'full' = 'preview') => {
  const baseDir = type === 'preview' ? '/bridgepreview' : '/bridgecollect';
  const extension = type === 'preview' ? 'webp' : 'jpeg';
  // По умолчанию предполагаем формат "Country1 - Country2"
  // Важно: в именах файлов используется " - "
  return `${baseDir}/${from} - ${to}.${extension}`;
};

// --- COMPONENTS ---
const BridgeImage = ({ from, to, type = 'preview', className = "", alt = "Bridge" }: { from: string, to: string, type?: 'preview' | 'full', className?: string, alt?: string }) => {
  const [triedReverse, setTriedReverse] = useState(false);
  const [error, setError] = useState(false);

  const src = triedReverse
    ? getBridgeImagePath(to, from, type)
    : getBridgeImagePath(from, to, type);

  if (error && triedReverse) {
    return (
      <div className={`${className} bg-neutral-800 flex items-center justify-center text-neutral-600`}>
        <span className="text-4xl">🌉</span>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="(max-width: 768px) 100vw, 50vw"
      className={className}
      unoptimized
      onError={() => {
        if (!triedReverse) {
          setTriedReverse(true);
        } else {
          setError(true);
        }
      }}
    />
  );
};

// --- FLOATING ORBS ---
const floatingOrbs = Array.from({ length: 8 }).map((_, idx) => ({
  id: idx,
  size: 80 + Math.random() * 120,
  top: `${5 + Math.random() * 70}%`,
  left: `${Math.random() * 100}%`,
  duration: 12 + Math.random() * 10,
  delay: Math.random() * 4,
  gradient: idx % 2 === 0
    ? 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.45), rgba(59, 130, 246, 0.05))'
    : 'radial-gradient(circle at 70% 70%, rgba(56, 189, 248, 0.35), rgba(168, 85, 247, 0.05))',
}));

// --- MAIN COMPONENT ---
export default function BridgesPage() {
  const { user, refreshUser, updateUser } = useAuth();
  const toast = useToast();
  const { t, localePath } = useI18n();
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<Bridge | null>(null);
  const [activeTab, setActiveTab] = useState<BridgeTab>('building');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showFullDetailsModal, setShowFullDetailsModal] = useState(false);
  const [countryFrom, setCountryFrom] = useState('Russia');
  const [countryTo, setCountryTo] = useState('Belarus');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [neighborsMap, setNeighborsMap] = useState<Record<string, string[]>>({});
  const [bridgeDistanceMap, setBridgeDistanceMap] = useState<Record<string, number>>({});
  const [bridgeStats, setBridgeStatsState] = useState<BridgeStatsResponse | null>(null);
  const [pendingBridgeIds, setPendingBridgeIds] = useState<Record<string, boolean>>({});
  const [isCreatingBridge, setIsCreatingBridge] = useState(false);
  const [isFromDropdownOpen, setIsFromDropdownOpen] = useState(false);
  const [isToDropdownOpen, setIsToDropdownOpen] = useState(false);
  const fromDropdownRef = useRef<HTMLDivElement | null>(null);
  const toDropdownRef = useRef<HTMLDivElement | null>(null);
  const [windowWidth, setWindowWidth] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
  const isDesktop = Boolean(sideAdSlot);
  const pageRef = useRef(1);
  const paginationRef = useRef<BridgesResponse['pagination']>(undefined);
  const bridgesRef = useRef<Bridge[]>([]);
  const pendingMutationsRef = useRef(0);
  const userId = user?._id ? String(user._id) : '';

  const persistBridgeStats = useCallback((nextStats: BridgeStatsResponse | null) => {
    setBridgeStatsState(nextStats);
    if (nextStats && userId) {
      setCachedBridgeStats(userId, nextStats);
    }
  }, [userId]);

  const persistBridgeList = useCallback((tab: BridgeTab, nextBridges: Bridge[], pagination?: BridgesResponse['pagination']) => {
    if (!userId) return;
    setCachedBridgeList(userId, tab, {
      bridges: nextBridges,
      pagination,
    });
  }, [userId]);

  useEffect(() => {
    bridgesRef.current = bridges;
  }, [bridges]);

  const fetchBridgeStats = useCallback(async (options?: { silent?: boolean }) => {
    const { silent = false } = options || {};
    if (silent && pendingMutationsRef.current > 0) {
      return;
    }
    try {
      const data = await apiGet<BridgeStatsResponse>('/bridges/stats');
      if (silent && pendingMutationsRef.current > 0) {
        return;
      }
      persistBridgeStats(data);
    } catch (error) {
      if (!silent) {
        console.error('Failed to fetch bridge stats:', error);
      }
    }
  }, [persistBridgeStats]);

  const fetchBridges = useCallback(async (options?: { silent?: boolean; append?: boolean; pageOverride?: number; tabOverride?: BridgeTab }) => {
    const { silent = false, append = false, pageOverride = 1, tabOverride = activeTab } = options || {};
    if (silent && pendingMutationsRef.current > 0) {
      return;
    }
    if (!silent && !append) {
      setIsLoading(true);
    }
    if (append) {
      setIsLoadingMore(true);
    }
    try {
      const basePath = tabOverride === 'my' ? '/bridges/my' : '/bridges';
      const statusQuery = tabOverride === 'completed' ? 'completed' : tabOverride === 'building' ? 'building' : '';
      const query = new URLSearchParams({
        page: String(pageOverride),
        limit: '50',
      });
      if (statusQuery) {
        query.set('status', statusQuery);
      }
      const data = await apiGet<BridgesResponse>(`${basePath}?${query.toString()}`);
      if (silent && pendingMutationsRef.current > 0) {
        return; // Bail out if a mutation started WHILE we were fetching!
      }
      const nextItems = Array.isArray(data.bridges) ? data.bridges : [];
      const mergedItems = mergeBridgeItems(bridgesRef.current, nextItems, append);

      setBridges(mergedItems);
      persistBridgeList(tabOverride, mergedItems, data.pagination);
      setSelectedBridge((prev) => prev ? mergedItems.find((bridge) => bridge._id === prev._id) || null : prev);

      pageRef.current = pageOverride;
      setPage(pageOverride);
      setHasMore(Boolean(data.pagination?.hasMore));
      paginationRef.current = data.pagination;
    } catch (error) {
      console.error('Failed to fetch bridges:', error);
    } finally {
      if (!silent && !append) {
        setIsLoading(false);
      }
      if (append) {
        setIsLoadingMore(false);
      }
    }
  }, [activeTab, persistBridgeList]);

  useEffect(() => {
    setSelectedBridge(null);
    const cachedList = userId ? getCachedBridgeList(userId, activeTab) : null;
    if (cachedList && Array.isArray(cachedList.bridges)) {
      setBridges(cachedList.bridges);
      setHasMore(Boolean(cachedList.pagination?.hasMore));
      setPage(cachedList.pagination?.page || 1);
      pageRef.current = cachedList.pagination?.page || 1;
      paginationRef.current = cachedList.pagination;
      setIsLoading(false);
    }

    const cachedStats = userId ? getCachedBridgeStats(userId) : null;
    if (cachedStats) {
      setBridgeStatsState(cachedStats);
    }

    fetchBridges({ pageOverride: 1, tabOverride: activeTab });
    fetchBridgeStats({ silent: true });
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (pendingMutationsRef.current > 0) {
        return;
      }
      if (pageRef.current === 1) {
        fetchBridges({ silent: true, pageOverride: 1, tabOverride: activeTab });
        fetchBridgeStats({ silent: true });
      }
    }, 10000);

    const updateLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowWidth(w);
      const isLand = w > h;
      setIsLandscape(isLand);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', updateLayout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, fetchBridgeStats, fetchBridges, userId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (fromDropdownRef.current && fromDropdownRef.current.contains(target)) return;
      if (toDropdownRef.current && toDropdownRef.current.contains(target)) return;

      if (isFromDropdownOpen || isToDropdownOpen) {
        setIsFromDropdownOpen(false);
        setIsToDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFromDropdownOpen, isToDropdownOpen]);

  useEffect(() => {
    const loadNeighbors = async () => {
      try {
        const response = await fetch(encodeURI('/country duration'));
        if (!response.ok) {
          console.error('Failed to load country duration file');
          return;
        }

        const text = await response.text();
        const map: Record<string, Set<string>> = {};
        const distances: Record<string, number> = {};

        text.split('\n').forEach((rawLine) => {
          const line = rawLine.trim();
          if (!line) return;

          const [pairPart, distancePart] = line.split('—').map((part) => part.trim());
          if (!pairPart) return;

          const [from, to] = pairPart.split('-').map((part) => part.trim());
          if (!from || !to) return;

          const fromSet = map[from] ?? new Set<string>();
          fromSet.add(to);
          map[from] = fromSet;

          // Гарантируем, что даже если страна только в роли 'to', она есть в ключе (но с пустым списком)
          if (!map[to]) map[to] = new Set<string>();

          const distanceKm = Number((distancePart || '').replace(/[^\d]/g, ''));
          if (Number.isFinite(distanceKm) && distanceKm > 0) {
            distances[getBridgePairKey(from, to)] = distanceKm;
          }
        });

        const normalized: Record<string, string[]> = {};
        Object.entries(map).forEach(([country, neighbors]) => {
          normalized[country] = Array.from(neighbors).sort();
        });

        setNeighborsMap(normalized);
        setBridgeDistanceMap(distances);
      } catch (error) {
        console.error('Failed to parse country duration file', error);
      }
    };

    loadNeighbors();
  }, []);

  const availableToCountries = useMemo(() => {
    const neighbors = neighborsMap[countryFrom];
    if (!neighbors || neighbors.length === 0) {
      return [];
    }

    // Filter out countries that already have a bridge (building or completed) with the selected country
    return neighbors.filter(neighbor => {
      const hasBridge = bridges.some(bridge =>
        (bridge.fromCountry === countryFrom && bridge.toCountry === neighbor) ||
        (bridge.fromCountry === neighbor && bridge.toCountry === countryFrom)
      );
      return !hasBridge;
    });
  }, [neighborsMap, countryFrom, bridges]);

  const selectedBridgeDistance = useMemo(
    () => bridgeDistanceMap[getBridgePairKey(countryFrom, countryTo)] || 0,
    [bridgeDistanceMap, countryFrom, countryTo]
  );

  useEffect(() => {
    if (!availableToCountries.length) {
      setCountryTo(countryFrom);
      return;
    }

    setCountryTo((prev) =>
      availableToCountries.includes(prev) ? prev : availableToCountries[0]
    );
  }, [countryFrom, availableToCountries]);

  // Stats
  const totalStones = useMemo(() => bridges.reduce((acc, b) => acc + b.currentStones, 0), [bridges]);
  const activeBridgesCount = useMemo(() => bridges.filter(b => b.status === 'building').length, [bridges]);
  const builtBridgesCount = useMemo(() => bridges.filter(b => b.status === 'completed').length, [bridges]);
  const createdToday = bridgeStats?.createdToday ?? 0;
  const stonesToday = bridgeStats?.stonesToday ?? 0;
  const newBridgeLimit = bridgeStats?.limits?.newBridgesPerDay ?? DAILY_NEW_BRIDGE_LIMIT;
  const existingStoneLimit = bridgeStats?.limits?.existingBridgeStonesPerDay ?? DAILY_EXISTING_STONE_LIMIT;

  const handleLayStone = async (bridgeId: string) => {
    if (!user) {
      toast.error(t('common.error'), t('bridges.user_not_found'));
      return;
    }
    if (pendingBridgeIds[bridgeId]) {
      return;
    }
    if (user.sc < STONE_COST_SC) {
      toast.error(t('bridges.not_enough_k'), `${t('bridges.need_min_k_prefix')} ${STONE_COST_SC} K`);
      return;
    }
    if (stonesToday + STONE_COST_SC > existingStoneLimit) {
      toast.error(t('bridges.limit'), `${t('bridges.existing_stone_limit_prefix')} ${existingStoneLimit} ${t('bridges.existing_stone_limit_suffix')}`);
      return;
    }

    const previousBridges = bridges;
    const previousSelectedBridge = selectedBridge;
    const previousStats = bridgeStats;
    const targetBridge = bridges.find((bridge) => bridge._id === bridgeId);
    if (!targetBridge) {
      toast.error(t('common.error'), t('bridges.bridge_not_found'));
      return;
    }

    const optimisticBridge = applyContributionToBridge(targetBridge, userId, user.nickname || t('cabinet.player'), STONE_COST_SC);
    const optimisticBridges = bridges.map((bridge) => bridge._id === bridgeId ? optimisticBridge : bridge);
    const optimisticStats: BridgeStatsResponse = {
      createdToday,
      stonesToday: stonesToday + STONE_COST_SC,
      limits: {
        newBridgesPerDay: newBridgeLimit,
        existingBridgeStonesPerDay: existingStoneLimit,
      },
      serverNow: previousStats?.serverNow,
    };

    pendingMutationsRef.current++;
    setPendingBridgeIds((prev) => ({ ...prev, [bridgeId]: true }));
    setBridges(optimisticBridges);
    persistBridgeList(activeTab, optimisticBridges, paginationRef.current);
    if (selectedBridge?._id === bridgeId) {
      setSelectedBridge(optimisticBridge);
    }
    updateUser({
      ...user,
      sc: Math.max(0, Number(user.sc || 0) - STONE_COST_SC),
    });
    persistBridgeStats(optimisticStats);
    toast.success(t('bridges.radiance_plus_5'), t('bridges.stone_laid'));

    try {
      const response = await apiPost<{ bridge?: Bridge; user?: typeof user }>(`/bridges/${bridgeId}/contribute`, { stones: STONE_COST_SC });
      if (response.user) {
        updateUser(response.user);
      } else {
        refreshUser().catch(() => {});
      }

      if (response.bridge) {
        setBridges((prev) => {
          const next = prev.map((bridge) => {
            if (bridge._id === response.bridge!._id) {
              const srvBridge = response.bridge!;
              if ((Number(srvBridge.currentStones) || 0) < (Number(optimisticBridge.currentStones) || 0)) {
                return optimisticBridge;
              }
              const hydratedContributors = srvBridge.contributors.map(c => {
                const existing = optimisticBridge.contributors.find(o => 
                  (o.user?._id || o.user) === (c.user?._id || c.user)
                );
                return { ...c, user: existing?.user || c.user };
              });
              return { ...srvBridge, contributors: hydratedContributors };
            }
            return bridge;
          });
          persistBridgeList(activeTab, next, paginationRef.current);
          return next;
        });
        if (selectedBridge?._id === response.bridge._id) {
          setSelectedBridge((prev) => {
            if (!prev) return response.bridge!;
            if ((Number(response.bridge!.currentStones) || 0) < (Number(optimisticBridge.currentStones) || 0)) {
              return optimisticBridge;
            }
            const hydratedContributors = response.bridge!.contributors.map(c => {
              const existing = optimisticBridge.contributors.find(o => 
                (o.user?._id || o.user) === (c.user?._id || c.user)
              );
              return { ...c, user: existing?.user || c.user };
            });
            return { ...response.bridge!, contributors: hydratedContributors };
          });
        }
      }
    } catch (error: unknown) {
      setBridges(previousBridges);
      persistBridgeList(activeTab, previousBridges, paginationRef.current);
      setSelectedBridge(previousSelectedBridge);
      updateUser(user);
      persistBridgeStats(previousStats);
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('bridges.stone_lay_error'));
      fetchBridgeStats({ silent: true });
      fetchBridges({ silent: true, pageOverride: 1, tabOverride: activeTab });
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      setPendingBridgeIds((prev) => ({ ...prev, [bridgeId]: false }));
      fetchBridgeStats({ silent: true });
    }
  };

  const handleCreateBridge = async () => {
    if (!user) {
      toast.error(t('common.error'), t('bridges.user_not_found'));
      return;
    }
    if (countryFrom === countryTo) {
      toast.error(t('common.error'), t('bridges.choose_two_countries'));
      return;
    }
    if (user.sc < NEW_BRIDGE_COST_SC) {
      toast.error(t('bridges.not_enough_k'), `${t('bridges.need_k_for_start_prefix')} ${NEW_BRIDGE_COST_SC} K ${t('bridges.need_k_for_start_suffix')}`);
      return;
    }
    if (isCreatingBridge) {
      return;
    }
    if (createdToday >= newBridgeLimit) {
      toast.error(t('bridges.limit'), `${t('bridges.new_bridge_limit_prefix')} ${newBridgeLimit} ${t('bridges.new_bridge_limit_suffix')}`);
      return;
    }
    if (!selectedBridgeDistance) {
      toast.error(t('common.error'), t('bridges.distance_error'));
      return;
    }

    const nowIso = new Date().toISOString();
    const tempBridge: Bridge = {
      _id: `temp_bridge_${Date.now()}`,
      fromCountry: countryFrom,
      toCountry: countryTo,
      status: 'building',
      currentStones: 1,
      requiredStones: selectedBridgeDistance,
      contributors: [{ user: { _id: userId, nickname: user.nickname || t('cabinet.player') }, stones: 1 }],
      createdAt: nowIso,
      updatedAt: nowIso,
      lastContributionAt: nowIso,
    };
    const previousBridges = bridges;
    const previousSelectedBridge = selectedBridge;
    const previousStats = bridgeStats;
    const optimisticBridges = activeTab === 'completed'
      ? bridges
      : [tempBridge, ...bridges.filter((bridge) => bridge._id !== tempBridge._id)];
    const optimisticStats: BridgeStatsResponse = {
      createdToday: createdToday + 1,
      stonesToday,
      limits: {
        newBridgesPerDay: newBridgeLimit,
        existingBridgeStonesPerDay: existingStoneLimit,
      },
      serverNow: previousStats?.serverNow,
    };

    pendingMutationsRef.current++;
    setIsCreatingBridge(true);
    if (activeTab !== 'completed') {
      setBridges(optimisticBridges);
      persistBridgeList(activeTab, optimisticBridges, paginationRef.current);
    }
    setSelectedBridge(tempBridge);
    setShowCreateModal(false);
    updateUser({
      ...user,
      sc: Math.max(0, Number(user.sc || 0) - NEW_BRIDGE_COST_SC),
    });
    persistBridgeStats(optimisticStats);
    toast.success(t('bridges.radiance_plus_10'), t('bridges.bridge_creating'));

    try {
      const data = await apiPost<{ bridge: Bridge; user?: typeof user }>('/bridges', {
        fromCountry: countryFrom,
        toCountry: countryTo
      });
      if (data.user) {
        updateUser(data.user);
      } else {
        refreshUser().catch(() => {});
      }

      const serverBridge = data.bridge;
      // Ensure the first contributor has the correct nickname from optimistic data
      if (serverBridge.contributors && serverBridge.contributors.length > 0 && tempBridge.contributors[0]) {
        serverBridge.contributors[0] = {
          ...serverBridge.contributors[0],
          user: tempBridge.contributors[0].user
        };
      }
      setBridges((prev) => {
        const withoutTemp = prev.filter((bridge) => bridge._id !== tempBridge._id);
        const next = activeTab === 'completed' ? withoutTemp : [serverBridge, ...withoutTemp.filter((bridge) => bridge._id !== serverBridge._id)];
        persistBridgeList(activeTab, next, paginationRef.current);
        return next;
      });
      persistBridgeList('building', upsertBridge(getCachedBridgeList(userId, 'building')?.bridges || [], serverBridge, { prepend: true }), getCachedBridgeList(userId, 'building')?.pagination);
      persistBridgeList('my', upsertBridge(getCachedBridgeList(userId, 'my')?.bridges || [], serverBridge, { prepend: true }), getCachedBridgeList(userId, 'my')?.pagination);
      setSelectedBridge(serverBridge);
      fetchBridgeStats({ silent: true });
    } catch (error: unknown) {
      if (activeTab !== 'completed') {
        setBridges(previousBridges);
        persistBridgeList(activeTab, previousBridges, paginationRef.current);
      }
      setSelectedBridge(previousSelectedBridge);
      updateUser(user);
      persistBridgeStats(previousStats);
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('bridges.bridge_create_error'));
      fetchBridgeStats({ silent: true });
      fetchBridges({ silent: true, pageOverride: 1, tabOverride: activeTab });
    } finally {
      pendingMutationsRef.current = Math.max(0, pendingMutationsRef.current - 1);
      setIsCreatingBridge(false);
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 ${isLandscape && windowWidth >= 1024 ? 'lg:overflow-hidden' : 'overflow-y-auto'} text-slate-200 font-sans selection:bg-yellow-500/30`}>
      <PageBackground />

      {/* Space Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-10 -left-10 w-[32rem] h-[32rem] bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-transparent blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-0 right-[-6rem] w-[36rem] h-[36rem] bg-gradient-to-br from-indigo-500/20 via-cyan-400/15 to-transparent blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-30">
          {floatingOrbs.map((orb) => (
            <motion.div
              key={orb.id}
              className="absolute rounded-full"
              style={{ width: orb.size, height: orb.size, top: orb.top, left: orb.left, background: orb.gradient, filter: 'blur(14px)' }}
              animate={{ y: [-20, 30, -10], opacity: [0.2, 0.65, 0.35], rotate: [0, 6, -4, 0] }}
              transition={{ duration: orb.duration, repeat: Infinity, delay: orb.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>

      {/* MAIN WRAPPER FOR CONTENT AND SIDE ADS */}
      <div className="relative z-10 flex flex-1 min-h-0">

        {/* LEFT AD BLOCK - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="bridges" placement="bridges_sidebar_left" />

        {/* MAIN CONTENT - NO SCROLL ON DESKTOP */}
        <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">

          {/* MOBILE AD BLOCK - Dynamic sizes for Tablets/Mobile. Hidden in landscape on large screens */}
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="bridges"
              placement="bridges_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          {/* Header Row */}
          <header className="flex flex-col gap-2 mb-4 flex-shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex-shrink-0">
                <Link
                  href={localePath('/tree')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                >
                  <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.to_tree')}
                </Link>
              </div>

              {/* Stats Bar */}
              <div className="flex flex-1 basis-[22rem] min-w-0 justify-center sm:justify-end">
                <div className="flex items-center justify-between lg:justify-start gap-2 sm:gap-0 bg-white/5 border border-white/10 rounded-2xl p-0.5 backdrop-blur-xl shadow-lg max-w-full">
                  <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                    <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.balance')}</span>
                    <span className="text-secondary font-mono font-black text-blue-300">{formatUserSc(user?.sc ?? 0)} <span className="text-tiny text-blue-500/50">K</span></span>
                  </div>

                  <div className="w-px h-5 lg:h-6 bg-white/10" />
                  <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                    <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.stones')}</span>
                    <span className="text-secondary font-mono font-black text-purple-300">{totalStones.toLocaleString()}</span>
                  </div>

                  <div className="w-px h-5 lg:h-6 bg-white/10" />
                  <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                    <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.building')}</span>
                    <span className="text-secondary font-mono font-black text-yellow-400">{activeBridgesCount}</span>
                  </div>

                  <div className="w-px h-5 lg:h-6 bg-white/10" />
                  <div className="flex flex-col items-center px-3 py-0.5 lg:py-1.5 rounded-xl hover:bg-white/5 transition-colors flex-1 lg:flex-none">
                    <span className="text-tiny uppercase tracking-wider text-neutral-500 font-bold whitespace-nowrap">{t('bridges.done')}</span>
                    <span className="text-secondary font-mono font-black text-green-400">{builtBridgesCount}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center">
              <PageTitle
                title={t('bridges.title')}
                Icon={Zap}
                gradientClassName="from-blue-200 via-blue-400 to-purple-500"
                iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-blue-300"
              />
            </div>
          </header>

          {/* Tabs & Create Button */}
          <div className="mb-3 shrink-0 grid gap-2 sm:gap-3 items-center sm:grid-cols-[1fr_auto_1fr]">
            <div className="flex flex-wrap justify-center gap-1 p-0.5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md w-fit mx-auto sm:col-start-2">
              {(['building', 'my', 'completed'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest transition-all ${activeTab === tab
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-neutral-500 hover:text-white hover:bg-white/5'
                    }`}
                >
                  {tab === 'building' ? t('bridges.tabs.building') : tab === 'my' ? t('bridges.tabs.my') : t('bridges.tabs.completed')}
                </button>
              ))}
            </div>

            <div className="flex justify-center sm:justify-end sm:col-start-3">
              <button
                onClick={() => setShowCreateModal(true)}
                disabled={isCreatingBridge || createdToday >= newBridgeLimit}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-tiny uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                + {t('bridges.create_bridge')}
              </button>
            </div>
          </div>

          {/* Main Content Grid - Vertical stack on tablets in portrait */}
          <div className={`grid gap-4 flex-1 min-h-0 ${isLandscape ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
            {/* Bridge List */}
            <div className={`${isLandscape ? 'lg:col-span-2' : 'col-span-1'} bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-2xl overflow-hidden flex flex-col min-h-0`}>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0">
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
                      <div className="h-10 w-full rounded-lg bg-white/10" />
                      <div className="mt-3 h-3 w-2/3 rounded bg-white/10" />
                      <div className="mt-2 h-2 w-1/2 rounded bg-white/10" />
                    </div>
                  ))
                ) : bridges.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🌉</div>
                    <p className="text-neutral-400 uppercase tracking-widest text-tiny">{t('bridges.empty')}</p>
                  </div>
                ) : (
                  bridges.map((bridge, index) => (
                    <motion.div
                      key={bridge._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                      onClick={() => setSelectedBridge(bridge)}
                      className={`group relative p-3 rounded-xl border cursor-pointer transition-all ${selectedBridge?._id === bridge._id
                        ? 'bg-blue-600/20 border-blue-500/50'
                        : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                        }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-3">
                          <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 shadow-inner bg-black/20">
                            <BridgeImage from={bridge.fromCountry} to={bridge.toCountry} type="preview" className="object-cover" />
                          </div>
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${bridge.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'}`} />
                              <span className="font-bold text-secondary text-sm sm:text-base">{bridge.fromCountry} ↔ {bridge.toCountry}</span>
                            </div>
                            <span className="text-label text-neutral-500 font-medium">{t('bridges.bridge_of_peace')}</span>
                          </div>
                        </div>
                        <span className={`text-tiny font-bold uppercase px-2 py-0.5 rounded-md ${bridge.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {bridge.status === 'completed' ? t('bridges.ready') : `${Math.round((bridge.currentStones / bridge.requiredStones) * 100)}%`}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-tiny text-neutral-400">
                        <span>👤 {bridge.contributors[0]?.user?.nickname || t('common.unknown')}</span>
                        <span>{bridge.requiredStones.toLocaleString()} {t('units.km')}</span>
                      </div>
                      {bridge.status !== 'completed' && (
                        <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: `${(bridge.currentStones / bridge.requiredStones) * 100}%` }} />
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
                {!isLoading && bridges.length > 0 && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => void fetchBridges({ append: true, pageOverride: page + 1 })}
                      disabled={!hasMore || isLoadingMore}
                      className={`w-full rounded-xl border px-4 py-3 text-tiny font-bold uppercase tracking-widest transition-all ${(!hasMore || isLoadingMore)
                        ? 'border-white/10 bg-white/5 text-white/40 cursor-not-allowed'
                        : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'}`}
                    >
                      {isLoadingMore ? t('common.loading') : hasMore ? t('bridges.show_more') : t('bridges.all_shown')}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Details or Stats - Stacked below list on portrait tablets */}
            <div className={`${isLandscape ? 'lg:col-span-1' : 'col-span-1'} flex flex-col min-h-0`}>
              <AnimatePresence mode="wait">
                {selectedBridge ? (
                  <motion.div
                    key={selectedBridge._id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col flex-1 min-h-0"
                  >
                    {/* Image */}
                    <div className="relative h-32 sm:h-36 shrink-0">
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
                      <BridgeImage from={selectedBridge.fromCountry} to={selectedBridge.toCountry} type="preview" className="object-cover" />
                      <button
                        onClick={() => setSelectedBridge(null)}
                        className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white z-20 text-sm"
                      >×</button>
                      <div className="absolute bottom-2 left-3 z-20">
                        <h2 className="text-h3 text-white">{selectedBridge.fromCountry} ↔ {selectedBridge.toCountry}</h2>
                        <div className={`text-tiny font-bold px-1.5 py-0.5 rounded-md inline-block ${selectedBridge.status === 'completed' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                          {selectedBridge.status === 'completed' ? t('bridges.built') : t('bridges.building_status')}
                        </div>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-0">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/5 p-2.5 rounded-xl text-center">
                          <div className="text-tiny text-neutral-500 uppercase">{t('bridges.progress')}</div>
                          <div className="text-secondary font-bold text-blue-400">{Math.round((selectedBridge.currentStones / selectedBridge.requiredStones) * 100)}%</div>
                        </div>
                        <div className="bg-white/5 p-2.5 rounded-xl text-center">
                          <div className="text-tiny text-neutral-500 uppercase">{t('bridges.length')}</div>
                          <div className="text-secondary font-bold text-purple-400">{selectedBridge.requiredStones.toLocaleString()} {t('units.km')}</div>
                        </div>
                      </div>

                      {selectedBridge.status === 'completed' ? (
                        <div className="bg-green-900/20 border border-green-500/20 p-3 rounded-xl text-center space-y-2">
                          <p className="text-green-300 text-secondary font-bold">🎉 {t('bridges.bridge_built')}</p>
                          <p className="text-tiny text-neutral-400">{t('bridges.created')}: {new Date(selectedBridge.createdAt).toLocaleDateString()}</p>
                          <button
                            onClick={() => setShowFullDetailsModal(true)}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-tiny font-bold uppercase tracking-widest"
                          >
                            {t('common.more')}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex justify-between text-secondary">
                            <span className="text-neutral-400">{t('bridges.stones_label')}:</span>
                            <span className="font-mono font-bold">{selectedBridge.currentStones.toLocaleString()} / {selectedBridge.requiredStones.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: `${(selectedBridge.currentStones / selectedBridge.requiredStones) * 100}%` }} />
                          </div>
                          <button
                            onClick={() => handleLayStone(selectedBridge._id)}
                            disabled={!user || user.sc < STONE_COST_SC || Boolean(pendingBridgeIds[selectedBridge._id]) || stonesToday >= existingStoneLimit}
                            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-50 rounded-xl font-bold text-secondary shadow-lg active:scale-[0.98] transition-all"
                          >
                            {pendingBridgeIds[selectedBridge._id] ? t('bridges.saving') : `🪨 ${t('bridges.lay_stone')} (${STONE_COST_SC} K)`}
                          </button>
                        </div>
                      )}

                      {/* Heroes */}
                      <div>
                        <h3 className="text-tiny font-bold text-neutral-400 uppercase mb-1.5">{t('bridges.heroes')}</h3>
                        <div className="space-y-1.5">
                          {selectedBridge.contributors.length > 0 ? selectedBridge.contributors.slice(0, 4).map((contributor, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                              <div className="flex items-center gap-2">
                                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-tiny font-bold ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-400 text-black' : 'bg-neutral-700 text-neutral-300'}`}>
                                  {idx + 1}
                                </div>
                                <span className="text-secondary">{contributor.user?.nickname || t('common.unknown')}</span>
                              </div>
                              <span className="text-tiny font-mono text-blue-400">{contributor.stones}</span>
                            </div>
                          )) : (
                            <p className="text-tiny text-neutral-500 italic text-center py-2">{t('bridges.be_first_hero')}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-center text-center flex-1"
                  >
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                      <span className="text-3xl">🌉</span>
                    </div>
                    <h3 className="text-secondary font-bold text-white uppercase tracking-widest mb-2">{t('bridges.select_bridge')}</h3>
                    <p className="text-tiny text-neutral-500 leading-relaxed">
                      {t('bridges.select_bridge_desc')}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* RIGHT AD BLOCK - Show only in landscape on large screens */}
        <StickySideAdRail adSlot={sideAdSlot} page="bridges" placement="bridges_sidebar_right" />

      </div>

      {/* MODALS */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl"
            >
              <h2 className="text-h2 text-white mb-4">{t('bridges.create_modal_title')}</h2>

              <div className="relative h-32 mb-6 rounded-2xl overflow-hidden border border-white/10">
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
                <BridgeImage from={countryFrom} to={countryTo} type="preview" className="object-cover" />
                <div className="absolute bottom-2 left-3 z-20 text-tiny font-bold uppercase tracking-widest text-white/90">
                  {t('bridges.direction_preview')}
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-tiny text-neutral-400 uppercase tracking-widest">
                  {t('bridges.limits_prefix')} {createdToday}/{newBridgeLimit}, {t('bridges.limits_existing_prefix')} {stonesToday}/{existingStoneLimit}.
                </div>
                {selectedBridgeDistance > 0 && (
                  <div className="rounded-2xl border border-blue-500/10 bg-blue-500/5 p-3 text-tiny text-blue-200 uppercase tracking-widest">
                    {t('bridges.selected_bridge_length_prefix')} {selectedBridgeDistance.toLocaleString()} {t('bridges.km_short')}
                  </div>
                )}
                <div>
                  <label className="block text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('bridges.from')}</label>
                  <div ref={fromDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFromDropdownOpen((prev) => !prev);
                        setIsToDropdownOpen(false);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-secondary text-slate-100 flex items-center justify-between gap-2 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <span className="truncate">{countryFrom}</span>
                      <span className="text-tiny text-neutral-400">{isFromDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    <AnimatePresence>
                      {isFromDropdownOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute z-50 mt-1 left-0 right-0 max-h-64 bg-neutral-950/95 border border-white/10 rounded-xl shadow-2xl overflow-y-auto"
                        >
                          {Object.keys(neighborsMap)
                            .filter(c => (neighborsMap[c]?.length || 0) > 0)
                            .sort()
                            .map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  setCountryFrom(c);
                                  setIsFromDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-secondary ${c === countryFrom
                                  ? 'bg-blue-600/40 text-white'
                                  : 'text-slate-100 hover:bg-white/10'
                                  }`}
                              >
                                {c}
                              </button>
                            ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                <div>
                  <label className="block text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('bridges.to')}</label>
                  <div ref={toDropdownRef} className="relative">
                    <button
                      type="button"
                      disabled={!availableToCountries.length}
                      onClick={() => {
                        if (!availableToCountries.length) return;
                        setIsToDropdownOpen((prev) => !prev);
                        setIsFromDropdownOpen(false);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-secondary text-slate-100 flex items-center justify-between gap-2 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="truncate">
                        {availableToCountries.length ? countryTo : t('bridges.no_available_countries')}
                      </span>
                      <span className="text-tiny text-neutral-400">{isToDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    <AnimatePresence>
                      {isToDropdownOpen && availableToCountries.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute z-50 mt-1 left-0 right-0 max-h-64 bg-neutral-950/95 border border-white/10 rounded-xl shadow-2xl overflow-y-auto"
                        >
                          {availableToCountries.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => {
                                setCountryTo(c);
                                setIsToDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-secondary ${c === countryTo
                                ? 'bg-blue-600/40 text-white'
                                : 'text-slate-100 hover:bg-white/10'
                                }`}
                            >
                              {c}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {availableToCountries.length === 0 && (
                    <p className="mt-1 text-tiny text-red-400">
                      {t('bridges.no_neighbors_for_country')}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-secondary uppercase tracking-widest transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCreateBridge}
                  disabled={!user || user.sc < NEW_BRIDGE_COST_SC || countryFrom === countryTo || isCreatingBridge || createdToday >= newBridgeLimit || !selectedBridgeDistance}
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-50 rounded-xl font-bold text-secondary uppercase tracking-widest shadow-lg transition-all active:scale-95"
                >
                  {isCreatingBridge ? t('bridges.creating') : `${t('bridges.create')} (${NEW_BRIDGE_COST_SC} K)`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showFullDetailsModal && selectedBridge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-h2 text-white">{t('bridges.history_title')}</h2>
                  <p className="text-neutral-500 text-tiny uppercase tracking-widest font-bold">{selectedBridge.fromCountry} ↔ {selectedBridge.toCountry}</p>
                </div>
                <button onClick={() => setShowFullDetailsModal(false)} className="text-2xl text-neutral-500 hover:text-white transition-colors">×</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
                {/* Image Column */}
                <div className="md:col-span-2 relative h-64 md:h-auto min-h-[300px] rounded-2xl overflow-hidden shadow-xl border border-white/5">
                  <BridgeImage
                    from={selectedBridge.fromCountry}
                    to={selectedBridge.toCountry}
                    type={selectedBridge.status === 'completed' ? 'full' : 'preview'}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                </div>

                {/* Details Column */}
                <div className="md:col-span-3 flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white/5 p-4 rounded-2xl">
                      <div className="text-tiny text-neutral-500 uppercase font-bold mb-1">{t('bridges.founder')}</div>
                      <div className="text-secondary font-bold text-blue-400 truncate">{selectedBridge.contributors[0]?.user?.nickname || t('common.unknown')}</div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-2xl">
                      <div className="text-tiny text-neutral-500 uppercase font-bold mb-1">{t('bridges.start_date')}</div>
                      <div className="text-secondary font-bold text-purple-400">{new Date(selectedBridge.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  {selectedBridge.status === 'completed' && (
                    <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl">
                      <div className="text-tiny text-green-500/50 uppercase font-bold mb-1">{t('bridges.end_date')}</div>
                      <div className="text-secondary font-bold text-green-400">{new Date(selectedBridge.updatedAt).toLocaleDateString()}</div>
                    </div>
                  )}
                  <div className="bg-white/5 p-4 rounded-2xl flex-1 flex flex-col min-h-[150px]">
                    <h3 className="text-secondary font-bold text-white uppercase tracking-widest mb-4 shrink-0">{t('bridges.top_builders')}</h3>
                    <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1">
                      {selectedBridge.contributors.sort((a, b) => b.stones - a.stones).map((contributor, idx) => (
                        <div key={idx} className="flex items-center justify-between pr-2">
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-tiny font-bold ${idx === 0 ? 'bg-yellow-500 text-black' : 'bg-white/10 text-neutral-400'}`}>
                              {idx + 1}
                            </span>
                            <span className="text-secondary font-medium text-neutral-200 truncate">{contributor.user?.nickname || t('common.unknown')}</span>
                          </div>
                          <span className="font-mono font-bold text-blue-400 text-tiny shrink-0">{contributor.stones} {t('bridges.stones_count')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setShowFullDetailsModal(false)}
                className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-secondary uppercase tracking-widest transition-colors"
              >
                {t('common.close')}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

