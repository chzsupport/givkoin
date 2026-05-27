import { useEffect, type Dispatch, type MutableRefObject, type RefObject, type SetStateAction } from 'react';
import { type NewsCard, type NewsPost, writeStoredLastReadId } from './newsPageData';

export function useNewsReadTracking({
    containerRef,
    currentReadPostIdRef,
    feedRef,
    hasNewsScrollRef,
    isDesktop,
    lastReadIdRef,
    loading,
    newsCard,
    pendingViewIdsRef,
    posts,
    postsRef,
    setLastReadId,
    setViewedPosts,
    syncViewedProgress,
    userId,
    viewedPostsRef,
}: {
    containerRef: RefObject<HTMLDivElement>;
    currentReadPostIdRef: MutableRefObject<string | null>;
    feedRef: RefObject<HTMLDivElement>;
    hasNewsScrollRef: MutableRefObject<boolean>;
    isDesktop: boolean;
    lastReadIdRef: MutableRefObject<string | null>;
    loading: boolean;
    newsCard: NewsCard | null;
    pendingViewIdsRef: MutableRefObject<Set<string>>;
    posts: NewsPost[];
    postsRef: MutableRefObject<{ [key: string]: HTMLDivElement | null }>;
    setLastReadId: Dispatch<SetStateAction<string | null>>;
    setViewedPosts: Dispatch<SetStateAction<Set<string>>>;
    syncViewedProgress: (nextViewed: Set<string>, nextLastReadId: string | null) => void;
    userId: string | undefined;
    viewedPostsRef: MutableRefObject<Set<string>>;
}) {
    useEffect(() => {
        if (loading || posts.length === 0) return;
        const scrollTarget = isDesktop ? feedRef.current : containerRef.current;
        if (!scrollTarget) return;

        const postIds = posts.map((post) => post._id);
        const applyCurrentReadPost = (currentPostId: string | null) => {
            if (!currentPostId) return;
            currentReadPostIdRef.current = currentPostId;

            const currentIndex = postIds.indexOf(currentPostId);
            if (currentIndex < 0) return;

            const previousLastReadId = lastReadIdRef.current;
            const nextLastReadId = currentPostId;

            if (previousLastReadId !== currentPostId) {
                lastReadIdRef.current = currentPostId;
                writeStoredLastReadId(currentPostId);
                setLastReadId(currentPostId);
            }

            const idsToMark = postIds.slice(0, currentIndex + 1).filter((id) => !viewedPostsRef.current.has(id));
            if (idsToMark.length === 0) {
                if (newsCard && newsCard.lastReadPostId !== nextLastReadId) {
                    syncViewedProgress(new Set(viewedPostsRef.current), nextLastReadId);
                }
                return;
            }

            const nextViewed = new Set(viewedPostsRef.current);
            idsToMark.forEach((id) => {
                if (nextViewed.has(id)) return;
                nextViewed.add(id);
                if (userId) {
                    pendingViewIdsRef.current.add(id);
                }
            });
            viewedPostsRef.current = nextViewed;
            setViewedPosts(nextViewed);
            syncViewedProgress(nextViewed, nextLastReadId);
        };

        let frameId = 0;
        const checkReadPosts = () => {
            if (!hasNewsScrollRef.current) return;
            const rootRect = scrollTarget.getBoundingClientRect();
            const targetScrolls = scrollTarget.scrollHeight > scrollTarget.clientHeight + 1;
            const rootTop = targetScrolls ? rootRect.top : 0;
            const rootBottom = targetScrolls ? rootRect.bottom : window.innerHeight;
            const viewportTop = rootTop + 8;
            const viewportBottom = rootBottom - 40;
            let deepestReadableId: string | null = null;

            for (let index = 0; index < postIds.length - 1; index += 1) {
                const currentId = postIds[index];
                const nextId = postIds[index + 1];
                const currentEl = postsRef.current[currentId];
                const nextEl = postsRef.current[nextId];
                if (!currentEl || !nextEl) continue;

                const currentRect = currentEl.getBoundingClientRect();
                const nextRect = nextEl.getBoundingClientRect();
                const currentWasScrolledThrough = currentRect.top < rootTop - 20;
                const nextStarted = nextRect.top >= viewportTop && nextRect.top <= viewportBottom;
                const nextAlreadyPassed = nextRect.top < viewportTop;

                if (currentWasScrolledThrough && (nextStarted || nextAlreadyPassed)) {
                    deepestReadableId = currentId;
                }
            }

            if (deepestReadableId) {
                applyCurrentReadPost(deepestReadableId);
            }
        };

        const scheduleCheck = () => {
            if (frameId) return;
            frameId = window.requestAnimationFrame(() => {
                frameId = 0;
                checkReadPosts();
            });
        };

        const handleScroll = () => {
            hasNewsScrollRef.current = true;
            scheduleCheck();
        };

        scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', scheduleCheck);

        return () => {
            if (frameId) {
                window.cancelAnimationFrame(frameId);
            }
            scrollTarget.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', handleScroll);
            window.removeEventListener('resize', scheduleCheck);
            currentReadPostIdRef.current = null;
        };
    }, [
        containerRef,
        currentReadPostIdRef,
        feedRef,
        hasNewsScrollRef,
        isDesktop,
        lastReadIdRef,
        loading,
        newsCard,
        pendingViewIdsRef,
        posts,
        postsRef,
        setLastReadId,
        setViewedPosts,
        syncViewedProgress,
        userId,
        viewedPostsRef,
    ]);
}
