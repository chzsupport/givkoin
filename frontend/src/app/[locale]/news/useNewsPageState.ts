'use client';

import { useState } from 'react';
import {
    readStoredLastReadId,
    type NewsPost,
} from './newsPageData';

export function useNewsPageState() {
    const [posts, setPosts] = useState<NewsPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMorePosts, setLoadingMorePosts] = useState(false);
    const [viewedPosts, setViewedPosts] = useState<Set<string>>(new Set());
    const [lastReadId, setLastReadId] = useState<string | null>(() => readStoredLastReadId());
    const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
    const [postsHasMore, setPostsHasMore] = useState(false);

    return {
        lastReadId,
        loading,
        loadingMorePosts,
        posts,
        postsHasMore,
        postsNextCursor,
        setLastReadId,
        setLoading,
        setLoadingMorePosts,
        setPosts,
        setPostsHasMore,
        setPostsNextCursor,
        setViewedPosts,
        viewedPosts,
    };
}
