import type { ApiError, EditableResourceField, UserStatus } from './userTypes';

export const USERS_PAGE_SIZE = 20;
export const resourceFields: EditableResourceField[] = ['k', 'lives', 'stars', 'lumens', 'complaintChips'];

export function normalizeUserStatus(value: unknown): UserStatus {
  return value === 'banned' || value === 'pending' ? value : 'active';
}

export function getApiErrorMessage(error: unknown, fallback: string) {
  return (error as ApiError)?.response?.data?.message || fallback;
}

export function getUserStatusLabel(status: unknown) {
  if (status === 'active') return 'Активен';
  if (status === 'banned') return 'Забанен';
  return 'Ожидание';
}

export function getUserStatusVariant(status: unknown) {
  if (status === 'active') return 'success';
  if (status === 'banned') return 'error';
  return 'warning';
}
