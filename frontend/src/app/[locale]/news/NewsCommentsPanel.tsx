import { COMMENT_EDIT_WINDOW_MS, type NewsComment } from './newsPageData';

export function NewsCommentsPanel({
    postId,
    commentsCount,
    comments,
    isLoading,
    error,
    hasMore,
    loadingMore,
    currentUserId,
    isAdmin,
    editingCommentId,
    editingCommentDraft,
    commentDraft,
    isSubmitting,
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
    postId: string;
    commentsCount: number;
    comments: NewsComment[];
    isLoading: boolean;
    error: string | null | undefined;
    hasMore: boolean;
    loadingMore: boolean;
    currentUserId: string | undefined;
    isAdmin: boolean;
    editingCommentId: string | null;
    editingCommentDraft: string;
    commentDraft: string;
    isSubmitting: boolean;
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
        <div className="mt-4 2xl:mt-6 rounded-2xl border border-white/10 bg-black/30 p-3 2xl:p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="text-label text-neutral-500">{t('news.comments_label')}</div>
                <div className="text-label text-neutral-600">{commentsCount}</div>
            </div>
            <div className="space-y-2 max-h-64 2xl:max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {isLoading ? (
                    <div className="text-xs text-neutral-500">{t('news.loading_comments')}</div>
                ) : error ? (
                    <div className="text-xs text-rose-300">{error}</div>
                ) : comments.length === 0 ? (
                    <div className="text-xs text-neutral-500">{t('news.no_comments_yet')}</div>
                ) : (
                    <>
                        {comments.map((comment) => {
                            const isAuthor = Boolean(currentUserId && comment.authorId === currentUserId);
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
                                                    onClick={() => onEditComment(comment)}
                                                    className="text-caption font-semibold text-amber-300 hover:text-amber-200"
                                                >
                                                    {t('common.edit')}
                                                </button>
                                            )}
                                            {isAdmin && !isEditing && (
                                                <button
                                                    onClick={() => onDeleteComment(postId, comment.id)}
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
                                                onChange={(e) => onEditingDraftChange(e.target.value)}
                                                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                                rows={3}
                                            />
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => onSaveComment(postId, comment.id)}
                                                    className="h-9 px-4 rounded-xl text-xs font-semibold border border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
                                                >
                                                    {t('common.save')}
                                                </button>
                                                <button
                                                    onClick={onCancelEdit}
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
                        {hasMore && (
                            <button
                                onClick={() => onLoadMoreComments(postId)}
                                disabled={loadingMore}
                                className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-widest text-neutral-300 hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {loadingMore ? t('common.loading') : t('news.load_more')}
                            </button>
                        )}
                    </>
                )}
            </div>
            <div className="mt-4">
                <div className="text-label text-neutral-500 mb-2">{t('news.your_comment')}</div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        value={commentDraft}
                        onChange={(e) => onDraftChange(postId, e.target.value)}
                        placeholder={t('news.write_comment')}
                        className="flex-1 h-11 rounded-xl bg-white/5 border border-white/10 px-4 text-body text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                    <button
                        onClick={() => onSubmitComment(postId)}
                        disabled={isSubmitting}
                        className={`h-11 px-5 rounded-xl font-bold text-body transition-all border ${isSubmitting
                            ? 'bg-white/5 text-neutral-500 border-white/10 cursor-not-allowed'
                            : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-blue-500/40 hover:brightness-110'
                            }`}
                    >
                        {isSubmitting ? '...' : t('common.send')}
                    </button>
                </div>
            </div>
        </div>
    );
}
