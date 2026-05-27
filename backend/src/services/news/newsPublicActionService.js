const { pickLang } = require('./newsCommon');

function makeNewsHttpResult(status, body) {
  return { status, body };
}

function makeNewsMessageResult(userLang, status, ru, en) {
  return makeNewsHttpResult(status, { message: pickLang(userLang, ru, en) });
}

function createNewsPublicActionService({
  getModelDocById,
  handleNewsInteraction,
  parseNewsViewBatchKey,
  saveViewsForUser,
} = {}) {
  async function recordViewsForUser({
    userId,
    postIds = [],
    lastReadPostId = null,
    viewBatchKey = '',
    userLang = 'ru',
  } = {}) {
    if (!userId) {
      return makeNewsMessageResult(userLang, 401, 'Требуется авторизация', 'Authorization required');
    }

    let allowedPostIds = null;
    if (viewBatchKey) {
      allowedPostIds = parseNewsViewBatchKey(viewBatchKey, userId);
      if (!allowedPostIds) {
        return makeNewsMessageResult(userLang, 400, 'Неверная метка просмотра', 'Invalid view token');
      }
    }

    const result = await saveViewsForUser({
      userId,
      postIds: Array.isArray(postIds) ? postIds : [],
      lastReadPostId,
      allowedPostIds,
    });
    return makeNewsHttpResult(200, result);
  }

  async function handlePostInteraction({
    userId,
    postId,
    type,
    content,
    channel,
    userLang = 'ru',
    userNickname = '',
  } = {}) {
    if (!userId) {
      return makeNewsMessageResult(userLang, 401, 'Требуется авторизация', 'Authorization required');
    }

    if (!['like', 'comment', 'repost', 'view'].includes(type)) {
      return makeNewsMessageResult(userLang, 400, 'Некорректный тип действия', 'Invalid interaction type');
    }

    const post = await getModelDocById('NewsPost', postId);
    if (!post || String(post?.status || '') !== 'published') {
      return makeNewsMessageResult(userLang, 404, 'Пост не найден или не опубликован', 'Post not found or not published');
    }

    return handleNewsInteraction({
      userId,
      postId,
      post,
      type,
      content,
      channel,
      userLang,
      userNickname,
    });
  }

  return {
    recordViewsForUser,
    handlePostInteraction,
  };
}

module.exports = {
  createNewsPublicActionService,
  makeNewsHttpResult,
  makeNewsMessageResult,
};
