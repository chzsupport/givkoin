'use client';

import { useEffect, type MutableRefObject } from 'react';

type UseNewsViewedPersistenceParams = {
    lastReadId: string | null;
    lastReadIdRef: MutableRefObject<string | null>;
    viewedPosts: Set<string>;
    viewedPostsRef: MutableRefObject<Set<string>>;
    viewedStorageKey: string;
};

export function useNewsViewedPersistence({
    lastReadId,
    lastReadIdRef,
    viewedPosts,
    viewedPostsRef,
    viewedStorageKey,
}: UseNewsViewedPersistenceParams) {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const arr = Array.from(viewedPosts);
            localStorage.setItem(viewedStorageKey, JSON.stringify(arr.slice(0, 500)));
        } catch {
            return;
        }
    }, [viewedPosts, viewedStorageKey]);

    useEffect(() => {
        viewedPostsRef.current = viewedPosts;
    }, [viewedPosts, viewedPostsRef]);

    useEffect(() => {
        lastReadIdRef.current = lastReadId;
    }, [lastReadId, lastReadIdRef]);
}
