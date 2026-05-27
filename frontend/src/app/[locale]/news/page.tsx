'use client';

import { PageBackground } from '@/components/PageBackground';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';
import { NewsFeedList } from './NewsFeedList';
import { NewsPageHeader } from './NewsPageHeader';
import { NewsRightAdRail } from './NewsRightAdRail';
import { NewsRepostModal } from './NewsRepostModal';
import { NewsScrollTopButton } from './NewsScrollTopButton';
import { NewsSidebar } from './NewsSidebar';
import { useNewsLayout } from './useNewsLayout';
import { useNewsActions } from './useNewsActions';
import { useNewsFeedCache } from './useNewsFeedCache';
import { useNewsComments } from './useNewsComments';
import { useNewsFeedPagination } from './useNewsFeedPagination';
import { useNewsInitialFeed } from './useNewsInitialFeed';
import { useNewsLocalizedFields } from './useNewsLocalizedFields';
import { useNewsPageRefs } from './useNewsPageRefs';
import { useNewsPageState } from './useNewsPageState';
import { useNewsReadTracking } from './useNewsReadTracking';
import { useNewsScrollControls } from './useNewsScrollControls';
import { useNewsUserSync } from './useNewsUserSync';
import { useNewsViewFlush } from './useNewsViewFlush';
import { useNewsViewedPersistence } from './useNewsViewedPersistence';
import {
    getClientNewsViewDateKey,
    type NewsCard,
} from './newsPageData';
import { getNewsCardLimits } from './newsCardLimits';

