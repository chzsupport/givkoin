'use client';

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { useAuth } from '@/context/AuthContext';
import { apiGet } from '@/utils/api';
import {
    getCachedNewsFeed,
    setCachedNewsFeed,
} from '@/utils/sessionWarmup';
import {
    POSTS_PAGE_SIZE,
    decoratePostsWithNewsCard,
    extractViewBatchKeysFromCache,
    readStoredLastReadId,
    trimPostsForMemory,
    writeStoredLastReadId,
    type NewsCard,
    type NewsFeedResponse,
    type NewsPost,
} from './newsPageData';

type AuthState = ReturnType<typeof useAuth>;

type UseNewsInitialFeedParams = {
    newsCardRef: MutableRefObject<NewsCard | null>;
    rememberViewBatchKey: (items: NewsPost[], viewBatchKey?: string | null, opts?: { replace?: boolean }) => Record<string, string>;
    setLastReadId: Dispatch<SetStateAction<string | null>>;
    setLoading: Dispatch<SetStateAction<boolean>>;
    setPosts: Dispatch<SetStateAction<NewsPost[]>>;
    setPostsHasMore: Dispatch<SetStateAction<boolean>>;
    setPostsNextCursor: Dispatch<SetStateAction<string | null>>;
    setViewedPosts: Dispatch<SetStateAction<Set<string>>>;
    updateUserRef: MutableRefObject<AuthState['updateUser']>;
    userId?: string;
    userRef: MutableRefObject<AuthState['user']>;
    viewBatchKeyByPostIdRef: MutableRefObject<Record<string, string>>;
    viewedStorageKey: string;
};

function readViewedPostIdsFromStorage(viewedStorageKey: string) {
    try {
        const raw = localStorage.getItem(viewedStorageKey);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

export function useNewsInitialFeed({
    newsCardRef,
    rememberViewBatchKey,
    setLastReadId,
    setLoading,
    setPosts,
    setPostsHasMore,
    setPostsNextCursor,
    setViewedPosts,
    updateUserRef,
    userId,
    userRef,
    viewBatchKeyByPostIdRef,
    viewedStorageKey,
}: UseNewsInitialFeedParams) {
    const rememberViewBatchKeyRef = useRef(rememberViewBatchKey);

    useEffect(() => {
        rememberViewBatchKeyRef.current = rememberViewBatchKey;
    }, [rememberViewBatchKey]);

    useEffect(() => {
        const cachedFeed = userId ? getCachedNewsFeed(userId) : null;
        viewBatchKeyByPostIdRef.current = extractViewBatchKeysFromCache(cachedFeed);

        if (cachedFeed?.items?.length) {
            const currentNewsCard = newsCardRef.current;
            const decoratedCachedItems = trimPostsForMemory(decoratePostsWithNewsCard(cachedFeed.items, currentNewsCard));
            setPosts(decoratedCachedItems);
            setPostsNextCursor(cachedFeed.nextCursor || null);
            setPostsHasMore(Boolean(cachedFeed.hasMore));
            setLoading(false);

            const viewedFromCache = new Set(
                ((currentNewsCard?.viewedPostIds || []).length
                    ? (currentNewsCard?.viewedPostIds || [])
                    : decoratedCachedItems.filter((post) => post.isViewed).map((post) => post._id))
            );
            setViewedPosts(viewedFromCache);
        }

        const fetchNews = async () => {
            try {
                const newsData = await apiGet<NewsFeedResponse>(`/news?limit=${POSTS_PAGE_SIZE}`);
                const serverNewsCard = (newsData as Record<string, unknown>)?.newsCard as NewsCard | null ?? newsCardRef.current;
                const currentUser = userRef.current;
                if (serverNewsCard && currentUser) {
                    updateUserRef.current({ ...currentUser, newsCard: serverNewsCard });
                }
                const feedItems = trimPostsForMemory(decoratePostsWithNewsCard(Array.isArray(newsData?.items) ? newsData.items : [], serverNewsCard));
                const feedViewBatchKeys = rememberViewBatchKeyRef.current(feedItems, newsData?.viewBatchKey || null, { replace: true });
                setPosts(feedItems);
                setPostsNextCursor(newsData?.nextCursor || null);
                setPostsHasMore(Boolean(newsData?.hasMore));
                if (userId) {
                    setCachedNewsFeed(userId, {
                        ...newsData,
                        viewBatchKeys: feedViewBatchKeys,
                    });
                }

                const viewedFromBackend = new Set((serverNewsCard?.viewedPostIds || []).filter(Boolean));
                const viewedFromLocal = readViewedPostIdsFromStorage(viewedStorageKey);
                const mergedViewed = new Set(viewedFromBackend);
                for (const id of viewedFromLocal) mergedViewed.add(id);
                setViewedPosts(mergedViewed);

                const cardLastReadId = typeof serverNewsCard?.lastReadPostId === 'string' ? serverNewsCard.lastReadPostId : null;
                if (cardLastReadId) {
                    writeStoredLastReadId(cardLastReadId);
                    setLastReadId(cardLastReadId);
                } else {
                    const savedLastReadId = readStoredLastReadId();
                    if (savedLastReadId && feedItems.some((post) => post._id === savedLastReadId)) {
                        setLastReadId(savedLastReadId);
                    }
                }
            } catch (e) {
                console.error('Failed to fetch news:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchNews();
    }, [
        newsCardRef,
        setLastReadId,
        setLoading,
        setPosts,
        setPostsHasMore,
        setPostsNextCursor,
        setViewedPosts,
        updateUserRef,
        userId,
        userRef,
        viewBatchKeyByPostIdRef,
        viewedStorageKey,
    ]);
}
