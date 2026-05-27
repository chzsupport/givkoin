import { useState, type Dispatch, type SetStateAction } from 'react';
import { apiPost } from '@/utils/api';
import {
    buildNextNewsCardWithPostMark,
    type NewsCard,
    type NewsPost,
} from './newsPageData';
import { buildNewsShareUrl } from './newsShare';

type NewsActionType = 'like' | 'comment' | 'repost';

type NewsToast = {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
};

type UseNewsActionsParams = {
    getPostContent: (post: NewsPost) => string;
    getPostTitle: (post: NewsPost) => string;
    newsCard: NewsCard | null;
    posts: NewsPost[];
    postsHasMore: boolean;
    postsNextCursor: string | null;
    refreshUser: () => Promise<void>;
    setPosts: Dispatch<SetStateAction<NewsPost[]>>;
    syncNewsFeedCache: (items: NewsPost[], nextCursor: string | null, hasMore: boolean) => void;
    syncUserK: (k: number) => void;
    syncUserNewsCard: (nextCard: NewsCard | null, k?: number) => void;
    t: (key: string) => string;
    toast: NewsToast;
    userId?: string;
};

export function useNewsActions({
    getPostContent,
    getPostTitle,
    newsCard,
    posts,
    postsHasMore,
    postsNextCursor,
    refreshUser,
    setPosts,
    syncNewsFeedCache,
    syncUserK,
    syncUserNewsCard,
    t,
    toast,
    userId,
}: UseNewsActionsParams) {
    const [pendingActionsByPostId, setPendingActionsByPostId] = useState<Record<string, { like?: boolean; repost?: boolean }>>({});
    const [repostModalOpen, setRepostModalOpen] = useState<string | null>(null);

    const handleAction = async (
        postId: string,
        type: NewsActionType,
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
            const res = await apiPost<{ awarded?: number; k?: number; liked?: boolean; isReposted?: boolean; removed?: boolean }>(
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
                newsCard,
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

            if (typeof res.k === 'number' && grantedCard) {
                syncUserNewsCard(grantedCard, res.k);
            } else if (typeof res.k === 'number') {
                syncUserK(res.k);
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

    const handleRepostClick = (postId: string) => {
        setRepostModalOpen(postId);
    };

    const handleRepostToSocial = async (postId: string, socialNetwork: string) => {
        const post = posts.find(p => p._id === postId);
        if (!post) {
            setRepostModalOpen(null);
            return;
        }

        const shareUrl = buildNewsShareUrl({
            title: getPostTitle(post),
            content: getPostContent(post),
            origin: window.location.origin,
            network: socialNetwork,
        });
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

    return {
        handleAction,
        handleRepostClick,
        handleRepostToSocial,
        pendingActionsByPostId,
        repostModalOpen,
        setRepostModalOpen,
    };
}
