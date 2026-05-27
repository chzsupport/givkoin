import type { CachedNewsFeedResponse } from '@/utils/sessionWarmup';

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

export type NewsComment = {
    id: string;
    postId: string;
    content: string;
    createdAt: string;
    authorId: string | null;
    authorName: string;
};

export type NewsCard = {
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

export type NewsFeedResponse = {
    items: NewsPost[];
    nextCursor?: string | null;
    hasMore?: boolean;
    viewBatchKey?: string | null;
};

export const COMMENT_EDIT_WINDOW_MS = 60 * 60 * 1000;
export const COMMENTS_PAGE_SIZE = 5;
export const POSTS_PAGE_SIZE = 5;
export const VIEW_BATCH_INTERVAL_MS = 25000;
export const MAX_POSTS_IN_MEMORY = 20;

const LAST_READ_TTL_MS = 3 * 60 * 60 * 1000;
const LAST_READ_STORAGE_KEY = 'news_last_read';
const LEGACY_LAST_READ_STORAGE_KEY = 'news_last_read_id';

export function readStoredLastReadId() {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(LAST_READ_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const id = typeof parsed?.id === 'string' ? parsed.id : '';
            const ts = Number(parsed?.ts || 0);
            if (id && Number.isFinite(ts) && Date.now() - ts <= LAST_READ_TTL_MS) {
                return id;
            }
            localStorage.removeItem(LAST_READ_STORAGE_KEY);
        }
        if (localStorage.getItem(LEGACY_LAST_READ_STORAGE_KEY)) {
            localStorage.removeItem(LEGACY_LAST_READ_STORAGE_KEY);
        }
    } catch {
        localStorage.removeItem(LAST_READ_STORAGE_KEY);
        localStorage.removeItem(LEGACY_LAST_READ_STORAGE_KEY);
    }
    return null;
}

export function writeStoredLastReadId(id: string | null) {
    if (typeof window === 'undefined') return;
    try {
        if (!id) {
            localStorage.removeItem(LAST_READ_STORAGE_KEY);
            localStorage.removeItem(LEGACY_LAST_READ_STORAGE_KEY);
            return;
        }
        localStorage.setItem(LAST_READ_STORAGE_KEY, JSON.stringify({ id, ts: Date.now() }));
        localStorage.removeItem(LEGACY_LAST_READ_STORAGE_KEY);
    } catch {
        // ignore
    }
}

export function trimPostsForMemory(items: NewsPost[]) {
    if (!Array.isArray(items) || items.length <= MAX_POSTS_IN_MEMORY) return items;
    return items.slice(items.length - MAX_POSTS_IN_MEMORY);
}

export function extractViewBatchKeysFromCache(feed: CachedNewsFeedResponse | null | undefined) {
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
}

export function getClientNewsViewDateKey() {
    const d = new Date();
    if (d.getHours() === 0 && d.getMinutes() === 0) {
        d.setDate(d.getDate() - 1);
    }
    return d.toISOString().slice(0, 10);
}

export function decoratePostsWithNewsCard(items: NewsPost[], card: NewsCard | null) {
    const liked = new Set((card?.likedPostIds || []).filter(Boolean));
    const reposted = new Set((card?.repostedPostIds || []).filter(Boolean));
    const viewed = new Set((card?.viewedPostIds || []).filter(Boolean));
    return (Array.isArray(items) ? items : []).map((post) => ({
        ...post,
        isViewed: viewed.has(post._id),
        isLiked: liked.has(post._id),
        isReposted: reposted.has(post._id),
    }));
}

export function buildNextNewsCard(
    card: NewsCard | null,
    type: 'like' | 'comment' | 'repost',
    delta: number
) {
    if (!card) return null;
    const next = { ...card };
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
}

export function buildNextNewsCardWithPostMark(
    card: NewsCard | null,
    type: 'like' | 'repost',
    postId: string,
    enabled: boolean,
    delta = 0
) {
    const next = buildNextNewsCard(card, type, delta);
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
}
