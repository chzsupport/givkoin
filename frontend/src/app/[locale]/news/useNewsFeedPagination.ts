import type { Dispatch, SetStateAction } from 'react';
import { apiGet } from '@/utils/api';
import {
    POSTS_PAGE_SIZE,
    decoratePostsWithNewsCard,
    trimPostsForMemory,
    type NewsCard,
    type NewsFeedResponse,
    type NewsPost,
} from './newsPageData';

type NewsToast = {
    error: (title: string, message?: string) => void;
};

type LoadMorePostPagesParams = {
    currentPosts: NewsPost[];
    cursor: string | null;
    hasMore: boolean;
    maxAttempts: number;
    targetId?: string | null;
};

type UseNewsFeedPaginationParams = {
    loadingMorePosts: boolean;
    newsCard: NewsCard | null;
    posts: NewsPost[];
    postsHasMore: boolean;
    postsNextCursor: string | null;
    rememberViewBatchKey: (items: NewsPost[], viewBatchKey?: string | null, opts?: { replace?: boolean }) => Record<string, string>;
    setLoadingMorePosts: Dispatch<SetStateAction<boolean>>;
    setPosts: Dispatch<SetStateAction<NewsPost[]>>;
    setPostsHasMore: Dispatch<SetStateAction<boolean>>;
    setPostsNextCursor: Dispatch<SetStateAction<string | null>>;
    setViewedPosts: Dispatch<SetStateAction<Set<string>>>;
    syncNewsFeedCache: (items: NewsPost[], nextCursor: string | null, hasMore: boolean) => void;
    t: (key: string) => string;
    toast: NewsToast;
    userId?: string;
};

export function useNewsFeedPagination({
    loadingMorePosts,
    newsCard,
    posts,
    postsHasMore,
    postsNextCursor,
    rememberViewBatchKey,
    setLoadingMorePosts,
    setPosts,
    setPostsHasMore,
    setPostsNextCursor,
    setViewedPosts,
    syncNewsFeedCache,
    t,
    toast,
    userId,
}: UseNewsFeedPaginationParams) {
    const loadMorePostPages = async ({
        currentPosts,
        cursor,
        hasMore,
        maxAttempts,
        targetId = null,
    }: LoadMorePostPagesParams) => {
        let pageCursor: string | null = cursor;
        let nextCursor: string | null = cursor;
        let pageHasMore: boolean = hasMore;
        let loadedItems: NewsPost[] = [];
        let targetFound = Boolean(targetId && currentPosts.some((post) => post._id === targetId));
        const alreadyShown = new Set(currentPosts.map((post) => post._id));

        for (let attempt = 0; attempt < maxAttempts && pageCursor; attempt += 1) {
            const data: NewsFeedResponse = await apiGet<NewsFeedResponse>(`/news?limit=${POSTS_PAGE_SIZE}&cursor=${encodeURIComponent(pageCursor)}`);
            const pageItems = decoratePostsWithNewsCard(Array.isArray(data?.items) ? data.items : [], newsCard);
            rememberViewBatchKey(pageItems, data?.viewBatchKey || null);

            const freshItems = pageItems.filter((post) => {
                if (!post?._id || alreadyShown.has(post._id)) return false;
                alreadyShown.add(post._id);
                return true;
            });

            loadedItems = [...loadedItems, ...freshItems];
            targetFound = targetFound || Boolean(targetId && pageItems.some((post) => post._id === targetId));
            nextCursor = data?.nextCursor || null;
            pageHasMore = Boolean(data?.hasMore);

            if (targetId) {
                if (targetFound || !pageHasMore || !nextCursor || nextCursor === pageCursor) {
                    break;
                }
            } else if (freshItems.length > 0 || !pageHasMore || !nextCursor || nextCursor === pageCursor) {
                break;
            }

            pageCursor = nextCursor;
        }

        return {
            loadedItems,
            nextCursor,
            hasMore: pageHasMore,
            targetFound,
        };
    };

    const handleLoadMorePosts = async () => {
        if (loadingMorePosts || !postsHasMore || !postsNextCursor) return;
        setLoadingMorePosts(true);
        try {
            const page = await loadMorePostPages({
                currentPosts: posts,
                cursor: postsNextCursor,
                hasMore: postsHasMore,
                maxAttempts: 4,
            });

            setPosts(prev => {
                const seen = new Set(prev.map((post) => post._id));
                const appended = page.loadedItems.filter((post) => !seen.has(post._id));
                const merged = trimPostsForMemory([...prev, ...appended]);
                if (userId) {
                    syncNewsFeedCache(merged, page.nextCursor, page.hasMore);
                }
                return merged;
            });
            setPostsNextCursor(page.nextCursor);
            setPostsHasMore(page.hasMore);
            if (page.loadedItems.length > 0) {
                setViewedPosts(prev => {
                    const next = new Set(prev);
                    page.loadedItems.forEach((post) => {
                        if (post.isViewed) next.add(post._id);
                    });
                    return next;
                });
            }
        } catch (e) {
            console.error('Failed to load more news:', e);
            toast.error(t('common.error'), t('news.failed_load_more'));
        } finally {
            setLoadingMorePosts(false);
        }
    };

    return {
        handleLoadMorePosts,
        loadMorePostPages,
    };
}
