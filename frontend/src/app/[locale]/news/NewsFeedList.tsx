import type { MutableRefObject, RefObject } from 'react';
import { AdBlock } from '@/components/AdBlock';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { NewsPostCard } from './NewsPostCard';
import type { NewsComment, NewsPost } from './newsPageData';

type NewsActionType = 'like' | 'comment' | 'repost';

type NewsFeedListProps = {
    feedRef: RefObject<HTMLDivElement>;
    postsRef: MutableRefObject<Record<string, HTMLDivElement | null>>;
    loading: boolean;
    posts: NewsPost[];
    isDesktop: boolean;
    viewedPosts: Set<string>;
    commentOpenForPostId: string | null;
    pendingActionsByPostId: Record<string, { like?: boolean; repost?: boolean }>;
    commentsByPostId: Record<string, NewsComment[]>;
    commentsLoadingByPostId: Record<string, boolean>;
    commentsErrorByPostId: Record<string, string | null>;
    commentsHasMoreByPostId: Record<string, boolean>;
    commentsLoadingMoreByPostId: Record<string, boolean>;
    currentUserId?: string;
    isAdmin: boolean;
    editingCommentId: string | null;
    editingCommentDraft: string;
    commentDraftByPostId: Record<string, string>;
    commentSubmittingForPostId: string | null;
    postsHasMore: boolean;
    loadingMorePosts: boolean;
    getPostTitle: (post: NewsPost) => string;
    getPostContent: (post: NewsPost) => string;
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
    onLoadMorePosts: () => void;
    t: (key: string) => string;
};

export function NewsFeedList({
    feedRef,
    postsRef,
    loading,
    posts,
    isDesktop,
    viewedPosts,
    commentOpenForPostId,
    pendingActionsByPostId,
    commentsByPostId,
    commentsLoadingByPostId,
    commentsErrorByPostId,
    commentsHasMoreByPostId,
    commentsLoadingMoreByPostId,
    currentUserId,
    isAdmin,
    editingCommentId,
    editingCommentDraft,
    commentDraftByPostId,
    commentSubmittingForPostId,
    postsHasMore,
    loadingMorePosts,
    getPostTitle,
    getPostContent,
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
    onLoadMorePosts,
    t,
}: NewsFeedListProps) {
    return (
        <div
            ref={feedRef}
            className={`${isDesktop ? 'flex-1 overflow-y-auto pr-4 pb-12' : 'w-full'} relative flex flex-col gap-6 2xl:gap-10 custom-scrollbar`}
        >
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400" />
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
                                <NewsPostCard
                                    post={post}
                                    index={index}
                                    title={postTitle}
                                    content={postContent}
                                    isViewed={viewedPosts.has(post._id)}
                                    isCommentsOpen={commentOpenForPostId === post._id}
                                    pendingAction={pendingActionsByPostId[post._id]}
                                    comments={commentsByPostId[post._id] || []}
                                    commentsLoading={Boolean(commentsLoadingByPostId[post._id])}
                                    commentsError={commentsErrorByPostId[post._id]}
                                    commentsHasMore={Boolean(commentsHasMoreByPostId[post._id])}
                                    commentsLoadingMore={Boolean(commentsLoadingMoreByPostId[post._id])}
                                    currentUserId={currentUserId}
                                    isAdmin={isAdmin}
                                    editingCommentId={editingCommentId}
                                    editingCommentDraft={editingCommentDraft}
                                    commentDraft={commentDraftByPostId[post._id] || ''}
                                    commentSubmitting={commentSubmittingForPostId === post._id}
                                    onAction={onAction}
                                    onToggleComments={onToggleComments}
                                    onRepostClick={onRepostClick}
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
                        );
                    })}

                    {postsHasMore && (
                        <div className="flex justify-center pt-2">
                            <button
                                onClick={onLoadMorePosts}
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
    );
}
