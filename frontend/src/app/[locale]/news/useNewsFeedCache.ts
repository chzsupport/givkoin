'use client';

import { useCallback, useRef } from 'react';
import { setCachedNewsFeed } from '@/utils/sessionWarmup';
import {
    trimPostsForMemory,
    type NewsPost,
} from './newsPageData';

export function useNewsFeedCache(userId?: string) {
    const viewBatchKeyByPostIdRef = useRef<Record<string, string>>({});

    const rememberViewBatchKey = useCallback((
        items: NewsPost[],
        viewBatchKey?: string | null,
        opts: { replace?: boolean } = {}
    ) => {
        const next = opts.replace ? {} : { ...viewBatchKeyByPostIdRef.current };
        const safeKey = typeof viewBatchKey === 'string' ? viewBatchKey.trim() : '';
        if (safeKey) {
            items.forEach((post) => {
                if (post?._id) {
                    next[post._id] = safeKey;
                }
            });
        }
        viewBatchKeyByPostIdRef.current = next;
        return next;
    }, []);

    const syncNewsFeedCache = useCallback((items: NewsPost[], nextCursor: string | null, hasMore: boolean) => {
        if (!userId) return;
        setCachedNewsFeed(userId, {
            items: trimPostsForMemory(items),
            nextCursor,
            hasMore,
            viewBatchKeys: { ...viewBatchKeyByPostIdRef.current },
        });
    }, [userId]);

    return {
        rememberViewBatchKey,
        syncNewsFeedCache,
        viewBatchKeyByPostIdRef,
    };
}
