'use client';

import { PageBackground } from '@/components/PageBackground';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useState, useEffect, useRef, useCallback } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, apiPostKeepalive } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { AdBlock } from '@/components/AdBlock';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { ArrowUp, Eye, BookOpen, Newspaper } from 'lucide-react';
import { PageTitle } from '@/components/PageTitle';
import { NewsMediaBlock } from '@/components/news/NewsMediaBlock';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedField } from '@/i18n/localizedContent';
import {
    type CachedNewsFeedResponse,
    getCachedNewsFeed,
    setCachedNewsFeed,
} from '@/utils/sessionWarmup';

export type NewsPost = {
    _id: string;
    title: string;
    content: string;
    translations?: {
        en?: {
            title?: string;
            content?: string;
        };
    };
    publishedAt: string;
    mediaUrl?: string;
    author?: string;
    tags?: string[];
    stats?: {
        likes: number;
        comments: number;
        reposts: number;
    };
    isViewed?: boolean;
    isLiked?: boolean;
    isReposted?: boolean;
};

type NewsComment = {
    id: string;
    postId: string;
    content: string;
    createdAt: string;
    authorId: string | null;
    authorName: string;
};

type NewsCard = {
    dateKey: string;
    likesPerPost: number;
    repostsPerPost: number;
    commentsPerPost: number;
    dailyLikesLimit: number;
    dailyCommentsLimit: number;
    dailyRepostsLimit: number;
    dailyLikesUsed: number;
    dailyCommentsUsed: number;
    dailyRepostsUsed: number;
    dailyLikesLeft: number;
    dailyCommentsLeft: number;
    dailyRepostsLeft: number;
    likedPostIds?: string[];
    repostedPostIds?: string[];
    viewedPostIds?: string[];
    lastReadPostId?: string | null;
};

type NewsFeedResponse = {
    items: NewsPost[];
    nextCursor?: string | null;
    hasMore?: boolean;
    viewBatchKey?: string | null;
};

const COMMENT_EDIT_WINDOW_MS = 60 * 60 * 1000;
const COMMENTS_PAGE_SIZE = 5;
const POSTS_PAGE_SIZE = 5;
const VIEW_BATCH_INTERVAL_MS = 25000;

