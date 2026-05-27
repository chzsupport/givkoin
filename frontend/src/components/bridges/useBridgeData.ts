import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '@/utils/api';
import {
  getCachedBridgeList,
  getCachedBridgeStats,
  setCachedBridgeList,
  setCachedBridgeStats,
} from '@/utils/sessionWarmup';
import { mergeBridgeItems } from './bridgeUtils';
import type { Bridge, BridgesResponse, BridgeStatsResponse, BridgeTab } from './types';

type UseBridgeDataParams = {
  activeTab: BridgeTab;
  userId: string;
};

export function useBridgeData({ activeTab, userId }: UseBridgeDataParams) {
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<Bridge | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [bridgeStats, setBridgeStatsState] = useState<BridgeStatsResponse | null>(null);
  const pageRef = useRef(1);
  const paginationRef = useRef<BridgesResponse['pagination']>(undefined);
  const bridgesRef = useRef<Bridge[]>([]);
  const pendingMutationsRef = useRef(0);

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
        limit: '5',
      });
      if (statusQuery) {
        query.set('status', statusQuery);
      }
      const data = await apiGet<BridgesResponse>(`${basePath}?${query.toString()}`);
      if (silent && pendingMutationsRef.current > 0) {
        return;
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

    void fetchBridges({ pageOverride: 1, tabOverride: activeTab });
    void fetchBridgeStats({ silent: true });
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (pendingMutationsRef.current > 0) {
        return;
      }
      if (pageRef.current === 1) {
        void fetchBridges({ silent: true, pageOverride: 1, tabOverride: activeTab });
        void fetchBridgeStats({ silent: true });
      }
    }, 10000);

    return () => {
      clearInterval(interval);
    };
  }, [activeTab, fetchBridgeStats, fetchBridges, userId]);

  return {
    bridges,
    setBridges,
    selectedBridge,
    setSelectedBridge,
    isLoading,
    isLoadingMore,
    page,
    hasMore,
    bridgeStats,
    paginationRef,
    pendingMutationsRef,
    persistBridgeStats,
    persistBridgeList,
    fetchBridgeStats,
    fetchBridges,
  };
}
