const { pickLang, toId } = require('./newsCommon');
const {
  decodeCommentCursor,
  encodeCommentCursor,
  mapCommentDto,
} = require('./newsPostFormatting');

function makeNewsHttpResult(status, body, audit = null) {
  return audit ? { status, body, audit } : { status, body };
}

function makeNewsMessageResult(userLang, status, ru, en) {
  return makeNewsHttpResult(status, { message: pickLang(userLang, ru, en) });
}

function createNewsCommentService({
  clearNewsCommentsCache,
  commentEditWindowMs,
  deleteModelDoc,
  getModelDocById,
  getOrLoadPage,
  hydrateCommentUsers,
  incrementPostStats,
  listDocsByModelBeforeCursor,
  makePageCacheKey,
  updateCachedNewsFeedPostStats,
  updateModelDoc,
  warmPage,
} = {}) {
  async function listCommentsForPost({ postId, limit, cursor, userLang } = {}) {
    const post = await getModelDocById('NewsPost', postId);
    if (!post || String(post?.status || '') !== 'published') {
      return makeNewsMessageResult(userLang, 404, 'Пост не найден или не опубликован', 'Post not found or not published');
    }
    const decodedCursor = decodeCommentCursor(cursor);

    const loadPage = async (pageCursor = decodedCursor) => {
      const rows = await listDocsByModelBeforeCursor('NewsInteraction', {
        dataEq: {
          type: 'comment',
          post: String(postId),
        },
        cursorCreatedAt: pageCursor?.createdAt,
        cursorId: pageCursor?.id,
        limit: limit + 1,
      });
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const nextCursor = hasMore ? encodeCommentCursor(pageRows[pageRows.length - 1]) : null;

      const comments = pageRows.filter(Boolean);
      await hydrateCommentUsers(comments);

      return {
        comments: comments.map((comment) => mapCommentDto(comment, userLang)),
        nextCursor,
        hasMore,
      };
    };

    const cacheKey = makePageCacheKey('news:comments', { postId, limit, cursor: decodedCursor, lang: userLang });
    const { value: pageData } = await getOrLoadPage(cacheKey, () => loadPage(decodedCursor));
    if (pageData?.hasMore && pageData?.nextCursor) {
      const nextCursor = decodeCommentCursor(pageData.nextCursor);
      const nextKey = makePageCacheKey('news:comments', { postId, limit, cursor: nextCursor, lang: userLang });
      warmPage(nextKey, () => loadPage(nextCursor));
    }

    return makeNewsHttpResult(200, pageData || { comments: [], nextCursor: null, hasMore: false });
  }

  async function updateCommentForUser({ postId, commentId, content, userId, userLang, nowMs = Date.now() } = {}) {
    if (!userId) {
      return makeNewsMessageResult(userLang, 401, 'Требуется авторизация', 'Authorization required');
    }
    if (!content || !content.trim()) {
      return makeNewsMessageResult(userLang, 400, 'Текст комментария обязателен', 'Comment text is required');
    }

    const comment = await getModelDocById('NewsInteraction', commentId);
    if (!comment || String(comment?.type || '') !== 'comment' || toId(comment?.post) !== toId(postId)) {
      return makeNewsMessageResult(userLang, 404, 'Комментарий не найден', 'Comment not found');
    }

    if (toId(comment?.user) !== toId(userId)) {
      return makeNewsMessageResult(userLang, 403, 'Можно редактировать только свой комментарий', 'You can only edit your own comment');
    }

    if (nowMs - new Date(comment.createdAt).getTime() > commentEditWindowMs) {
      return makeNewsMessageResult(userLang, 400, 'Время редактирования истекло', 'Edit time has expired');
    }

    const saved = await updateModelDoc('NewsInteraction', commentId, { content: content.trim(), updatedAt: new Date() });
    clearNewsCommentsCache();

    const commentObj = saved || { ...comment, content: content.trim(), updatedAt: new Date() };
    await hydrateCommentUsers([commentObj]);
    return makeNewsHttpResult(200, { comment: mapCommentDto(commentObj, userLang) });
  }

  async function deleteCommentForAdmin({ postId, commentId, userLang } = {}) {
    const comment = await getModelDocById('NewsInteraction', commentId);
    if (!comment || String(comment?.type || '') !== 'comment' || toId(comment?.post) !== toId(postId)) {
      return makeNewsMessageResult(userLang, 404, 'Комментарий не найден', 'Comment not found');
    }

    await deleteModelDoc('NewsInteraction', commentId);
    await incrementPostStats(postId, { comments: -1 });
    updateCachedNewsFeedPostStats(postId, { comments: -1 });
    clearNewsCommentsCache();
    return makeNewsHttpResult(200, { ok: true }, {
      event: 'news.comment.delete',
      payload: { postId, commentId },
    });
  }

  return {
    listCommentsForPost,
    updateCommentForUser,
    deleteCommentForAdmin,
  };
}

module.exports = {
  createNewsCommentService,
  makeNewsHttpResult,
  makeNewsMessageResult,
};
