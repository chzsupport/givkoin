import { GRATITUDE_COUNT } from './types';

const STORAGE_KEY = 'givkoin_gratitude_daily_draft';

function getDraftStorageKey(serverDay: string) {
  return `${STORAGE_KEY}:${serverDay}`;
}

export function loadGratitudeDrafts(serverDay: string) {
  if (typeof window === 'undefined') return Array(GRATITUDE_COUNT).fill('');
  try {
    const raw = window.localStorage.getItem(getDraftStorageKey(serverDay));
    if (!raw) return Array(GRATITUDE_COUNT).fill('');
    const parsed = JSON.parse(raw);
    return Array.from({ length: GRATITUDE_COUNT }, (_, index) => String(parsed?.entries?.[index] || ''));
  } catch {
    return Array(GRATITUDE_COUNT).fill('');
  }
}

export function saveGratitudeDrafts(serverDay: string, entries: string[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getDraftStorageKey(serverDay), JSON.stringify({ entries }));
}
