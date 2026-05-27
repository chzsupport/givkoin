import { useEffect, useState, type Dispatch, type MouseEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { trimPostsForMemory, type NewsPost } from './newsPageData';

type NewsToast = {
    error: (title: string, message?: string) => void;
};

type LoadMorePostPages = (params: {
    currentPosts: NewsPost[];
    cursor: string | null;
    hasMore: boolean;
    maxAttempts: number;
    targetId?: string | null;
}) => Promise<{
    loadedItems: NewsPost[];
    nextCursor: string | null;
    hasMore: boolean;
    targetFound: boolean;
}>;

type UseNewsScrollControlsParams = {
    containerRef: RefObject<HTMLDivElement>;
    feedRef: RefObject<HTMLDivElement>;
    isDesktop: boolean;
    lastReadId: string | null;
    lastReadIdRef: MutableRefObject<string | null>;
    loading: boolean;
    loadingMorePosts: boolean;
    loadMorePostPages: LoadMorePostPages;
    posts: NewsPost[];
    postsHasMore: boolean;
    postsNextCursor: string | null;
    postsRef: MutableRefObject<Record<string, HTMLDivElement | null>>;
    setLoadingMorePosts: Dispatch<SetStateAction<boolean>>;
    setPosts: Dispatch<SetStateAction<NewsPost[]>>;
    setPostsHasMore: Dispatch<SetStateAction<boolean>>;
    setPostsNextCursor: Dispatch<SetStateAction<string | null>>;
    setViewedPosts: Dispatch<SetStateAction<Set<string>>>;
    syncNewsFeedCache: (items: NewsPost[], nextCursor: string | null, hasMore: boolean) => void;
    t: (key: string) => string;
    toast: NewsToast;
    userId?: string;
    viewedPosts: Set<string>;
};

export function useNewsScrollControls({
    containerRef,
    feedRef,
    isDesktop,
    lastReadId,
    lastReadIdRef,
    loading,
    loadingMorePosts,
    loadMorePostPages,
    posts,
    postsHasMore,
    postsNextCursor,
    postsRef,
    setLoadingMorePosts,
    setPosts,
    setPostsHasMore,
    setPostsNextCursor,
    setViewedPosts,
    syncNewsFeedCache,
    t,
    toast,
    userId,
    viewedPosts,
}: UseNewsScrollControlsParams) {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const scrollTarget = isDesktop ? feedRef.current : containerRef.current;
        if (!scrollTarget || loading) return;

        const handleScroll = () => {
            if (posts.length <= 3) {
                setShowScrollTop(false);
                return;
            }

            const fourthPost = posts[3];
            const el = postsRef.current[fourthPost._id];

            if (el) {
                const containerRect = scrollTarget.getBoundingClientRect();
                const elementRect = el.getBoundingClientRect();
                const relativeTop = elementRect.top - containerRect.top;
                setShowScrollTop(relativeTop <= containerRect.height - 100);
            }
        };

        scrollTarget.addEventListener('scroll', handleScroll);
        handleScroll();

        return () => {
            scrollTarget.removeEventListener('scroll', handleScroll);
        };
    }, [containerRef, feedRef, isDesktop, loading, posts, postsRef]);

    const scrollToTop = (e?: MouseEvent) => {
        if (e) {
            e.preventDefault();
        }

        if (containerRef.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
                if (containerRef.current && containerRef.current.scrollTop > 0) {
                    containerRef.current.scrollTop = 0;
                }
            }, 100);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollPostIntoView = (postId: string | null) => {
        if (!postId) return false;
        const refElement = postsRef.current[postId];
        if (refElement) {
            refElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        }

        const el = document.querySelector(`[data-id="${postId}"]`) as HTMLElement | null;
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        }
        return false;
    };

    const scrollToLastRead = async () => {
        if (loadingMorePosts) return;
        const firstUnviewedId = posts.find(p => !viewedPosts.has(p._id))?._id || null;
        const viewedLoadedPosts = posts.filter(p => viewedPosts.has(p._id));
        const loadedLastViewedId = viewedLoadedPosts.length > 0 ? viewedLoadedPosts[viewedLoadedPosts.length - 1]._id : null;
        const rememberedLastReadId = lastReadIdRef.current || lastReadId;
        const rememberedIsLoaded = Boolean(rememberedLastReadId && posts.some(p => p._id === rememberedLastReadId));
        const targetId = loadedLastViewedId || (rememberedIsLoaded ? rememberedLastReadId : null) || rememberedLastReadId || firstUnviewedId;
        if (!targetId) return;

        if (scrollPostIntoView(targetId)) {
            return;
        }

        if (!postsHasMore || !postsNextCursor) {
            return;
        }

        setLoadingMorePosts(true);
        try {
            const page = await loadMorePostPages({
                currentPosts: posts,
                cursor: postsNextCursor,
                hasMore: postsHasMore,
                maxAttempts: 30,
                targetId,
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

            window.setTimeout(() => {
                if (scrollPostIntoView(targetId)) return;
                const fallbackViewedPosts = [...posts, ...page.loadedItems].filter(p => viewedPosts.has(p._id) || p.isViewed);
                const fallbackId = fallbackViewedPosts.length > 0 ? fallbackViewedPosts[fallbackViewedPosts.length - 1]._id : null;
                scrollPostIntoView(fallbackId);
            }, 80);
        } catch (e) {
            console.error('Failed to continue reading:', e);
            toast.error(t('common.error'), t('news.failed_load_more'));
        } finally {
            setLoadingMorePosts(false);
        }
    };

    return {
        scrollToLastRead,
        scrollToTop,
        showScrollTop,
    };
}
