import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { NewsMediaBlock } from '@/components/news/NewsMediaBlock';
import { NewsCommentsPanel } from './NewsCommentsPanel';
import type { NewsComment, NewsPost } from './newsPageData';

type NewsActionType = 'like' | 'comment' | 'repost';

export function NewsPostCard({
    post,
    index,
    title,
    content,
    isViewed,
    isCommentsOpen,
    pendingAction,
    comments,
    commentsLoading,
    commentsError,
    commentsHasMore,
    commentsLoadingMore,
    currentUserId,
    isAdmin,
    editingCommentId,
    editingCommentDraft,
    commentDraft,
    commentSubmitting,
    onAction,
    onToggleComments,
    onRepostClick,
    onEditComment,
    onDeleteComment,
    onSaveComment,
    onCancelEdit,
    onEditingDraftChange,
    onDraftChange,
    onSubmitComment,
    onLoadMoreComments,
    t,
}: {
    post: NewsPost;
    index: number;
    title: string;
    content: string;
    isViewed: boolean;
    isCommentsOpen: boolean;
    pendingAction?: { like?: boolean; repost?: boolean };
    comments: NewsComment[];
    commentsLoading: boolean;
    commentsError: string | null | undefined;
    commentsHasMore: boolean;
    commentsLoadingMore: boolean;
    currentUserId: string | undefined;
    isAdmin: boolean;
    editingCommentId: string | null;
    editingCommentDraft: string;
    commentDraft: string;
    commentSubmitting: boolean;
    onAction: (postId: string, type: NewsActionType) => void | Promise<boolean>;
    onToggleComments: (postId: string) => void;
    onRepostClick: (postId: string) => void;
    onEditComment: (comment: NewsComment) => void;
    onDeleteComment: (postId: string, commentId: string) => void;
    onSaveComment: (postId: string, commentId: string) => void;
    onCancelEdit: () => void;
    onEditingDraftChange: (value: string) => void;
    onDraftChange: (postId: string, value: string) => void;
    onSubmitComment: (postId: string) => void;
    onLoadMoreComments: (postId: string) => void;
    t: (key: string) => string;
}) {
    return (
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

                {isViewed && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        <Eye size={12} className="text-neutral-400" />
                        <span className="text-label text-neutral-500">{t('news.viewed')}</span>
                    </div>
                )}
            </div>

            <h2 className="text-h2 text-white mb-4 2xl:mb-6 group-hover:text-blue-200 transition-colors">
                {title}
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
                    <NewsMediaBlock url={post.mediaUrl} title={title} />
                </div>
            )}

            <p className="text-body text-neutral-300 leading-relaxed mb-8 2xl:mb-12 whitespace-pre-line">
                {content}
            </p>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6 2xl:gap-10 pt-6 2xl:pt-10 border-t border-white/5">
                <button
                    onClick={() => { void onAction(post._id, 'like'); }}
                    disabled={Boolean(pendingAction?.like)}
                    className={`flex items-center gap-2 hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${post.isLiked ? 'text-emerald-300' : ''}`}
                >
                    <span className="text-lg 2xl:text-2xl">❤️</span>
                    <span className="text-body font-bold text-emerald-400">{post.stats?.likes || 0}</span>
                </button>
                <button
                    onClick={() => onToggleComments(post._id)}
                    className="flex items-center gap-2 hover:scale-110 transition-transform"
                >
                    <span className="text-lg 2xl:text-2xl">💬</span>
                    <span className="text-body font-bold text-amber-400">{post.stats?.comments || 0}</span>
                </button>
                <button
                    onClick={() => onRepostClick(post._id)}
                    disabled={Boolean(pendingAction?.repost) || Boolean(post.isReposted)}
                    className={`flex items-center gap-2 hover:scale-110 transition-transform disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${post.isReposted ? 'text-blue-300' : ''}`}
                >
                    <span className="text-lg 2xl:text-2xl">🔁</span>
                    <span className="text-body font-bold text-blue-400">{post.stats?.reposts || 0}</span>
                </button>
            </div>

            {isCommentsOpen && (
                <NewsCommentsPanel
                    postId={post._id}
                    commentsCount={post.stats?.comments ?? comments.length}
                    comments={comments}
                    isLoading={commentsLoading}
                    error={commentsError}
                    hasMore={commentsHasMore}
                    loadingMore={commentsLoadingMore}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    editingCommentId={editingCommentId}
                    editingCommentDraft={editingCommentDraft}
                    commentDraft={commentDraft}
                    isSubmitting={commentSubmitting}
                    onEditComment={onEditComment}
                    onDeleteComment={onDeleteComment}
                    onSaveComment={onSaveComment}
                    onCancelEdit={onCancelEdit}
                    onEditingDraftChange={onEditingDraftChange}
                    onDraftChange={onDraftChange}
                    onSubmitComment={onSubmitComment}
                    onLoadMoreComments={onLoadMoreComments}
                    t={t}
                />
            )}
        </motion.article>
    );
}
