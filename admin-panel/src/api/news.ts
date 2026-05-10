import api from './client';

function normalizeScheduledAt(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

export async function fetchCategories() {
  const res = await api.get('/news/categories');
  return res.data;
}

export async function fetchPosts() {
  const items: any[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const query: string = cursor
      ? `/news?status=all&limit=25&cursor=${encodeURIComponent(cursor)}`
      : '/news?status=all&limit=25';
    const res: any = await api.get(query);
    const batch: any[] = Array.isArray(res.data)
      ? res.data
      : (Array.isArray(res.data?.items) ? res.data.items : []);

    for (const row of batch) {
      const id = String(row?._id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push(row);
    }

    const nextCursor: string | null = typeof res.data?.nextCursor === 'string' && res.data.nextCursor
      ? res.data.nextCursor
      : null;
    const hasMore = Boolean(res.data?.hasMore && nextCursor);
    if (!hasMore) break;
    cursor = nextCursor;
  }

  return items;
}

export async function createPost(payload: {
  title: string;
  content: string;
  translations?: {
    en?: {
      title?: string;
      content?: string;
    };
  };
  mediaUrl?: string;
  categoryId?: string;
  status?: 'draft' | 'scheduled' | 'published';
  scheduledAt?: string;
}) {
  const res = await api.post('/news', {
    ...payload,
    scheduledAt: normalizeScheduledAt(payload?.scheduledAt),
  }, { withCredentials: true });
  return res.data;
}

export async function publishPost(id: string) {
  const res = await api.post(`/news/${id}/publish`, {}, { withCredentials: true });
  return res.data;
}

export async function updatePost(id: string, payload: any) {
  const nextPayload = { ...(payload || {}) };
  if (Object.prototype.hasOwnProperty.call(nextPayload, 'scheduledAt')) {
    nextPayload.scheduledAt = normalizeScheduledAt(nextPayload.scheduledAt);
  }
  const res = await api.patch(`/news/${id}`, nextPayload, { withCredentials: true });
  return res.data;
}

export async function deletePost(id: string) {
  const res = await api.delete(`/news/${id}`, { withCredentials: true });
  return res.data;
}

export async function deletePosts(ids: string[]) {
  const safeIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!safeIds.length) return { deleted: [], missing: [] };

  try {
    const res = await api.post('/news/bulk-delete', { ids: safeIds }, { withCredentials: true });
    return res.data;
  } catch (e: any) {
    const status = Number(e?.response?.status || 0);
    const message = String(e?.response?.data?.message || e?.message || '').toLowerCase();
    const routeMissing = status === 404 || message.includes('route') || message.includes('маршрут');
    if (!routeMissing) {
      throw e;
    }

    const results = await Promise.allSettled(safeIds.map((id) => deletePost(id)));
    const failed = results
      .map((result, index) => ({ result, id: safeIds[index] }))
      .filter(({ result }) => result.status === 'rejected');
    if (failed.length > 0) {
      throw (failed[0].result as PromiseRejectedResult).reason;
    }
    return { deleted: safeIds, missing: [] };
  }
}

export async function createCategory(payload: { name: string; slug: string }) {
  const res = await api.post('/news/categories', payload, { withCredentials: true });
  return res.data;
}

export async function updateCategory(id: string, payload: any) {
  const res = await api.patch(`/news/categories/${id}`, payload, { withCredentials: true });
  return res.data;
}

export async function deleteCategory(id: string) {
  const res = await api.delete(`/news/categories/${id}`, { withCredentials: true });
  return res.data;
}
