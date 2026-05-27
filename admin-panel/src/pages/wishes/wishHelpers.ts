import type { BadgeVariant } from '../../components/ui';
import type { WishEditForm, WishRow } from './wishTypes';

export function createWishEditForm(wish?: WishRow | null): WishEditForm {
  return {
    text: wish?.text || '',
    status: wish?.status || 'open',
    supportCount: wish?.supportCount || 0,
    supportK: wish?.supportK || 0,
    executorContact: wish?.executorContact || '',
  };
}

export function getWishStatusVariant(status: string): BadgeVariant {
  if (status === 'fulfilled') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'open') return 'info';
  return 'default';
}
