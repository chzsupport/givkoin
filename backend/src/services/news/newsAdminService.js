const { pickLang, toId } = require('./newsCommon');

function makeNewsAdminResult(status, body, audit = null, flags = null) {
  return {
    status,
    body,
    ...(audit ? { audit } : {}),
    ...(flags ? { flags } : {}),
  };
}

function makeNewsAdminMessage(userLang, status, ru, en, audit = null, flags = null) {
  return makeNewsAdminResult(status, { message: pickLang(userLang, ru, en) }, audit, flags);
}

function createNewsAdminService({
  buildNewsPostCreatePayload,
  buildNewsPostUpdatePatch,
  deleteModelDoc,
  deleteNewsPostTotally,
  getModelDocById,
  insertModelDoc,
  listModelDocs,
  updateModelDoc,
} = {}) {
  async function createCategory({ body = {}, userLang, now = new Date() } = {}) {
    const { name, slug } = body || {};
    if (!name || !slug) {
      return makeNewsAdminMessage(userLang, 400, 'name и slug обязательны', 'name and slug are required');
    }

    const all = await listModelDocs('NewsCategory', { pageSize: 2000 });
    const exists = (Array.isArray(all) ? all : []).some((row) => String(row?.name || '') === String(name) || String(row?.slug || '') === String(slug));
    if (exists) {
      return makeNewsAdminMessage(userLang, 400, 'Такая категория уже есть', 'This category already exists');
    }

    const category = await insertModelDoc('NewsCategory', { name, slug, createdAt: now, updatedAt: now });
    return makeNewsAdminResult(201, category, {
      event: 'news.category.create',
      payload: { categoryId: category._id, name, slug },
    }, { invalidateCategories: true });
  }

  async function updateCategory({ id, body = {}, userLang, now = new Date() } = {}) {
    const category = await updateModelDoc('NewsCategory', id, { ...(body || {}), updatedAt: now });
    if (!category) {
      return makeNewsAdminMessage(userLang, 404, 'Категория не найдена', 'Category not found');
    }

    return makeNewsAdminResult(200, category, {
      event: 'news.category.update',
      payload: { categoryId: id, updates: Object.keys(body || {}) },
    }, { invalidateCategories: true });
  }

  async function deleteCategory({ id, userLang } = {}) {
    await deleteModelDoc('NewsCategory', id);
    return makeNewsAdminMessage(userLang, 200, 'Категория удалена', 'Category deleted', {
      event: 'news.category.delete',
      payload: { categoryId: id },
    }, { invalidateCategories: true });
  }

  async function createPost({ body = {}, userLang, now = new Date() } = {}) {
    const postPayload = buildNewsPostCreatePayload(body, { now });
    if (postPayload.error === 'missing_required') {
      return makeNewsAdminMessage(userLang, 400, 'title и content обязательны', 'title and content are required');
    }
    if (postPayload.error === 'invalid_scheduled_at') {
      return makeNewsAdminMessage(userLang, 400, 'Укажите корректные дату и время публикации', 'Specify a valid publication date and time');
    }

    const post = await insertModelDoc('NewsPost', postPayload.payload);
    return makeNewsAdminResult(201, post, {
      event: 'news.post.create',
      payload: {
        postId: post._id,
        status: postPayload.finalStatus,
        scheduledAt: postPayload.normalizedScheduledAt,
        categoryId: postPayload.categoryId,
      },
    }, { invalidateFeed: true });
  }

  async function updatePost({ id, body = {}, userLang, now = new Date() } = {}) {
    const existing = await getModelDocById('NewsPost', id);
    if (!existing) {
      return makeNewsAdminMessage(userLang, 404, 'Пост не найден', 'Post not found');
    }

    const postPatch = buildNewsPostUpdatePatch(existing, body, { now });
    if (postPatch.error === 'invalid_scheduled_at') {
      return makeNewsAdminMessage(userLang, 400, 'Укажите корректные дату и время публикации', 'Specify a valid publication date and time');
    }

    const post = await updateModelDoc('NewsPost', id, postPatch.patch);
    if (!post) {
      return makeNewsAdminMessage(userLang, 404, 'Пост не найден', 'Post not found');
    }

    return makeNewsAdminResult(200, post, {
      event: 'news.post.update',
      payload: { postId: id, updates: Object.keys(body || {}) },
    }, { invalidateFeed: true });
  }

  async function deletePost({ id, userLang } = {}) {
    try {
      await deleteNewsPostTotally(id);
      return makeNewsAdminMessage(userLang, 200, 'Пост удален', 'Post deleted', {
        event: 'news.post.delete',
        payload: { postId: id },
      }, { invalidateFeed: true });
    } catch (err) {
      if (err?.status === 404) {
        return makeNewsAdminMessage(userLang, 200, 'Пост уже удален', 'Post already deleted', null, { invalidateFeed: true });
      }
      throw err;
    }
  }

  async function deletePostsBulk({ ids, userLang } = {}) {
    const safeIds = Array.from(new Set(
      (Array.isArray(ids) ? ids : [])
        .map(toId)
        .filter(Boolean)
    ));

    if (!safeIds.length) {
      return makeNewsAdminMessage(userLang, 400, 'Не выбраны посты для удаления', 'No posts selected');
    }

    const deleted = [];
    const missing = [];
    const audit = [];
    for (const id of safeIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await deleteNewsPostTotally(id);
        deleted.push(id);
        audit.push({ event: 'news.post.delete', payload: { postId: id, bulk: true } });
      } catch (err) {
        if (err?.status === 404) {
          missing.push(id);
          continue;
        }
        throw err;
      }
    }

    return makeNewsAdminResult(200, {
      message: pickLang(userLang, 'Выбранные посты удалены', 'Selected posts deleted'),
      deleted,
      missing,
    }, audit, { invalidateFeed: true });
  }

  async function publishPost({ id, userLang, now = new Date() } = {}) {
    const post = await getModelDocById('NewsPost', id);
    if (!post) {
      return makeNewsAdminMessage(userLang, 404, 'Пост не найден', 'Post not found');
    }

    const saved = await updateModelDoc('NewsPost', id, {
      status: 'published',
      scheduledAt: null,
      publishedAt: now,
      updatedAt: now,
    });
    return makeNewsAdminResult(200, saved || { ...post, status: 'published', scheduledAt: null, publishedAt: now, updatedAt: now }, {
      event: 'news.post.publish',
      payload: { postId: id },
    }, { invalidateFeed: true });
  }

  return {
    createCategory,
    updateCategory,
    deleteCategory,
    createPost,
    updatePost,
    deletePost,
    deletePostsBulk,
    publishPost,
  };
}

module.exports = {
  createNewsAdminService,
  makeNewsAdminResult,
  makeNewsAdminMessage,
};
