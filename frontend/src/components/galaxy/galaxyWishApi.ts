import { apiPatch, apiPost } from '@/utils/api';
import type { WishDto } from './types';

type WishCreatedStats = {
  createdToday: number;
};

type WishExecutionStats = {
  createdToday: number;
  executedToday: number;
  executedLast30: number;
};

export function createWishRequest(text: string) {
  return apiPost<{ wish: WishDto; user: unknown; stats: WishCreatedStats }>('/wishes', {
    text,
  });
}

export function supportWishRequest(wishId: string, amount: number) {
  return apiPost<{ wish: WishDto; user: unknown; stats: WishExecutionStats }>(
    `/wishes/${wishId}/support`,
    { amount },
  );
}

export function fulfillWishRequest(wishId: string, contact: string) {
  return apiPost<{ wish: WishDto; stats: Pick<WishExecutionStats, 'executedToday' | 'executedLast30'> }>(
    `/wishes/${wishId}/fulfill`,
    { contact },
  );
}

export function markWishFulfilledRequest(wishId: string) {
  return apiPost<{ wish: WishDto; stats: WishExecutionStats }>(
    `/wishes/${wishId}/mark-fulfilled`,
    {},
  );
}

export function updateWishTextRequest(wishId: string, text: string) {
  return apiPatch<{ wish: WishDto }>(`/wishes/${wishId}`, { text });
}
