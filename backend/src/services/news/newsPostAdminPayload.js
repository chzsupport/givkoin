const {
  createEmptyPostStats,
  hasOwn,
  normalizeNewsContent,
  normalizeNewsPostStatus,
  normalizeNewsText,
  normalizeNewsTranslations,
  normalizeScheduledAtValue,
} = require('./newsPostFormatting');

function normalizeAdminPostBody(body) {
  return body && typeof body === 'object' ? body : {};
}

function shouldPublishImmediately(status, scheduledAt, now) {
  return status === 'published'
    || (status === 'scheduled' && scheduledAt && new Date(scheduledAt).getTime() <= now.getTime());
}

function buildNewsPostCreatePayload(body, { now = new Date() } = {}) {
  const source = normalizeAdminPostBody(body);
  const title = normalizeNewsText(source.title, 240);
  const content = normalizeNewsContent(source.content);
  const mediaUrl = normalizeNewsText(source.mediaUrl, 2000);
  const categoryId = source.categoryId;
  const status = source.status || 'draft';
  const translations = normalizeNewsTranslations(source.translations);

  if (!title || !content) {
    return { error: 'missing_required' };
  }

  const normalizedStatus = normalizeNewsPostStatus(status, 'draft');
  const normalizedScheduledAt = normalizeScheduledAtValue(source.scheduledAt);
  if (normalizedStatus === 'scheduled' && !normalizedScheduledAt) {
    return { error: 'invalid_scheduled_at' };
  }

  const finalStatus = shouldPublishImmediately(normalizedStatus, normalizedScheduledAt, now)
    ? 'published'
    : normalizedStatus;

  return {
    categoryId,
    error: null,
    finalStatus,
    normalizedScheduledAt,
    payload: {
      title,
      content,
      mediaUrl,
      category: categoryId,
      translations,
      status: finalStatus,
      scheduledAt: finalStatus === 'scheduled' ? normalizedScheduledAt : null,
      stats: createEmptyPostStats(),
      publishedAt: finalStatus === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function buildNewsPostUpdatePatch(existing, body, { now = new Date() } = {}) {
  const source = normalizeAdminPostBody(body);
  const patch = { ...source, updatedAt: now };
  delete patch.translations;

  const statusProvided = hasOwn(source, 'status');
  const scheduledAtProvided = hasOwn(source, 'scheduledAt');
  const nextStatus = statusProvided
    ? normalizeNewsPostStatus(source.status, String(existing?.status || 'draft'))
    : String(existing?.status || 'draft');
  const nextScheduledAt = scheduledAtProvided
    ? normalizeScheduledAtValue(source.scheduledAt)
    : normalizeScheduledAtValue(existing?.scheduledAt);

  if ((statusProvided || scheduledAtProvided) && nextStatus === 'scheduled' && !nextScheduledAt) {
    return { error: 'invalid_scheduled_at' };
  }

  if (statusProvided || scheduledAtProvided) {
    const finalStatus = shouldPublishImmediately(nextStatus, nextScheduledAt, now)
      ? 'published'
      : nextStatus;
    patch.status = finalStatus;
    patch.scheduledAt = finalStatus === 'scheduled' ? nextScheduledAt : null;
    if (finalStatus === 'published') {
      patch.publishedAt = statusProvided ? now : (existing?.publishedAt || now);
    } else if (statusProvided) {
      patch.publishedAt = null;
    }
  }

  if (hasOwn(source, 'title')) {
    patch.title = normalizeNewsText(source.title, 240);
  }
  if (hasOwn(source, 'content')) {
    patch.content = normalizeNewsContent(source.content);
  }
  if (hasOwn(source, 'mediaUrl')) {
    patch.mediaUrl = normalizeNewsText(source.mediaUrl, 2000);
  }
  if (hasOwn(source, 'translations')) {
    patch.translations = normalizeNewsTranslations(source.translations, existing?.translations);
  }

  return { error: null, patch };
}

module.exports = {
  buildNewsPostCreatePayload,
  buildNewsPostUpdatePatch,
};