export default function NewsPage() {
    const { refreshUser, updateUser, user } = useAuth();
    const { language, t, localePath } = useI18n();
    const toast = useToast();
    const [posts, setPosts] = useState<NewsPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMorePosts, setLoadingMorePosts] = useState(false);
    const [windowWidth, setWindowWidth] = useState(0);
    const [adWidth, setAdWidth] = useState(300);
    const [adHeight, setAdHeight] = useState(600);
    const [viewedPosts, setViewedPosts] = useState<Set<string>>(new Set());
    const [lastReadId, setLastReadId] = useState<string | null>(() => {
        // Восстанавливаем позицию чтения из localStorage
        if (typeof window !== 'undefined') {
            return localStorage.getItem('news_last_read_id');
        }
        return null;
    });
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [postsNextCursor, setPostsNextCursor] = useState<string | null>(null);
    const [postsHasMore, setPostsHasMore] = useState(false);
    const [pendingActionsByPostId, setPendingActionsByPostId] = useState<Record<string, { like?: boolean; repost?: boolean }>>({});

    const [commentOpenForPostId, setCommentOpenForPostId] = useState<string | null>(null);
    const [commentDraftByPostId, setCommentDraftByPostId] = useState<Record<string, string>>({});
    const [commentSubmittingForPostId, setCommentSubmittingForPostId] = useState<string | null>(null);
    const [commentsByPostId, setCommentsByPostId] = useState<Record<string, NewsComment[]>>({});
    const [commentsNextCursorByPostId, setCommentsNextCursorByPostId] = useState<Record<string, string | null>>({});
    const [commentsHasMoreByPostId, setCommentsHasMoreByPostId] = useState<Record<string, boolean>>({});
    const [commentsLoadingByPostId, setCommentsLoadingByPostId] = useState<Record<string, boolean>>({});
    const [commentsLoadingMoreByPostId, setCommentsLoadingMoreByPostId] = useState<Record<string, boolean>>({});
    const [commentsErrorByPostId, setCommentsErrorByPostId] = useState<Record<string, string | null>>({});
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentDraft, setEditingCommentDraft] = useState('');
    const [repostModalOpen, setRepostModalOpen] = useState<string | null>(null);

    const containerRef = useRef<HTMLDivElement>(null);
    const feedRef = useRef<HTMLDivElement>(null);
    const postsRef = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const hasUserScrolledRef = useRef(false);
    const scrollInitTimeRef = useRef<number>(typeof window !== 'undefined' ? Date.now() : 0);
    const pendingViewIdsRef = useRef<Set<string>>(new Set());
    const viewFlushInFlightRef = useRef(false);
    const viewedPostsRef = useRef<Set<string>>(new Set());
    const currentReadPostIdRef = useRef<string | null>(null);
    const viewBatchKeyByPostIdRef = useRef<Record<string, string>>({});
    const userId = user?._id || user?.id;
    const isAdmin = user?.role === 'admin';
    const newsCard = (user?.newsCard || null) as NewsCard | null;

    const extractViewBatchKeysFromCache = (feed: CachedNewsFeedResponse | null | undefined) => {
        const direct = feed?.viewBatchKeys;
        if (direct && typeof direct === 'object') {
            const normalized = Object.entries(direct).reduce<Record<string, string>>((acc, [postId, key]) => {
                if (postId && typeof key === 'string' && key.trim()) {
                    acc[postId] = key;
                }
                return acc;
            }, {});
            if (Object.keys(normalized).length > 0) {
                return normalized;
            }
        }

        const fallbackKey = typeof feed?.viewBatchKey === 'string' ? feed.viewBatchKey.trim() : '';
        if (!fallbackKey || !Array.isArray(feed?.items)) {
            return {};
        }

        return feed.items.reduce<Record<string, string>>((acc, post) => {
            if (post?._id) {
                acc[post._id] = fallbackKey;
            }
            return acc;
        }, {});
    };

    const rememberViewBatchKey = (
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
    };

    const syncNewsFeedCache = (items: NewsPost[], nextCursor: string | null, hasMore: boolean) => {
        if (!userId) return;
        setCachedNewsFeed(userId, {
            items,
            nextCursor,
            hasMore,
            viewBatchKeys: { ...viewBatchKeyByPostIdRef.current },
        });
    };

    const getClientNewsViewDateKey = () => {
        const d = new Date();
        if (d.getHours() === 0 && d.getMinutes() === 0) {
            d.setDate(d.getDate() - 1);
        }
        return d.toISOString().slice(0, 10);
    };

    const viewedStorageKey = `news_viewed_post_ids_${getClientNewsViewDateKey()}`;

    const likesPerPost = newsCard?.likesPerPost ?? 1;
    const commentsPerPost = newsCard?.commentsPerPost ?? 3;
    const repostsPerPost = newsCard?.repostsPerPost ?? 1;
    const dailyLikesLimit = newsCard?.dailyLikesLeft ?? 24;
    const dailyCommentsLimit = newsCard?.dailyCommentsLeft ?? 72;
    const dailyRepostsLimit = newsCard?.dailyRepostsLeft ?? 24;

    const decoratePostsWithNewsCard = (items: NewsPost[], card: NewsCard | null) => {
        const liked = new Set((card?.likedPostIds || []).filter(Boolean));
        const reposted = new Set((card?.repostedPostIds || []).filter(Boolean));
        const viewed = new Set((card?.viewedPostIds || []).filter(Boolean));
        return (Array.isArray(items) ? items : []).map((post) => ({
            ...post,
            isViewed: viewed.has(post._id),
            isLiked: liked.has(post._id),
            isReposted: reposted.has(post._id),
        }));
    };

    const buildNextNewsCard = (type: 'like' | 'comment' | 'repost', delta: number) => {
        if (!newsCard) return null;
        const next = { ...newsCard };
        if (type === 'like') {
            next.dailyLikesUsed = Math.max(0, next.dailyLikesUsed + delta);
            next.dailyLikesLeft = Math.max(0, next.dailyLikesLimit - next.dailyLikesUsed);
        }
        if (type === 'comment') {
            next.dailyCommentsUsed = Math.max(0, next.dailyCommentsUsed + delta);
            next.dailyCommentsLeft = Math.max(0, next.dailyCommentsLimit - next.dailyCommentsUsed);
        }
        if (type === 'repost') {
            next.dailyRepostsUsed = Math.max(0, next.dailyRepostsUsed + delta);
            next.dailyRepostsLeft = Math.max(0, next.dailyRepostsLimit - next.dailyRepostsUsed);
        }
        return next;
    };

    const buildNextNewsCardWithPostMark = (
        type: 'like' | 'repost',
        postId: string,
        enabled: boolean,
        delta = 0
    ) => {
        const next = buildNextNewsCard(type, delta);
        if (!next) return null;
        if (type === 'like') {
            const liked = new Set((next.likedPostIds || []).filter(Boolean));
            if (enabled) {
                liked.add(postId);
            } else {
                liked.delete(postId);
            }
            next.likedPostIds = Array.from(liked);
            return next;
        }
        const reposted = new Set((next.repostedPostIds || []).filter(Boolean));
        if (enabled) {
            reposted.add(postId);
        } else {
            reposted.delete(postId);
        }
        next.repostedPostIds = Array.from(reposted);
        return next;
    };

    const syncUserNewsCard = (nextCard: NewsCard | null, sc?: number) => {
        if (!user || !nextCard) return;
        updateUser({
            ...user,
            ...(typeof sc === 'number' ? { sc } : {}),
            newsCard: nextCard,
        });
    };

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

    const getPostTitle = useCallback((post: NewsPost) => {
        return getLocalizedField(post.title, post.translations, 'title', language);
    }, [language]);

    const getPostContent = useCallback((post: NewsPost) => {
        return getLocalizedField(post.content, post.translations, 'content', language);
    }, [language]);

    // Layout helper: Desktop if wider than 1024px (excludes iPad Pro Portrait which is exactly 1024px)
    // Or if exactly 1024px but Landscape (e.g. old monitors)
    const isDesktop = Boolean(getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0));

    useEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            setWindowWidth(w);
            const h = window.innerHeight;

            const sideAdSlot = getResponsiveSideAdSlot(w, h);
            setAdWidth(sideAdSlot?.width ?? 300);
            setAdHeight(sideAdSlot?.height ?? 600);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, [viewedStorageKey]);

    useEffect(() => {
        const cachedFeed = userId ? getCachedNewsFeed(userId) : null;
        viewBatchKeyByPostIdRef.current = extractViewBatchKeysFromCache(cachedFeed);

        if (cachedFeed?.items?.length) {
            const decoratedCachedItems = decoratePostsWithNewsCard(cachedFeed.items, newsCard);
            setPosts(decoratedCachedItems);
            setPostsNextCursor(cachedFeed.nextCursor || null);
            setPostsHasMore(Boolean(cachedFeed.hasMore));
            setLoading(false);

            const viewedFromCache = new Set(
                ((newsCard?.viewedPostIds || []).length
                    ? (newsCard?.viewedPostIds || [])
                    : decoratedCachedItems.filter((post) => post.isViewed).map((post) => post._id))
            );
            setViewedPosts(viewedFromCache);
        }
        const fetchNews = async () => {
            try {
                const newsData = await apiGet<NewsFeedResponse>(`/news?limit=${POSTS_PAGE_SIZE}`);
                // Берём newsCard из ответа /news если есть, иначе из user
                const serverNewsCard = (newsData as Record<string, unknown>)?.newsCard as NewsCard | null ?? newsCard;
                if (serverNewsCard && user) {
                    updateUser({ ...user, newsCard: serverNewsCard });
                }
                const feedItems = decoratePostsWithNewsCard(Array.isArray(newsData?.items) ? newsData.items : [], serverNewsCard);
                const feedViewBatchKeys = rememberViewBatchKey(feedItems, newsData?.viewBatchKey || null, { replace: true });
                setPosts(feedItems);
                setPostsNextCursor(newsData?.nextCursor || null);
                setPostsHasMore(Boolean(newsData?.hasMore));
                if (userId) {
                    setCachedNewsFeed(userId, {
                        ...newsData,
                        viewBatchKeys: feedViewBatchKeys,
                    });
                }

                // Initialize viewed posts from backend data
                const viewedFromBackend = new Set((newsCard?.viewedPostIds || []).filter(Boolean));
                // Merge with localStorage fallback
                let viewedFromLocal: string[] = [];
                try {
                    const raw = localStorage.getItem(viewedStorageKey);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        if (Array.isArray(parsed)) {
                            viewedFromLocal = parsed.filter((x) => typeof x === 'string');
                        }
                    }
                } catch {
                    // ignore
                }

                const mergedViewed = new Set(viewedFromBackend);
                for (const id of viewedFromLocal) mergedViewed.add(id);
                setViewedPosts(mergedViewed);

                const cardLastReadId = typeof newsCard?.lastReadPostId === 'string' ? newsCard.lastReadPostId : null;
                if (cardLastReadId) {
                    localStorage.setItem('news_last_read_id', cardLastReadId);
                    setLastReadId(cardLastReadId);
                } else {
                    const savedLastReadId = localStorage.getItem('news_last_read_id');
                    if (savedLastReadId && feedItems.some(p => p._id === savedLastReadId)) {
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
    }, [userId, viewedStorageKey, newsCard]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const arr = Array.from(viewedPosts);
            localStorage.setItem(viewedStorageKey, JSON.stringify(arr.slice(0, 500)));
        } catch {
            // ignore
        }
    }, [viewedPosts, viewedStorageKey]);

    useEffect(() => {
        viewedPostsRef.current = viewedPosts;
    }, [viewedPosts]);

    useEffect(() => {
        pendingViewIdsRef.current.clear();
        if (!userId || typeof window === 'undefined') return undefined;

        const flushViews = async (useKeepalive = false) => {
            if (viewFlushInFlightRef.current) return;
            const ids = Array.from(pendingViewIdsRef.current);
            if (ids.length === 0) return;

            const groups = new Map<string, string[]>();
            const idsWithoutKey: string[] = [];
            ids.forEach((id) => {
                const viewBatchKey = viewBatchKeyByPostIdRef.current[id];
                if (!viewBatchKey) {
                    idsWithoutKey.push(id);
                    return;
                }
                const existing = groups.get(viewBatchKey) || [];
                existing.push(id);
                groups.set(viewBatchKey, existing);
            });
            if (groups.size === 0) return;

            viewFlushInFlightRef.current = true;
            pendingViewIdsRef.current.clear();
            idsWithoutKey.forEach((id) => pendingViewIdsRef.current.add(id));
            try {
                for (const [viewBatchKey, groupedIds] of groups.entries()) {
                    try {
                        if (useKeepalive) {
                            await apiPostKeepalive('/news/views', {
                                postIds: groupedIds,
                                viewBatchKey,
                                lastReadPostId: currentReadPostIdRef.current,
                            });
                        } else {
                            await apiPost('/news/views', {
                                postIds: groupedIds,
                                viewBatchKey,
                                lastReadPostId: currentReadPostIdRef.current,
                            });
                        }
                    } catch {
                        groupedIds.forEach((id) => pendingViewIdsRef.current.add(id));
                    }
                }
            } catch {
                ids.forEach((id) => pendingViewIdsRef.current.add(id));
            } finally {
                viewFlushInFlightRef.current = false;
            }
        };

        const intervalId = window.setInterval(() => {
            flushViews(false);
        }, VIEW_BATCH_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushViews(true);
            }
        };

        const handleBeforeUnload = () => {
            flushViews(true);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushViews(true);
        };
    }, [userId, viewedStorageKey]);

    useEffect(() => {
        setEditingCommentId(null);
        setEditingCommentDraft('');
    }, [commentOpenForPostId]);

    const handleLoadMorePosts = async () => {
        if (loadingMorePosts || !postsHasMore || !postsNextCursor) return;
        setLoadingMorePosts(true);
        try {
            const data = await apiGet<NewsFeedResponse>(`/news?limit=${POSTS_PAGE_SIZE}&cursor=${encodeURIComponent(postsNextCursor)}`);
            const nextItems = decoratePostsWithNewsCard(Array.isArray(data?.items) ? data.items : [], newsCard);
            rememberViewBatchKey(nextItems, data?.viewBatchKey || null);
            setPosts(prev => {
                const seen = new Set(prev.map((post) => post._id));
                const appended = nextItems.filter((post) => !seen.has(post._id));
                const merged = [...prev, ...appended];
                if (userId) {
                    syncNewsFeedCache(merged, data?.nextCursor || null, Boolean(data?.hasMore));
                }
                return merged;
            });
            setPostsNextCursor(data?.nextCursor || null);
            setPostsHasMore(Boolean(data?.hasMore));
            if (nextItems.length > 0) {
                setViewedPosts(prev => {
                    const next = new Set(prev);
                    nextItems.forEach((post) => {
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

    // Scroll handler
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

                // Calculate position relative to the container's top
                // If elementRect.top is close to containerRect.top, we've scrolled to it.
                // We want to show the button when the 4th post is close to the top or we've scrolled past the top of it.
                // Let's say if the 4th post is within the viewport or above.

                // Position of element top relative to container top
                const relativeTop = elementRect.top - containerRect.top;

                // If relativeTop is less than half the container height, we are definitely reading it or past it.
                // Or user simplified: "appear on 4th post".
                // Let's make it appear when the 4th post enters the top half of the screen.
                // Or simply: whenever we have scrolled past the start of the 4th post?
                // "на 3-м посте она исчезает" -> implies strict boundary.

                // If we use scrollTop:
                // scrollTop is correct if container is relative.
                // Let's stick to scrollTop but read offsetTop directly from element without parent math.
                // offsetParent of 'el' should be 'feedRef' (because expected relative) or 'containerRef'.

                // Let's use a coordinate based approach which is foolproof.
                // If the top of the 4th post is LESS THAN the bottom of the container?
                // "appear... after 3rd post".
                // Means when 4th post is visible?

                // Let's set threshold to be: When the TOP of the 4th post passes the BOTTOM of the viewport? (It appears)
                // Or when the TOP of the 4th post passes the TOP of the viewport? (We are fully into it)

                // User said: "appear on 4th post if scroll down".
                // Let's show it when the 4th post top edge is near the top of the scroll view (+- some buffer).

                // If relativeTop <= containerRect.height / 2 (It's in the upper half or above)
                setShowScrollTop(relativeTop <= containerRect.height - 100);
            }
        };

        scrollTarget.addEventListener('scroll', handleScroll);
        handleScroll(); // Check immediately

        return () => {
            scrollTarget.removeEventListener('scroll', handleScroll);
        };
    }, [loading, posts, isDesktop]);

    // Фиксируем первый реальный пользовательский скролл отдельно.
    // Это позволяет сохранить кнопку "Продолжить чтение" и не сбивать позицию при первом открытии.
    useEffect(() => {
        if (loading || posts.length === 0) return;
        const scrollTarget = isDesktop ? feedRef.current : containerRef.current;
        if (!scrollTarget) return;

        const handleScroll = (e?: Event) => {
            const isScrollable = scrollTarget.scrollHeight > scrollTarget.clientHeight + 1;
            const windowScrollTop =
                window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
            const currentScrollTop = isScrollable ? scrollTarget.scrollTop : windowScrollTop;

            const now = Date.now();
            const isAfterInit = now - scrollInitTimeRef.current > 500;
            const isTrusted = typeof e === 'object' && e !== null && 'isTrusted' in e ? Boolean((e as Event).isTrusted) : false;

            if (!hasUserScrolledRef.current && isAfterInit && isTrusted && currentScrollTop > 30) {
                hasUserScrolledRef.current = true;
            }
        };

        scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            scrollTarget.removeEventListener('scroll', handleScroll);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [loading, posts.length, isDesktop]);

    // Помечаем просмотренные посты через "линию чтения", а не через постоянный обход всех карточек на каждом скролле.
    useEffect(() => {
        if (loading || posts.length === 0) return;
        const scrollTarget = isDesktop ? feedRef.current : containerRef.current;
        if (!scrollTarget) return;

        const postIds = posts.map((post) => post._id);
        const intersectingIds = new Set<string>();
        const containerHeight = scrollTarget.clientHeight || window.innerHeight;
        const readLineOffset = Math.max(120, Math.min(260, Math.round(containerHeight * 0.2)));
        const lineHeight = 2;
        const bottomInset = Math.max(0, containerHeight - readLineOffset - lineHeight);
        const rootMargin = `-${readLineOffset}px 0px -${bottomInset}px 0px`;

        const applyCurrentReadPost = (currentPostId: string | null) => {
            if (!currentPostId) return;
            if (!hasUserScrolledRef.current) {
                return;
            }
            if (currentReadPostIdRef.current === currentPostId) return;
            currentReadPostIdRef.current = currentPostId;

            const currentIndex = postIds.indexOf(currentPostId);
            if (currentIndex < 0) return;

            if (!viewedPostsRef.current.has(currentPostId)) {
                setLastReadId((prev) => {
                    if (prev !== currentPostId) {
                        localStorage.setItem('news_last_read_id', currentPostId);
                        return currentPostId;
                    }
                    return prev;
                });
            }

            const idsToMark = postIds.slice(0, currentIndex).filter((id) => !viewedPostsRef.current.has(id));
            if (idsToMark.length === 0) {
                if (newsCard && newsCard.lastReadPostId !== currentPostId) {
                    syncViewedProgress(new Set(viewedPostsRef.current), currentPostId);
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
                localStorage.setItem('news_last_read_id', id);
            });
            setViewedPosts(nextViewed);
            syncViewedProgress(nextViewed, currentPostId);
        };

        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    const postId = entry.target.getAttribute('data-id');
                    if (!postId) return;
                    if (entry.isIntersecting) {
                        intersectingIds.add(postId);
                    } else {
                        intersectingIds.delete(postId);
                    }
                });

                for (const id of postIds) {
                    if (intersectingIds.has(id)) {
                        applyCurrentReadPost(id);
                        return;
                    }
                }
            },
            {
                root: scrollTarget,
                rootMargin,
                threshold: 0,
            }
        );

        postIds.forEach((postId) => {
            const el = postsRef.current[postId];
            if (el) {
                observer.observe(el);
            }
        });

        return () => {
            observer.disconnect();
            currentReadPostIdRef.current = null;
        };
    }, [loading, posts, isDesktop, newsCard, syncViewedProgress, userId]);

    const scrollToTop = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
        }

        // Try standard smooth scroll on container (Mobile)
        if (containerRef.current) {
            containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
            setTimeout(() => {
                if (containerRef.current && containerRef.current.scrollTop > 0) {
                    containerRef.current.scrollTop = 0;
                }
            }, 100);
        }

        // Global fallback
        window.scrollTo({ top: 0, behavior: 'smooth' });
        document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
        document.body.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const scrollToLastRead = () => {
        const firstUnviewedId = posts.find(p => !viewedPosts.has(p._id))?._id || null;
        const targetId = firstUnviewedId || lastReadId;
        if (targetId && posts.some(p => p._id === targetId) && postsRef.current[targetId]) {
            postsRef.current[targetId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
        }

        if (targetId && posts.some(p => p._id === targetId)) {
            const el = document.querySelector(`[data-id="${targetId}"]`) as HTMLElement | null;
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    const loadComments = async (postId: string, opts: { append?: boolean } = {}) => {
        const append = Boolean(opts.append);
        const cursor = append ? commentsNextCursorByPostId[postId] : null;
        if (append && !cursor) {
            setCommentsHasMoreByPostId(prev => ({ ...prev, [postId]: false }));
            return;
        }
        const setLoading = append ? setCommentsLoadingMoreByPostId : setCommentsLoadingByPostId;

        setLoading(prev => ({ ...prev, [postId]: true }));
        setCommentsErrorByPostId(prev => ({ ...prev, [postId]: null }));
        try {
            const params = new URLSearchParams();
            params.set('limit', String(COMMENTS_PAGE_SIZE));
            if (cursor) {
                params.set('cursor', cursor);
            }
            const res = await apiGet<{ comments: NewsComment[]; nextCursor?: string; hasMore?: boolean }>(
                `/news/${postId}/comments?${params.toString()}`
            );
            setCommentsByPostId(prev => ({
                ...prev,
                [postId]: append ? [...(prev[postId] || []), ...(res.comments || [])] : (res.comments || []),
            }));
            setCommentsNextCursorByPostId(prev => ({ ...prev, [postId]: res.nextCursor || null }));
            setCommentsHasMoreByPostId(prev => ({ ...prev, [postId]: Boolean(res.hasMore) }));
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            setCommentsErrorByPostId(prev => ({ ...prev, [postId]: message || t('news.failed_load_comments') }));
        } finally {
            setLoading(prev => ({ ...prev, [postId]: false }));
        }
    };

    const handleToggleComments = (postId: string) => {
        if (commentOpenForPostId === postId) {
            setCommentOpenForPostId(null);
            return;
        }
        setCommentOpenForPostId(postId);
        loadComments(postId);
    };

    const handleLoadMoreComments = (postId: string) => {
        if (commentsLoadingMoreByPostId[postId]) return;
        loadComments(postId, { append: true });
    };

    const handleRepostClick = (postId: string) => {
        setRepostModalOpen(postId);
    };

    const buildShareUrl = (post: NewsPost, socialNetwork: string) => {
        const postTitle = getPostTitle(post);
        const postContent = getPostContent(post);
        const text = encodeURIComponent(`${postTitle}\n\n${postContent.slice(0, 200)}...`);
        const url = encodeURIComponent(window.location.origin + '/news');

        switch (socialNetwork) {
            case 'twitter':
                return `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
            case 'facebook':
                return `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
            case 'vk':
                return `https://vk.com/share.php?url=${url}&title=${encodeURIComponent(postTitle)}&description=${text}`;
            case 'ok':
                return `https://connect.ok.ru/offer?url=${url}&title=${encodeURIComponent(postTitle)}&description=${text}`;
            case 'telegram':
                return `https://t.me/share/url?url=${url}&text=${text}`;
            case 'whatsapp':
                return `https://wa.me/?text=${text}%20${url}`;
            case 'wechat':
                return `https://api.wechat.com/cgi-bin/mass/send?text=${text}%20${url}`;
            case 'reddit':
                return `https://reddit.com/submit?url=${url}&title=${encodeURIComponent(postTitle)}`;
            case 'threads':
                return `https://threads.net/intent/post?text=${text}%20${url}`;
            case 'mastodon':
                return `https://mastodon.social/share?text=${text}%20${url}`;
            case 'bastyon':
                return `https://bastyon.com/share?text=${text}%20${url}`;
            case 'line':
                return `https://social-plugins.line.me/lineit/share?url=${url}&text=${text}`;
            case 'viber':
                return `viber://forward?text=${text}%20${url}`;
            case 'discord':
                return `https://discord.com/channels/@me?text=${text}%20${url}`;
            case 'ameba':
                return `https://blog.ameba.jp/entry/new?text=${text}%20${url}`;
            case 'bluesky':
                return `https://bsky.app/intent/compose?text=${text}%20${url}`;
            case 'gab':
                return `https://gab.com/compose?url=${url}&text=${text}`;
            case 'weibo':
                return `https://service.weibo.com/share/share.php?url=${url}&title=${encodeURIComponent(postTitle)}&content=${text}`;
            case 'band':
                return `https://band.us/plugin/share?url=${url}&text=${text}`;
            case 'taringa':
                return `https://taringa.net/share?url=${url}&title=${encodeURIComponent(postTitle)}&text=${text}`;
            default:
                return '';
        }
    };

    const handleRepostToSocial = async (postId: string, socialNetwork: string) => {
        const post = posts.find(p => p._id === postId);
        if (!post) {
            setRepostModalOpen(null);
            return;
        }

        const shareUrl = buildShareUrl(post, socialNetwork);
        if (!shareUrl) {
            toast.error(t('common.error'), t('news.failed_prepare_repost'));
            setRepostModalOpen(null);
            return;
        }

        const shareWindow = window.open('', '_blank', 'width=600,height=400');
        try {
            const ok = await handleAction(postId, 'repost', { repostChannel: socialNetwork });
            if (!ok) {
                shareWindow?.close();
                return;
            }
            if (shareWindow) {
                shareWindow.location.href = shareUrl;
            } else {
                window.open(shareUrl, '_blank', 'width=600,height=400');
            }
        } catch (e: unknown) {
            shareWindow?.close();
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('news.repost_error'));
        } finally {
            setRepostModalOpen(null);
        }
    };

    const handleAction = async (
        postId: string,
        type: 'like' | 'comment' | 'repost',
        options: { repostChannel?: string } = {}
    ) => {
        if (type !== 'like' && type !== 'repost') return false;
        if (pendingActionsByPostId[postId]?.[type]) return false;
        if (type === 'repost' && !options.repostChannel) {
            toast.error(t('common.error'), t('news.select_network_first'));
            return false;
        }

        const previousPost = posts.find((post) => post._id === postId);
        if (!previousPost) return false;
        const wasLiked = Boolean(previousPost.isLiked);
        const wasReposted = Boolean(previousPost.isReposted);
        if (type === 'like' && !wasLiked && newsCard && newsCard.dailyLikesLeft <= 0) {
            toast.info(t('news.limits'), t('news.likes_ended'));
            return false;
        }
        if (type === 'repost' && previousPost.isReposted) {
            toast.info(t('news.already_reposted'), t('news.repost_already_counted'));
            return false;
        }
        if (type === 'repost' && newsCard && newsCard.dailyRepostsLeft <= 0) {
            toast.info(t('news.limits'), t('news.reposts_ended'));
            return false;
        }

        setPendingActionsByPostId(prev => ({
            ...prev,
            [postId]: {
                ...(prev[postId] || {}),
                [type]: true,
            },
        }));
        setPosts(prev => {
            const next = prev.map((p) => {
                if (p._id !== postId) return p;
                const stats = p.stats || { likes: 0, comments: 0, reposts: 0 };
                if (type === 'like') {
                    return {
                        ...p,
                        isLiked: !wasLiked,
                        stats: {
                            ...stats,
                            likes: Math.max(0, (stats.likes || 0) + (wasLiked ? -1 : 1)),
                        },
                    };
                }
                return {
                    ...p,
                    isReposted: true,
                    stats: { ...stats, reposts: (stats.reposts || 0) + 1 },
                };
            });
            if (userId) {
                syncNewsFeedCache(next, postsNextCursor, postsHasMore);
            }
            return next;
        });

        try {
            const res = await apiPost<{ awarded?: number; sc?: number; liked?: boolean; isReposted?: boolean; removed?: boolean }>(
                `/news/${postId}/actions`,
                {
                    type,
                    ...(type === 'repost' && options.repostChannel ? { channel: options.repostChannel } : {}),
                }
            );
            const awarded =
                typeof res === 'object' && res !== null
                    ? Number(res.awarded)
                    : NaN;
            const grantedCard = buildNextNewsCardWithPostMark(
                type,
                postId,
                type === 'like' ? Boolean(res.liked) : Boolean(res.isReposted ?? true),
                Number.isFinite(awarded) && awarded > 0 ? 1 : 0
            );

            setPosts((prev) => {
                const next = prev.map((p) => {
                    if (p._id !== postId) return p;
                    return {
                        ...p,
                        isLiked: type === 'like' ? Boolean(res.liked) : p.isLiked,
                        isReposted: type === 'repost' ? Boolean(res.isReposted ?? true) : p.isReposted,
                    };
                });
                if (userId) {
                    syncNewsFeedCache(next, postsNextCursor, postsHasMore);
                }
                return next;
            });

            if (typeof res.sc === 'number' && grantedCard) {
                syncUserNewsCard(grantedCard, res.sc);
            } else if (typeof res.sc === 'number' && user) {
                updateUser({ ...user, sc: res.sc });
            } else {
                refreshUser().catch(() => { });
            }

            if (type === 'like' && res.removed) {
                toast.info(t('news.like_removed'), t('news.mark_updated'));
            } else if (Number.isFinite(awarded) && awarded > 0) {
                toast.success(`+${awarded} K`, t('news.action_done'));
            } else {
                toast.success(t('common.done'), type === 'like' ? t('news.like_updated') : t('news.repost_counted'));
            }
            return true;
        } catch (e: unknown) {
            setPosts(prev => {
                const next = prev.map((p) => {
                    if (p._id !== postId) return p;
                    const stats = p.stats || { likes: 0, comments: 0, reposts: 0 };
                    if (type === 'like') {
                        return {
                            ...p,
                            isLiked: wasLiked,
                            stats: {
                                ...stats,
                                likes: Math.max(0, (stats.likes || 0) + (wasLiked ? 1 : -1)),
                            },
                        };
                    }
                    return {
                        ...p,
                        isReposted: wasReposted,
                        stats: { ...stats, reposts: Math.max(0, (stats.reposts || 0) - 1) },
                    };
                });
                if (userId) {
                    syncNewsFeedCache(next, postsNextCursor, postsHasMore);
                }
                return next;
            });
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('news.action_error'));
            return false;
        } finally {
            setPendingActionsByPostId(prev => ({
                ...prev,
                [postId]: {
                    ...(prev[postId] || {}),
                    [type]: false,
                },
            }));
        }
    };

    const handleSubmitComment = async (postId: string) => {
        const content = (commentDraftByPostId[postId] || '').trim();
        if (!content) {
            toast.error(t('common.error'), t('news.enter_comment'));
            return;
        }
        if (newsCard && newsCard.dailyCommentsLeft <= 0) {
            toast.info(t('news.limits'), t('news.comments_ended'));
            return;
        }

        const optimisticCommentId = `tmp_${postId}_${Date.now()}`;
        const optimisticComment: NewsComment = {
            id: optimisticCommentId,
            postId,
            content,
            createdAt: new Date().toISOString(),
            authorId: userId || null,
            authorName: user?.nickname || t('news.you'),
        };

        setCommentSubmittingForPostId(postId);
        setCommentDraftByPostId(prev => ({ ...prev, [postId]: '' }));
        setPosts(prev => {
            const next = prev.map((p) => {
                if (p._id !== postId) return p;
                const stats = p.stats || { likes: 0, comments: 0, reposts: 0 };
                return { ...p, stats: { ...stats, comments: (stats.comments || 0) + 1 } };
            });
            if (userId) {
                syncNewsFeedCache(next, postsNextCursor, postsHasMore);
            }
            return next;
        });
        setCommentsByPostId(prev => {
            if (!(postId in prev) && commentOpenForPostId !== postId) {
                return prev;
            }
            return {
                ...prev,
                [postId]: [optimisticComment, ...(prev[postId] || [])],
            };
        });

        try {
            const res = await apiPost<{
                awarded?: number;
                sc?: number;
                comment?: NewsComment;
            }>(`/news/${postId}/actions`, { type: 'comment', content });
            const awarded =
                typeof res === 'object' && res !== null && 'awarded' in res
                    ? Number((res as { awarded?: unknown }).awarded)
                    : NaN;
            toast.success(`+${Number.isFinite(awarded) ? awarded : 0} K`, t('news.comment_sent'));
            const grantedCard = Number.isFinite(awarded) && awarded > 0
                ? buildNextNewsCard('comment', 1)
                : newsCard;
            if (typeof res?.sc === 'number' && grantedCard) {
                syncUserNewsCard(grantedCard, res.sc);
            } else if (typeof res?.sc === 'number' && user) {
                updateUser({ ...user, sc: res.sc });
            } else {
                refreshUser().catch(() => { });
            }

            if (res?.comment) {
                setCommentsByPostId(prev => ({
                    ...prev,
                    [postId]: (prev[postId] || []).map((comment) => (
                        comment.id === optimisticCommentId ? res.comment as NewsComment : comment
                    )),
                }));
            }
        } catch (e: unknown) {
            setCommentDraftByPostId(prev => ({ ...prev, [postId]: content }));
            setPosts(prev => {
                const next = prev.map((p) => {
                    if (p._id !== postId) return p;
                    const stats = p.stats || { likes: 0, comments: 0, reposts: 0 };
                    return { ...p, stats: { ...stats, comments: Math.max(0, (stats.comments || 0) - 1) } };
                });
                if (userId) {
                    syncNewsFeedCache(next, postsNextCursor, postsHasMore);
                }
                return next;
            });
            setCommentsByPostId(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).filter((comment) => comment.id !== optimisticCommentId),
            }));
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('news.comment_send_error'));
        } finally {
            setCommentSubmittingForPostId(null);
        }
    };

    const handleEditComment = (comment: NewsComment) => {
        setEditingCommentId(comment.id);
        setEditingCommentDraft(comment.content);
    };

    const handleSaveComment = async (postId: string, commentId: string) => {
        const content = editingCommentDraft.trim();
        if (!content) {
            toast.error(t('common.error'), t('news.enter_comment_text'));
            return;
        }
        try {
            const res = await apiPatch<{ comment: NewsComment }>(`/news/${postId}/comments/${commentId}`, { content });
            setCommentsByPostId(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).map((c) => (c.id === commentId ? res.comment : c)),
            }));
            setEditingCommentId(null);
            setEditingCommentDraft('');
            toast.success(t('news.comment_updated'));
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('news.comment_update_error'));
        }
    };

    const handleDeleteComment = async (postId: string, commentId: string) => {
        try {
            await apiDelete(`/news/${postId}/comments/${commentId}`);
            setCommentsByPostId(prev => ({
                ...prev,
                [postId]: (prev[postId] || []).filter((c) => c.id !== commentId),
            }));
            setPosts(prev => prev.map(p => {
                if (p._id !== postId) return p;
                const stats = p.stats || { likes: 0, comments: 0, reposts: 0 };
                return { ...p, stats: { ...stats, comments: Math.max(0, (stats.comments || 0) - 1) } };
            }));
            toast.success(t('news.comment_deleted'));
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : '';
            toast.error(t('common.error'), message || t('news.comment_delete_error'));
        }
    };

    return (
        <div className="relative h-full w-full overflow-hidden flex flex-col">
            <PageBackground />

            {/* Правый плавающий рекламный блок - только для ПК в ландшафтном режиме */}
            <aside
                className={`${isDesktop ? 'flex' : 'hidden'} fixed right-0 top-16 h-[calc(100vh-4rem)] p-2 flex-col items-center justify-start z-20`}
                style={{ width: adWidth + 16 }}
            >
                <div
                    className="bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-lg flex flex-col overflow-hidden"
                    style={{ width: adWidth, height: adHeight }}
                >
                    <div className="text-tiny uppercase tracking-[0.35em] text-gray-600 font-semibold text-center px-1 py-2">
                        {t('landing.ad')}
                    </div>
                    <div className="flex-1 w-full border-t border-white/5">
                        <AdBlock
                            page="news"
                            placement="news_sidebar_right"
                            hideTitle
                            heightClass="h-full"
                            className="w-full h-full"
                        />
                    </div>
                </div>
            </aside>

            <div
                ref={containerRef}
                className={`relative z-10 flex-1 flex flex-col min-h-0 ${isDesktop ? 'overflow-hidden' : 'overflow-y-auto'}`}
                style={isDesktop ? { marginRight: adWidth + 16 } : {}}
            >
                <div className={`mx-auto w-full max-w-6xl 2xl:max-w-[1800px] px-4 sm:px-6 ${isDesktop ? 'px-10' : ''} 2xl:px-20 py-6 ${isDesktop ? 'py-8' : ''} 2xl:py-12 flex flex-col flex-1 min-h-0`}>
                    {/* Back Button */}
                    <div className="mb-6 shrink-0 flex justify-between items-center">
                        <Link
                            href={localePath('/tree')}
                            className="inline-flex items-center gap-2 px-6 py-3 2xl:px-8 2xl:py-4 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group"
                        >
                            <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.back_to_tree')}
                        </Link>

                        {/* Resume Reading Button */}
                        {posts.length > 0 && (
                            <button
                                onClick={scrollToLastRead}
                                className="flex items-center gap-2 px-4 py-3 bg-blue-500/20 border border-blue-500/30 rounded-xl text-blue-200 hover:bg-blue-500/30 transition-all text-tiny font-bold uppercase tracking-wider"
                            >
                                <BookOpen size={16} />
                                {t('news.continue_reading')}
                            </button>
                        )}
                    </div>

                    {/* Header Section */}
                    <div className="mb-8">
                        <PageTitle
                            title={t('news.title')}
                            Icon={Newspaper}
                            gradientClassName="from-blue-200 via-blue-400 to-cyan-300"
                            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-blue-300"
                            className="w-fit mx-auto"
                        />
                        <div className="text-tiny text-neutral-500 uppercase tracking-[0.4em] font-medium mt-2 2xl:mt-4 text-center">
                            {t('news.chronicles')}
                        </div>
                    </div>

                    {/* Main Layout */}
                    <div className={`flex ${isDesktop ? 'flex-row' : 'flex-col'} gap-8 2xl:gap-16 items-start flex-1 min-h-0`}>

                        {/* Left Column: News Feed */}
                        <div
                            ref={feedRef}
                            className={`${isDesktop ? 'flex-1 overflow-y-auto pr-4 pb-12' : 'w-full'} relative flex flex-col gap-6 2xl:gap-10 custom-scrollbar`}
                        >
                            {loading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400"></div>
                                </div>
                            ) : posts.length > 0 ? (
                                <>
                                    {posts.map((post, index) => {
                                        const postTitle = getPostTitle(post);
                                        const postContent = getPostContent(post);

                                        return (
                                        <div
                                            key={post._id}
                                            className="flex flex-col gap-6"
                                            ref={(el) => { postsRef.current[post._id] = el; }}
                                            data-id={post._id}
                                        >
                                            <motion.article
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: index * 0.1 }}
                                            className="bg-neutral-900/40 border border-white/10 backdrop-blur-xl rounded-[2rem] p-6 sm:p-8 2xl:p-12 shadow-2xl relative overflow-hidden group"
                                        >
                                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50 group-hover:bg-blue-400 transition-colors" />

                                            <div className="flex justify-between items-start mb-4 2xl:mb-6">
                                                <div className="flex flex-wrap items-center gap-3 text-tiny text-neutral-500 uppercase tracking-widest">
                                                    <span className="text-blue-400 font-bold">● {post.author || t('news.moderator')}</span>
                                                    <span>•</span>
                                                    <span>{new Date(post.publishedAt).toLocaleDateString()}</span>
                                                </div>

                                                {viewedPosts.has(post._id) && (
                                                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                                                        <Eye size={12} className="text-neutral-400" />
                                                        <span className="text-label text-neutral-500">{t('news.viewed')}</span>
                                                    </div>
                                                )}
                                            </div>

                                            <h2 className="text-h2 text-white mb-4 2xl:mb-6 group-hover:text-blue-200 transition-colors">
                                                {postTitle}
                                            </h2>

                                            <div className="flex flex-wrap gap-2 mb-6">
                                                {(post.tags || []).map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="px-3 py-1 2xl:px-4 2xl:py-2 bg-white/5 border border-white/10 rounded-full text-tiny text-neutral-400 font-medium"
                                                    >
                                                        #{tag}
                                                    </span>
                                                ))}
                                            </div>

                                            {post.mediaUrl && (
                                                <div className="mb-6 2xl:mb-10 rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                                                    <NewsMediaBlock url={post.mediaUrl} title={postTitle} />
                                                </div>
                                            )}

                                            <p className="text-body text-neutral-300 leading-relaxed mb-8 2xl:mb-12 whitespace-pre-line">
                                                {postContent}
                                            </p>

                                            <div className="flex flex-wrap items-center gap-4 sm:gap-6 2xl:gap-10 pt-6 2xl:pt-10 border-t border-white/5">
                                                <button
                                                    onClick={() => handleAction(post._id, 'like')}
                                                    disabled={Boolean(pendingActionsByPostId[post._id]?.like)}
                                                    className={`flex items-center gap-2 hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${post.isLiked ? 'text-emerald-300' : ''}`}
                                                >
                                                    <span className="text-lg 2xl:text-2xl">❤️</span>
                                                    <span className="text-body font-bold text-emerald-400">{post.stats?.likes || 0}</span>
                                                </button>
                                                <button
                                                    onClick={() => handleToggleComments(post._id)}
                                                    className="flex items-center gap-2 hover:scale-110 transition-transform"
                                                >
                                                    <span className="text-lg 2xl:text-2xl">💬</span>
                                                    <span className="text-body font-bold text-amber-400">{post.stats?.comments || 0}</span>
                                                </button>
                                                <button
                                                    onClick={() => handleRepostClick(post._id)}
                                                    disabled={Boolean(pendingActionsByPostId[post._id]?.repost) || Boolean(post.isReposted)}
                                                    className={`flex items-center gap-2 hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${post.isReposted ? 'text-blue-300' : ''}`}
                                                >
                                                    <span className="text-lg 2xl:text-2xl">🔁</span>
                                                    <span className="text-body font-bold text-blue-400">{post.stats?.reposts || 0}</span>
                                                </button>
                                            </div>

                                            {commentOpenForPostId === post._id && (
                                                <div className="mt-4 2xl:mt-6 rounded-2xl border border-white/10 bg-black/30 p-3 2xl:p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <div className="text-label text-neutral-500">{t('news.comments_label')}</div>
                                                        <div className="text-label text-neutral-600">
                                                            {post.stats?.comments ?? (commentsByPostId[post._id] || []).length}
                                                        </div>
                                                    </div>
                                                    <div className="space-y-2 max-h-64 2xl:max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                                                        {commentsLoadingByPostId[post._id] ? (
                                                            <div className="text-xs text-neutral-500">{t('news.loading_comments')}</div>
                                                        ) : commentsErrorByPostId[post._id] ? (
                                                            <div className="text-xs text-rose-300">{commentsErrorByPostId[post._id]}</div>
                                                        ) : (commentsByPostId[post._id] || []).length === 0 ? (
                                                            <div className="text-xs text-neutral-500">{t('news.no_comments_yet')}</div>
                                                        ) : (
                                                            <>
                                                                {(commentsByPostId[post._id] || []).map((comment) => {
                                                                    const isAuthor = userId && comment.authorId === userId;
                                                                    const canEdit = isAuthor
                                                                        && Date.now() - new Date(comment.createdAt).getTime() <= COMMENT_EDIT_WINDOW_MS;
                                                                    const isEditing = editingCommentId === comment.id;
                                                                    return (
                                                                        <div
                                                                            key={comment.id}
                                                                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                                                                        >
                                                                            <div className="flex items-start justify-between gap-2 text-label text-neutral-500">
                                                                                <div className="flex flex-wrap items-center gap-2">
                                                                                    <span className="text-emerald-200">{comment.authorName}</span>
                                                                                    <span>•</span>
                                                                                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                                                                                </div>
                                                                                <div className="flex items-center gap-2">
                                                                                    {canEdit && !isEditing && (
                                                                                        <button
                                                                                            onClick={() => handleEditComment(comment)}
                                                                                            className="text-caption font-semibold text-amber-300 hover:text-amber-200"
                                                                                        >
                                                                                            {t('common.edit')}
                                                                                        </button>
                                                                                    )}
                                                                                    {isAdmin && !isEditing && (
                                                                                        <button
                                                                                            onClick={() => handleDeleteComment(post._id, comment.id)}
                                                                                            className="text-caption font-semibold text-rose-300 hover:text-rose-200"
                                                                                        >
                                                                                            {t('common.delete')}
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {isEditing ? (
                                                                                <div className="mt-2 space-y-2">
                                                                                    <textarea
                                                                                        value={editingCommentDraft}
                                                                                        onChange={(e) => setEditingCommentDraft(e.target.value)}
                                                                                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                                                                        rows={3}
                                                                                    />
                                                                                    <div className="flex flex-wrap gap-2">
                                                                                        <button
                                                                                            onClick={() => handleSaveComment(post._id, comment.id)}
                                                                                            className="h-9 px-4 rounded-xl text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                                                                        >
                                                                                            {t('common.save')}
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => { setEditingCommentId(null); setEditingCommentDraft(''); }}
                                                                                            className="h-9 px-4 rounded-xl text-xs font-semibold border border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10"
                                                                                        >
                                                                                            {t('common.cancel')}
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            ) : (
                                                                                <p className="mt-2 text-sm text-neutral-200 whitespace-pre-line" data-no-translate>
                                                                                    {comment.content}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                                {commentsHasMoreByPostId[post._id] && (
                                                                    <button
                                                                        onClick={() => handleLoadMoreComments(post._id)}
                                                                        disabled={commentsLoadingMoreByPostId[post._id]}
                                                                        className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-widest text-neutral-300 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                                                                    >
                                                                        {commentsLoadingMoreByPostId[post._id] ? t('common.loading') : t('news.load_more')}
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <div className="mt-4">
                                                        <div className="text-label text-neutral-500 mb-2">{t('news.your_comment')}</div>
                                                        <div className="flex flex-col sm:flex-row gap-2">
                                                            <input
                                                                value={commentDraftByPostId[post._id] || ''}
                                                                onChange={(e) => setCommentDraftByPostId(prev => ({ ...prev, [post._id]: e.target.value }))}
                                                                placeholder={t('news.write_comment')}
                                                                className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-body text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                                                            />
                                                            <button
                                                                onClick={() => handleSubmitComment(post._id)}
                                                                disabled={commentSubmittingForPostId === post._id}
                                                                className={`h-11 px-5 rounded-xl font-bold text-body transition-all border ${commentSubmittingForPostId === post._id
                                                                    ? 'bg-white/5 text-neutral-500 border-white/10 cursor-not-allowed'
                                                                    : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500/40 hover:brightness-110'
                                                                    }`}
                                                            >
                                                                {commentSubmittingForPostId === post._id ? '...' : t('common.send')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </motion.article>

                                            {(index + 1) % 3 === 0 && index !== posts.length - 1 && (
                                                <div className="w-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                                                    <div className="text-caption uppercase tracking-[0.3em] text-gray-600 text-center py-1">
                                                        {t('landing.ad')}
                                                    </div>
                                                    {isDesktop ? (
                                                        <AdBlock
                                                            page="news"
                                                            placement="inline"
                                                            hideTitle
                                                            heightClass="h-[70px]"
                                                            className="w-full"
                                                        />
                                                    ) : (
                                                        <AdaptiveAdWrapper
                                                            page="news"
                                                            placement="inline"
                                                            strategy="mobile_tablet_adaptive"
                                                            className="w-full mx-auto"
                                                        />
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )})}
                                    {postsHasMore && (
                                        <div className="flex justify-center pt-2">
                                            <button
                                                onClick={handleLoadMorePosts}
                                                disabled={loadingMorePosts}
                                                className="h-12 px-6 rounded-2xl border border-white/10 bg-white/5 text-sm font-bold uppercase tracking-[0.2em] text-neutral-200 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                                            >
                                                {loadingMorePosts ? t('common.loading') : t('news.show_more_5')}
                                            </button>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="text-center py-20 text-neutral-500 uppercase tracking-widest">
                                    {t('news.no_new_news')}
                                </div>
                            )}
                        </div>

                        {/* Right Column: Sidebar - компактная информация */}
                        <div className={`${isDesktop ? 'w-56' : 'w-full'} 2xl:w-72 flex flex-col gap-4 2xl:gap-6 shrink-0`}>

                            {/* Limits Card */}
                            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 2xl:p-6 backdrop-blur-md">
                                <h3 className="text-label 2xl:text-xs font-bold text-neutral-400 mb-3 2xl:mb-4 border-b border-white/5 pb-2">
                                    {t('news.limits')}
                                </h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-label text-neutral-400">{t('news.like')}</span>
                                        <span className="text-sm font-bold text-emerald-400">{likesPerPost}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-label text-neutral-400">{t('news.comments_short')}</span>
                                        <span className="text-sm font-bold text-amber-400">{commentsPerPost}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-label text-neutral-400">{t('news.repost')}</span>
                                        <span className="text-sm font-bold text-blue-400">{repostsPerPost}</span>
                                    </div>
                                </div>
                                <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-label text-neutral-400">{t('news.likes_per_day')}</span>
                                        <span className="text-sm font-bold text-emerald-400">{dailyLikesLimit}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-label text-neutral-400">{t('news.comments_per_day')}</span>
                                        <span className="text-sm font-bold text-amber-400">{dailyCommentsLimit}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-label text-neutral-400">{t('news.reposts_per_day')}</span>
                                        <span className="text-sm font-bold text-blue-400">{dailyRepostsLimit}</span>
                                    </div>
                                </div>
                                <p className="text-caption text-neutral-500 mt-3 2xl:mt-4 leading-relaxed italic">
                                    {t('news.per_post_hint')}
                                </p>
                            </div>

                            {/* Info Card */}
                            <div className="bg-blue-500/5 border border-blue-500/10 rounded-2xl p-4 2xl:p-6">
                                <h3 className="text-label 2xl:text-xs font-bold text-blue-400 mb-2 2xl:mb-3">{t('news.about_news')}</h3>
                                <p className="text-caption text-neutral-400 leading-relaxed">
                                    {t('news.news_updates')}
                                </p>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* Scroll to Top Button */}
            <button
                onClick={scrollToTop}
                className={`fixed bottom-6 right-6 z-[9999] cursor-pointer p-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full backdrop-blur-md text-white shadow-lg transition-all duration-300 transform active:scale-95 ${showScrollTop ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-10 pointer-events-none'}`}
                title={t('landing.up')}
            >
                <ArrowUp size={24} />
            </button>

            {/* Repost Modal */}
            {repostModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-neutral-900 border border-white/10 rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                        <h3 className="text-lg font-bold text-white mb-4">{t('news.select_social_repost')}</h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-6">
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'twitter')}
                                className="flex flex-col items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl hover:bg-blue-500/20 transition-all"
                            >
                                <span className="text-xl">𝕏</span>
                                <span className="text-xs text-blue-300">Twitter</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'facebook')}
                                className="flex flex-col items-center gap-2 p-3 bg-blue-600/10 border border-blue-600/20 rounded-xl hover:bg-blue-600/20 transition-all"
                            >
                                <span className="text-xl">f</span>
                                <span className="text-xs text-blue-300">Facebook</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'vk')}
                                className="flex flex-col items-center gap-2 p-3 bg-blue-700/10 border border-blue-700/20 rounded-xl hover:bg-blue-700/20 transition-all"
                            >
                                <span className="text-xl">{t('news.social_vk_short')}</span>
                                <span className="text-xs text-blue-300">{t('news.social_vk')}</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'ok')}
                                className="flex flex-col items-center gap-2 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl hover:bg-orange-500/20 transition-all"
                            >
                                <span className="text-xl">{t('news.social_ok_short')}</span>
                                <span className="text-xs text-orange-300">{t('news.social_ok')}</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'telegram')}
                                className="flex flex-col items-center gap-2 p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl hover:bg-sky-500/20 transition-all"
                            >
                                <span className="text-xl">✈️</span>
                                <span className="text-xs text-sky-300">Telegram</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'whatsapp')}
                                className="flex flex-col items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-xl hover:bg-green-500/20 transition-all"
                            >
                                <span className="text-xl">💬</span>
                                <span className="text-xs text-green-300">WhatsApp</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'wechat')}
                                className="flex flex-col items-center gap-2 p-3 bg-green-600/10 border border-green-600/20 rounded-xl hover:bg-green-600/20 transition-all"
                            >
                                <span className="text-xl">W</span>
                                <span className="text-xs text-green-300">WeChat</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'reddit')}
                                className="flex flex-col items-center gap-2 p-3 bg-orange-600/10 border border-orange-600/20 rounded-xl hover:bg-orange-600/20 transition-all"
                            >
                                <span className="text-xl">R</span>
                                <span className="text-xs text-orange-300">Reddit</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'threads')}
                                className="flex flex-col items-center gap-2 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl hover:bg-purple-500/20 transition-all"
                            >
                                <span className="text-xl">@</span>
                                <span className="text-xs text-purple-300">Threads</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'mastodon')}
                                className="flex flex-col items-center gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl hover:bg-indigo-500/20 transition-all"
                            >
                                <span className="text-xl">🐘</span>
                                <span className="text-xs text-indigo-300">Mastodon</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'bastyon')}
                                className="flex flex-col items-center gap-2 p-3 bg-yellow-600/10 border border-yellow-600/20 rounded-xl hover:bg-yellow-600/20 transition-all"
                            >
                                <span className="text-xl">B</span>
                                <span className="text-xs text-yellow-300">Bastyon</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'line')}
                                className="flex flex-col items-center gap-2 p-3 bg-green-700/10 border border-green-700/20 rounded-xl hover:bg-green-700/20 transition-all"
                            >
                                <span className="text-xl">L</span>
                                <span className="text-xs text-green-300">LINE</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'viber')}
                                className="flex flex-col items-center gap-2 p-3 bg-purple-600/10 border border-purple-600/20 rounded-xl hover:bg-purple-600/20 transition-all"
                            >
                                <span className="text-xl">V</span>
                                <span className="text-xs text-purple-300">Viber</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'discord')}
                                className="flex flex-col items-center gap-2 p-3 bg-indigo-600/10 border border-indigo-600/20 rounded-xl hover:bg-indigo-600/20 transition-all"
                            >
                                <span className="text-xl">💎</span>
                                <span className="text-xs text-indigo-300">Discord</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'ameba')}
                                className="flex flex-col items-center gap-2 p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl hover:bg-pink-500/20 transition-all"
                            >
                                <span className="text-xl">A</span>
                                <span className="text-xs text-pink-300">Ameba</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'bluesky')}
                                className="flex flex-col items-center gap-2 p-3 bg-sky-600/10 border border-sky-600/20 rounded-xl hover:bg-sky-600/20 transition-all"
                            >
                                <span className="text-xl">🔵</span>
                                <span className="text-xs text-sky-300">Bluesky</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'gab')}
                                className="flex flex-col items-center gap-2 p-3 bg-green-800/10 border border-green-800/20 rounded-xl hover:bg-green-800/20 transition-all"
                            >
                                <span className="text-xl">G</span>
                                <span className="text-xs text-green-300">Gab</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'weibo')}
                                className="flex flex-col items-center gap-2 p-3 bg-red-600/10 border border-red-600/20 rounded-xl hover:bg-red-600/20 transition-all"
                            >
                                <span className="text-xl">微</span>
                                <span className="text-xs text-red-300">Weibo</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'band')}
                                className="flex flex-col items-center gap-2 p-3 bg-blue-800/10 border border-blue-800/20 rounded-xl hover:bg-blue-800/20 transition-all"
                            >
                                <span className="text-xl">🎵</span>
                                <span className="text-xs text-blue-300">Band</span>
                            </button>
                            <button
                                onClick={() => handleRepostToSocial(repostModalOpen, 'taringa')}
                                className="flex flex-col items-center gap-2 p-3 bg-blue-900/10 border border-blue-900/20 rounded-xl hover:bg-blue-900/20 transition-all"
                            >
                                <span className="text-xl">T</span>
                                <span className="text-xs text-blue-300">Taringa</span>
                            </button>
                        </div>
                        <button
                            onClick={() => setRepostModalOpen(null)}
                            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-neutral-300 hover:bg-white/10 transition-all"
                        >
                            {t('common.cancel')}
                        </button>
                    </div>
                </div>
            )}

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(255, 255, 255, 0.05);
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.2);
                }
            `}</style>
        </div>
    );
}

