import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/utils/api';
import {
    COMMENTS_PAGE_SIZE,
    buildNextNewsCard,
    type NewsCard,
    type NewsComment,
    type NewsPost,
} from './newsPageData';

type NewsToast = {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
};

type UseNewsCommentsParams = {
    newsCard: NewsCard | null;
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
    userNickname?: string;
};

export function useNewsComments({
    newsCard,
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
    userNickname,
}: UseNewsCommentsParams) {
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

    useEffect(() => {
        setEditingCommentId(null);
        setEditingCommentDraft('');
    }, [commentOpenForPostId]);

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
            authorName: userNickname || t('news.you'),
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
                k?: number;
                comment?: NewsComment;
            }>(`/news/${postId}/actions`, { type: 'comment', content });
            const awarded =
                typeof res === 'object' && res !== null && 'awarded' in res
                    ? Number((res as { awarded?: unknown }).awarded)
                    : NaN;
            toast.success(`+${Number.isFinite(awarded) ? awarded : 0} K`, t('news.comment_sent'));
            const grantedCard = Number.isFinite(awarded) && awarded > 0
                ? buildNextNewsCard(newsCard, 'comment', 1)
                : newsCard;
            if (typeof res?.k === 'number' && grantedCard) {
                syncUserNewsCard(grantedCard, res.k);
            } else if (typeof res?.k === 'number') {
                syncUserK(res.k);
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

    const handleCancelEditComment = () => {
        setEditingCommentId(null);
        setEditingCommentDraft('');
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

    return {
        commentDraftByPostId,
        commentOpenForPostId,
        commentSubmittingForPostId,
        commentsByPostId,
        commentsErrorByPostId,
        commentsHasMoreByPostId,
        commentsLoadingByPostId,
        commentsLoadingMoreByPostId,
        editingCommentDraft,
        editingCommentId,
        handleCancelEditComment,
        handleDeleteComment,
        handleEditComment,
        handleLoadMoreComments,
        handleSaveComment,
        handleSubmitComment,
        handleToggleComments,
        setCommentDraftByPostId,
        setEditingCommentDraft,
    };
}
