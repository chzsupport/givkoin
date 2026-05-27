import { WISH_PREVIEW_WORDS } from './constants';
import type { Wish, WishDto, WishStatus } from './types';

export function mapDtoToWish(dto: WishDto, currentUserId?: string | null): Wish {
  const created = dto.createdAt ? new Date(dto.createdAt) : new Date();
  const date = created.toLocaleDateString();
  const normalizedStatus: WishStatus = dto.status === 'pending'
    ? 'pending'
    : dto.status === 'fulfilled'
      ? 'fulfilled'
      : 'open';

  return {
    id: dto.id,
    text: dto.text,
    date,
    createdAt: dto.createdAt,
    canEditUntil: dto.canEditUntil || null,
    supports: dto.supportCount || 0,
    supportK: dto.supportK || 0,
    status: normalizedStatus,
    isMine: !!currentUserId && dto.authorId === currentUserId,
    executorId: dto.executorId || null,
    executorName: dto.executorName || dto.executor?.nickname || null,
  };
}

export function mergeWishList(current: Wish[], incoming: Wish[]) {
  const byId = new Map(current.map((wish) => [wish.id, wish]));
  for (const wish of incoming) {
    byId.set(wish.id, wish);
  }
  return Array.from(byId.values())
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function getWishPreview(text: string) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= WISH_PREVIEW_WORDS) return text;
  return `${words.slice(0, WISH_PREVIEW_WORDS).join(' ')}...`;
}

export function isWishEditable(wish: Wish) {
  if (!wish.isMine || wish.status === 'fulfilled' || !wish.canEditUntil) return false;
  return Date.now() <= new Date(wish.canEditUntil).getTime();
}