export default function NewsPage() {
    const { refreshUser, updateUser, user } = useAuth();
    const { language, t, localePath } = useI18n();
    const toast = useToast();
    const {
        lastReadId,
        loading,
        loadingMorePosts,
        posts,
        postsHasMore,
        postsNextCursor,
        setLastReadId,
        setLoading,
        setLoadingMorePosts,
        setPosts,
        setPostsHasMore,
        setPostsNextCursor,
        setViewedPosts,
        viewedPosts,
    } = useNewsPageState();

    const {
        containerRef,
        currentReadPostIdRef,
        feedRef,
        hasNewsScrollRef,
        lastReadIdRef,
        pendingViewIdsRef,
        postsRef,
        viewFlushInFlightRef,
        viewedPostsRef,
    } = useNewsPageRefs(lastReadId);
    const userId = user?._id || user?.id;
    const isAdmin = user?.role === 'admin';
    const newsCard = (user?.newsCard || null) as NewsCard | null;

    const viewedStorageKey = `news_viewed_post_ids_${getClientNewsViewDateKey()}`;
    const {
        rememberViewBatchKey,
        syncNewsFeedCache,
        viewBatchKeyByPostIdRef,
    } = useNewsFeedCache(userId);

    const {
        commentsPerPost,
        dailyCommentsLimit,
        dailyLikesLimit,
        dailyRepostsLimit,
        likesPerPost,
        repostsPerPost,
    } = getNewsCardLimits(newsCard);

    const {
        newsCardRef,
        syncUserK,
        syncUserNewsCard,
        syncViewedProgress,
        updateUserRef,
        userRef,
    } = useNewsUserSync({
        newsCard,
        updateUser,
        user,
    });
    const { getPostContent, getPostTitle } = useNewsLocalizedFields(language);

    const { adHeight, adWidth, isDesktop } = useNewsLayout(viewedStorageKey);
    useNewsViewFlush({
        currentReadPostIdRef,
        pendingViewIdsRef,
        userId,
        viewBatchKeyByPostIdRef,
        viewFlushInFlightRef,
        viewedStorageKey,
    });
    useNewsReadTracking({
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
    });

    const {
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
    } = useNewsComments({
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
        userNickname: user?.nickname,
    });
    const {
        handleAction,
        handleRepostClick,
        handleRepostToSocial,
        pendingActionsByPostId,
        repostModalOpen,
        setRepostModalOpen,
    } = useNewsActions({
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
    });
    const {
        handleLoadMorePosts,
        loadMorePostPages,
    } = useNewsFeedPagination({
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
    });
    const {
        scrollToLastRead,
        scrollToTop,
        showScrollTop,
    } = useNewsScrollControls({
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
    });
    useNewsInitialFeed({
        newsCardRef,
        rememberViewBatchKey,
        setLastReadId,
        setLoading,
        setPosts,
        setPostsHasMore,
        setPostsNextCursor,
        setViewedPosts,
        updateUserRef,
        userId,
        userRef,
        viewBatchKeyByPostIdRef,
        viewedStorageKey,
    });

    useNewsViewedPersistence({
        lastReadId,
        lastReadIdRef,
        viewedPosts,
        viewedPostsRef,
        viewedStorageKey,
    });

    return (
        <div className="relative h-full w-full overflow-hidden flex flex-col">
            <PageBackground />

            {/* Правый плавающий рекламный блок - только для ПК в ландшафтном режиме */}
            <NewsRightAdRail isDesktop={isDesktop} adWidth={adWidth} adHeight={adHeight} t={t} />

            <div
                ref={containerRef}
                className={`relative z-10 flex-1 flex flex-col min-h-0 ${isDesktop ? 'overflow-hidden' : 'overflow-y-auto'}`}
                style={isDesktop ? { marginRight: adWidth + 16 } : {}}
            >
                <div className={`mx-auto w-full max-w-6xl 2xl:max-w-[1800px] px-4 sm:px-6 ${isDesktop ? 'px-10' : ''} 2xl:px-20 py-6 ${isDesktop ? 'py-8' : ''} 2xl:py-12 flex flex-col flex-1 min-h-0`}>
                    <NewsPageHeader
                        hasPosts={posts.length > 0}
                        loadingMorePosts={loadingMorePosts}
                        treeHref={localePath('/tree')}
                        onContinueReading={scrollToLastRead}
                        t={t}
                    />

                    {/* Main Layout */}
                    <div className={`flex ${isDesktop ? 'flex-row' : 'flex-col'} gap-8 2xl:gap-16 items-start flex-1 min-h-0`}>

                        {/* Left Column: News Feed */}
                        <NewsFeedList
                            feedRef={feedRef}
                            postsRef={postsRef}
                            loading={loading}
                            posts={posts}
                            isDesktop={isDesktop}
                            viewedPosts={viewedPosts}
                            commentOpenForPostId={commentOpenForPostId}
                            pendingActionsByPostId={pendingActionsByPostId}
                            commentsByPostId={commentsByPostId}
                            commentsLoadingByPostId={commentsLoadingByPostId}
                            commentsErrorByPostId={commentsErrorByPostId}
                            commentsHasMoreByPostId={commentsHasMoreByPostId}
                            commentsLoadingMoreByPostId={commentsLoadingMoreByPostId}
                            currentUserId={userId}
                            isAdmin={isAdmin}
                            editingCommentId={editingCommentId}
                            editingCommentDraft={editingCommentDraft}
                            commentDraftByPostId={commentDraftByPostId}
                            commentSubmittingForPostId={commentSubmittingForPostId}
                            postsHasMore={postsHasMore}
                            loadingMorePosts={loadingMorePosts}
                            getPostTitle={getPostTitle}
                            getPostContent={getPostContent}
                            onAction={handleAction}
                            onToggleComments={handleToggleComments}
                            onRepostClick={handleRepostClick}
                            onEditComment={handleEditComment}
                            onDeleteComment={handleDeleteComment}
                            onSaveComment={handleSaveComment}
                            onCancelEdit={handleCancelEditComment}
                            onEditingDraftChange={setEditingCommentDraft}
                            onDraftChange={(id, value) => setCommentDraftByPostId(prev => ({ ...prev, [id]: value }))}
                            onSubmitComment={handleSubmitComment}
                            onLoadMoreComments={handleLoadMoreComments}
                            onLoadMorePosts={handleLoadMorePosts}
                            t={t}
                        />

                        <NewsSidebar
                            isDesktop={isDesktop}
                            likesPerPost={likesPerPost}
                            commentsPerPost={commentsPerPost}
                            repostsPerPost={repostsPerPost}
                            dailyLikesLimit={dailyLikesLimit}
                            dailyCommentsLimit={dailyCommentsLimit}
                            dailyRepostsLimit={dailyRepostsLimit}
                            t={t}
                        />
                    </div>
                </div>
            </div>

            <NewsScrollTopButton
                onClick={scrollToTop}
                show={showScrollTop}
                title={t('landing.up')}
            />

            {repostModalOpen && (
                <NewsRepostModal
                    postId={repostModalOpen}
                    onClose={() => setRepostModalOpen(null)}
                    onSelect={handleRepostToSocial}
                    t={t}
                />
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
