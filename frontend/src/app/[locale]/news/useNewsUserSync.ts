'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { useAuth } from '@/context/AuthContext';
import type { NewsCard } from './newsPageData';

type AuthState = ReturnType<typeof useAuth>;

type UseNewsUserSyncParams = {
    newsCard: NewsCard | null;
    updateUser: AuthState['updateUser'];
    user: AuthState['user'];
};

export function useNewsUserSync({
    newsCard,
    updateUser,
    user,
}: UseNewsUserSyncParams) {
    const userRef = useRef(user);
    const newsCardRef = useRef<NewsCard | null>(newsCard || null);
    const updateUserRef = useRef(updateUser);

    const syncUserNewsCard = useCallback((nextCard: NewsCard | null, k?: number) => {
        if (!user || !nextCard) return;
        updateUser({
            ...user,
            ...(typeof k === 'number' ? { k } : {}),
            newsCard: nextCard,
        });
    }, [updateUser, user]);

    const syncUserK = useCallback((k: number) => {
        if (!user) return;
        updateUser({ ...user, k });
    }, [updateUser, user]);

    const syncViewedProgress = useCallback((nextViewed: Set<string>, nextLastReadId: string | null) => {
        if (!user || !newsCard) return;
        updateUser({
            ...user,
            newsCard: {
                ...newsCard,
                viewedPostIds: Array.from(nextViewed).slice(-500),
                lastReadPostId: nextLastReadId,
            },
        });
    }, [newsCard, updateUser, user]);

    useEffect(() => {
        userRef.current = user;
        newsCardRef.current = newsCard || null;
        updateUserRef.current = updateUser;
    }, [newsCard, updateUser, user]);

    return {
        newsCardRef,
        syncUserK,
        syncUserNewsCard,
        syncViewedProgress,
        updateUserRef,
        userRef,
    };
}
