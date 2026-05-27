const {
  buildNewsCommentWindowId,
  buildNewsLikeInteractionId,
  buildNewsRepostInteractionId,
  getNewsViewDateKey,
} = require('./newsCommon');
const { pickLang } = require('./newsCommon');

function makeNewsHttpResult(status, body) {
  return { status, body };
}

function makeNewsMessageResult(userLang, status, ru, en) {
  return makeNewsHttpResult(status, { message: pickLang(userLang, ru, en) });
}

function createNewsInteractionService({
  adjustNewsDailyCounter,
  awardRadianceForActivity,
  clearNewsCommentsCache,
  commentLimitPerDay,
  commentReward,
  commentsPerPostLimit,
  commentWindowMs,
  creditK,
  deleteModelDoc,
  ensureNewsDailyCounter,
  getCommentWindowForUser,
  getModelDocById,
  getNewsDailyCounterValue,
  incrementPostStats,
  insertModelDoc,
  likeLimitPerDay,
  likeReward,
  repostChannels,
  repostLimitPerDay,
  repostReward,
  saveViewsForUser,
  scheduleNewsInteractionSideEffects,
  updateCachedNewsFeedPostStats,
  updateExistingModelDoc,
  upsertModelDoc,
} = {}) {
  async function handleView({ userId, postId, now }) {
    const result = await saveViewsForUser({ userId, postIds: [postId], lastReadPostId: postId, now });
    if (result.saved === 0 && result.alreadyViewed > 0) {
      return makeNewsHttpResult(200, { ok: true, alreadyViewed: true });
    }
    return makeNewsHttpResult(200, { ok: true, saved: result.saved });
  }

  async function handleLike({ userId, postId, post, userLang, now, today }) {
    const likeInteractionId = buildNewsLikeInteractionId(userId, postId);
    const existing = likeInteractionId ? await getModelDocById('NewsInteraction', likeInteractionId) : null;
    if (existing && existing.active !== false) {
      await updateExistingModelDoc('NewsInteraction', existing, { active: false, updatedAt: now });
      await incrementPostStats(postId, { likes: -1 }, post);
      updateCachedNewsFeedPostStats(postId, { likes: -1 });
      return makeNewsHttpResult(200, { ok: true, liked: false, removed: true, awarded: 0 });
    }

    if (existing && existing.active === false) {
      await updateExistingModelDoc('NewsInteraction', existing, { active: true, updatedAt: now });
      await incrementPostStats(postId, { likes: 1 }, post);
      updateCachedNewsFeedPostStats(postId, { likes: 1 });
      return makeNewsHttpResult(200, { ok: true, liked: true, reactivated: true, awarded: 0 });
    }

    const dailyCounter = await ensureNewsDailyCounter({ userId, dateKey: today, now });
    const likesToday = getNewsDailyCounterValue(dailyCounter, 'like');
    if (likesToday >= likeLimitPerDay) {
      return makeNewsMessageResult(userLang, 400, 'Дневной лимит лайков исчерпан', 'Daily like limit reached');
    }

    const interaction = await upsertModelDoc('NewsInteraction', likeInteractionId, {
      _id: likeInteractionId,
      user: userId,
      post: postId,
      type: 'like',
      active: true,
      dateKey: today,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    let dailyCounterApplied = false;
    let postStatsApplied = false;
    try {
      await Promise.all([
        adjustNewsDailyCounter({ userId, type: 'like', dateKey: today, delta: 1, now }).then(() => {
          dailyCounterApplied = true;
        }),
        incrementPostStats(postId, { likes: 1 }, post).then(() => {
          postStatsApplied = true;
        }),
      ]);
      updateCachedNewsFeedPostStats(postId, { likes: 1 });
      const user = await creditK({ userId, amount: likeReward, type: 'news', description: pickLang(userLang, 'Лайк новости', 'News like'), relatedEntity: postId });
      awardRadianceForActivity({
        userId,
        amount: 2,
        activityType: 'news_like',
        meta: { postId, interactionId: interaction._id },
        dedupeKey: `news_like:${postId}:${userId}`,
      }).catch(() => { });
      scheduleNewsInteractionSideEffects({
        userId,
        postId,
        type: 'like',
        kAwarded: likeReward,
      });
      return makeNewsHttpResult(200, { ok: true, liked: true, awarded: likeReward, k: user.k });
    } catch (err) {
      if (dailyCounterApplied) {
        await adjustNewsDailyCounter({ userId, type: 'like', dateKey: today, delta: -1, now: new Date() }).catch(() => { });
      }
      if (postStatsApplied) {
        await incrementPostStats(postId, { likes: -1 }).catch(() => { });
        updateCachedNewsFeedPostStats(postId, { likes: -1 });
      }
      await deleteModelDoc('NewsInteraction', interaction?._id);
      throw err;
    }
  }

  async function handleComment({ userId, postId, post, userLang, userNickname, content, now, today }) {
    if (!content || !content.trim()) {
      return makeNewsMessageResult(userLang, 400, 'Текст комментария обязателен', 'Comment text is required');
    }
    const trimmedContent = content.trim();
    const window = await getCommentWindowForUser(userId, postId);

    const windowExpired = !window?.windowStart
      || (now.getTime() - new Date(window.windowStart).getTime() >= commentWindowMs);
    const currentWindowCount = windowExpired ? 0 : (Number(window?.count) || 0);
    if (currentWindowCount >= commentsPerPostLimit) {
      return makeNewsMessageResult(userLang, 400, 'Лимит: 3 комментария за 24 часа к этому посту', 'Limit: 3 comments per 24 hours for this post');
    }

    const dailyCounter = await ensureNewsDailyCounter({ userId, dateKey: today, now });
    const commentsToday = getNewsDailyCounterValue(dailyCounter, 'comment');
    if (commentsToday >= commentLimitPerDay) {
      return makeNewsMessageResult(userLang, 400, 'Дневной лимит комментариев исчерпан', 'Daily comment limit reached');
    }

    const windowId = buildNewsCommentWindowId(userId, postId);
    const nextWindow = {
      _id: windowId,
      user: userId,
      post: postId,
      windowStart: windowExpired ? now : (window?.windowStart || now),
      count: currentWindowCount + 1,
      createdAt: window?.createdAt || now,
      updatedAt: now,
    };
    const interaction = await insertModelDoc('NewsInteraction', {
      user: userId,
      post: postId,
      type: 'comment',
      content: trimmedContent,
      dateKey: today,
      createdAt: now,
      updatedAt: now,
    });
    let dailyCounterApplied = false;
    let windowCountApplied = false;
    let postStatsApplied = false;
    try {
      await Promise.all([
        adjustNewsDailyCounter({ userId, type: 'comment', dateKey: today, delta: 1, now }).then(() => {
          dailyCounterApplied = true;
        }),
        upsertModelDoc('NewsCommentWindow', windowId, nextWindow).then(() => {
          windowCountApplied = true;
        }),
        incrementPostStats(postId, { comments: 1 }, post).then(() => {
          postStatsApplied = true;
        }),
      ]);
      updateCachedNewsFeedPostStats(postId, { comments: 1 });
      clearNewsCommentsCache();
      const user = await creditK({ userId, amount: commentReward, type: 'news', description: pickLang(userLang, 'Комментарий к новости', 'News comment'), relatedEntity: postId });
      awardRadianceForActivity({
        userId,
        amount: 3,
        activityType: 'news_comment',
        meta: { postId, interactionId: interaction._id },
        dedupeKey: `news_comment:${interaction._id}:${userId}`,
      }).catch(() => { });
      scheduleNewsInteractionSideEffects({
        userId,
        postId,
        type: 'comment',
        kAwarded: commentReward,
      });
      return makeNewsHttpResult(200, {
        ok: true,
        awarded: commentReward,
        k: user.k,
        comment: {
          id: String(interaction._id),
          postId: String(postId),
          content: String(interaction.content || trimmedContent),
          createdAt: interaction.createdAt || now.toISOString(),
          authorId: String(userId),
          authorName: String(userNickname || pickLang(userLang, 'Пользователь', 'User')),
        },
      });
    } catch (err) {
      if (dailyCounterApplied) {
        await adjustNewsDailyCounter({ userId, type: 'comment', dateKey: today, delta: -1, now: new Date() }).catch(() => { });
      }
      if (windowCountApplied) {
        if (currentWindowCount <= 0) {
          await deleteModelDoc('NewsCommentWindow', windowId).catch(() => { });
        } else {
          await upsertModelDoc('NewsCommentWindow', windowId, {
            _id: windowId,
            user: userId,
            post: postId,
            windowStart: windowExpired ? now : (window?.windowStart || now),
            count: currentWindowCount,
            createdAt: window?.createdAt || now,
            updatedAt: new Date(),
          }).catch(() => { });
        }
      }
      if (postStatsApplied) {
        await incrementPostStats(postId, { comments: -1 }).catch(() => { });
        updateCachedNewsFeedPostStats(postId, { comments: -1 });
      }
      await deleteModelDoc('NewsInteraction', interaction?._id);
      throw err;
    }
  }

  async function handleRepost({ userId, postId, post, userLang, channel, now, today }) {
    const safeChannel = String(channel || '').trim().toLowerCase();
    if (!repostChannels.has(safeChannel)) {
      return makeNewsMessageResult(userLang, 400, 'Не выбрана сеть для репоста', 'No repost network selected');
    }
    const repostInteractionId = buildNewsRepostInteractionId(userId, postId);
    const existing = repostInteractionId ? await getModelDocById('NewsInteraction', repostInteractionId) : null;
    const lastRepostedAt = existing?.lastRepostedAt || existing?.updatedAt || existing?.createdAt || null;
    if (lastRepostedAt && (now.getTime() - new Date(lastRepostedAt).getTime() < (24 * 60 * 60 * 1000))) {
      return makeNewsMessageResult(userLang, 400, 'Уже репостили этот пост', 'Already reposted this post');
    }
    const dailyCounter = await ensureNewsDailyCounter({ userId, dateKey: today, now });
    const repostsToday = getNewsDailyCounterValue(dailyCounter, 'repost');
    if (repostsToday >= repostLimitPerDay) {
      return makeNewsMessageResult(userLang, 400, 'Дневной лимит репостов исчерпан', 'Daily repost limit reached');
    }

    const interaction = await upsertModelDoc('NewsInteraction', repostInteractionId, {
      _id: repostInteractionId,
      user: userId,
      post: postId,
      type: 'repost',
      channel: safeChannel,
      dateKey: today,
      lastRepostedAt: now,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    let dailyCounterApplied = false;
    let postStatsApplied = false;
    try {
      await Promise.all([
        adjustNewsDailyCounter({ userId, type: 'repost', dateKey: today, delta: 1, now }).then(() => {
          dailyCounterApplied = true;
        }),
        incrementPostStats(postId, { reposts: 1 }, post).then(() => {
          postStatsApplied = true;
        }),
      ]);
      updateCachedNewsFeedPostStats(postId, { reposts: 1 });
      const user = await creditK({ userId, amount: repostReward, type: 'news', description: pickLang(userLang, 'Репост новости', 'News repost'), relatedEntity: postId });
      awardRadianceForActivity({
        userId,
        amount: 3,
        activityType: 'news_repost',
        meta: { postId, interactionId: interaction._id, channel: safeChannel },
        dedupeKey: `news_repost:${postId}:${userId}`,
      }).catch(() => { });
      scheduleNewsInteractionSideEffects({
        userId,
        postId,
        type: 'repost',
        kAwarded: repostReward,
      });
      return makeNewsHttpResult(200, { ok: true, awarded: repostReward, k: user.k, isReposted: true });
    } catch (err) {
      if (dailyCounterApplied) {
        await adjustNewsDailyCounter({ userId, type: 'repost', dateKey: today, delta: -1, now: new Date() }).catch(() => { });
      }
      if (postStatsApplied) {
        await incrementPostStats(postId, { reposts: -1 }).catch(() => { });
        updateCachedNewsFeedPostStats(postId, { reposts: -1 });
      }
      if (existing?._id) {
        await upsertModelDoc('NewsInteraction', existing._id, existing).catch(() => { });
      } else {
        await deleteModelDoc('NewsInteraction', interaction?._id);
      }
      throw err;
    }
  }

  async function handleNewsInteraction({ userId, postId, post, type, content, channel, userLang, userNickname, now = new Date() } = {}) {
    const today = getNewsViewDateKey(now);

    if (type === 'view') {
      return handleView({ userId, postId, now });
    }
    if (type === 'like') {
      return handleLike({ userId, postId, post, userLang, now, today });
    }
    if (type === 'comment') {
      return handleComment({ userId, postId, post, userLang, userNickname, content, now, today });
    }
    if (type === 'repost') {
      return handleRepost({ userId, postId, post, userLang, channel, now, today });
    }

    return makeNewsMessageResult(userLang, 400, 'Неверный тип действия', 'Invalid interaction type');
  }

  return { handleNewsInteraction };
}

module.exports = {
  createNewsInteractionService,
  makeNewsHttpResult,
  makeNewsMessageResult,
};
