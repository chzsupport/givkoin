import type { DateValue } from './battleTypes';

type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};

export function getApiErrorMessage(error: unknown, fallback: string) {
  return (error as ApiError)?.response?.data?.message || fallback;
}

export function formatDateTime(value: DateValue, locale = 'ru') {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale);
}

export function normalizeBattleStartsAtForApproval(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toISOString();
}

export function toDatetimeLocal(value: DateValue) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
