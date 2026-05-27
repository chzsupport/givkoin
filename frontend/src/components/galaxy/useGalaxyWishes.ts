import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/utils/api';
import { WISH_PAGE_SIZE } from './constants';
import type { Wish, WishFeedResponse, WishScope } from './types';
import { mapDtoToWish, mergeWishList } from './wishUtils';

type UseGalaxyWishesParams = {
  userId: string;
  refreshUser: () => unknown;
};

export function useGalaxyWishes({
  userId,
  refreshUser,
}: UseGalaxyWishesParams) {
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [wishPages, setWishPages] = useState({ others: 1, mine: 1 });
  const [wishHasMore, setWishHasMore] = useState({ others: false, mine: false });
  const [loadingMoreWishes, setLoadingMoreWishes] = useState<WishScope | null>(null);
  const [createdToday, setCreatedToday] = useState(0);
  const [fulfilledToday, setFulfilledToday] = useState(0);
  const [fulfilledThisMonth, setFulfilledThisMonth] = useState(0);

  const loadAll = useCallback(async () => {
    if (!userId) return;
    try {
      const [othersRes, mineRes, stats] = await Promise.all([
        apiGet<WishFeedResponse>(`/wishes?scope=others&page=1&limit=${WISH_PAGE_SIZE}`),
        apiGet<WishFeedResponse>(`/wishes?scope=mine&page=1&limit=${WISH_PAGE_SIZE}`),
        apiGet<{ createdToday: number; executedToday: number; executedLast30: number; userK?: number }>('/wishes/stats'),
      ]);

      const mappedOthers = (othersRes.wishes || []).map((wish) => mapDtoToWish(wish, userId));
      const mappedMine = (mineRes.wishes || []).map((wish) => mapDtoToWish(wish, userId));

      setWishes([...mappedMine, ...mappedOthers]);
      setWishPages({ others: 1, mine: 1 });
      setWishHasMore({
        others: Boolean(othersRes.pagination?.hasMore),
        mine: Boolean(mineRes.pagination?.hasMore),
      });
      setCreatedToday(stats.createdToday ?? 0);
      setFulfilledToday(stats.executedToday ?? 0);
      setFulfilledThisMonth(stats.executedLast30 ?? 0);
      refreshUser();
    } catch (error) {
      console.error('Failed to load wishes', error);
    }
  }, [refreshUser, userId]);

  const loadMoreWishes = useCallback(async (scope: WishScope) => {
    if (!userId || loadingMoreWishes || !wishHasMore[scope]) return;
    const nextPage = wishPages[scope] + 1;
    setLoadingMoreWishes(scope);
    try {
      const res = await apiGet<WishFeedResponse>(`/wishes?scope=${scope}&page=${nextPage}&limit=${WISH_PAGE_SIZE}`);
      const mapped = (res.wishes || []).map((wish) => mapDtoToWish(wish, userId));
      setWishes((prev) => mergeWishList(prev, mapped));
      setWishPages((prev) => ({ ...prev, [scope]: nextPage }));
      setWishHasMore((prev) => ({ ...prev, [scope]: Boolean(res.pagination?.hasMore) }));
    } catch (error) {
      console.error('Failed to load more wishes', error);
    } finally {
      setLoadingMoreWishes(null);
    }
  }, [loadingMoreWishes, userId, wishHasMore, wishPages]);

  useEffect(() => {
    if (userId) {
      void loadAll();
    }
  }, [loadAll, userId]);

  return {
    wishes,
    setWishes,
    wishHasMore,
    loadingMoreWishes,
    createdToday,
    setCreatedToday,
    fulfilledToday,
    setFulfilledToday,
    fulfilledThisMonth,
    setFulfilledThisMonth,
    loadMoreWishes,
  };
}
