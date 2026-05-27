import type { AdminPost, ApiError, PostForm, PostStatus } from './contentTypes';

export const emptyPostForm: PostForm = {
  title: '',
  content: '',
  enTitle: '',
  enContent: '',
  mediaUrl: '',
  status: 'draft',
  scheduledAt: '',
};

export function getApiError(error: unknown): ApiError {
  return (error || {}) as ApiError;
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  return getApiError(error).response?.data?.message || fallback;
}

export function normalizePostStatus(value: unknown): PostStatus {
  return value === 'scheduled' || value === 'published' ? value : 'draft';
}

export function toPlainText(value: string) {
  const html = String(value || '');
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

export function normalizePostContent(value: unknown) {
  const raw = String(value || '');
  if (!raw.includes('<')) return raw;
  const div = document.createElement('div');
  div.innerHTML = raw;
  return String(div.innerText || div.textContent || '');
}

export function getPostId(post: AdminPost | null | undefined) {
  const id = post?._id || post?.id || '';
  return String(id || '');
}

export function getPostPreview(content: string, max = 220) {
  const plain = toPlainText(content || '');
  if (plain.length <= max) return plain;
  return `${plain.slice(0, max)}...`;
}

export function formatLocalDateTimeInput(value: string | number | Date | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
