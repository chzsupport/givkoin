import { AD_TARGET_OPTIONS } from './adTargets';
import type { AdCreative, AdsApiError, CreativeForm } from './adTypes';

export function createEmptyCreativeForm(): CreativeForm {
  return {
    name: '',
    type: 'banner',
    content: '',
    duration: 10,
    active: true,
    priority: 0,
    targetPages: ['all'],
  };
}

export function getCreativeTypeLabel(creative: AdCreative) {
  const kind = String(creative?.kind || creative?.type || '').toLowerCase();
  if (kind === 'vast') return 'VAST';
  if (kind === 'banner' || kind === 'html') return 'Баннер';
  return 'Старый формат';
}

export function getTargetLabel(id: string) {
  return AD_TARGET_OPTIONS.find((target) => target.id === id)?.name || id;
}

export function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}ч ${minutes}м`;
  if (minutes > 0) return `${minutes}м ${secs}с`;
  return `${secs}с`;
}

export function formatCountry(country: string) {
  const code = String(country || '').toUpperCase();
  if (!code || code === 'ZZ') return 'Неизвестно';
  return code;
}

export function formatDevice(device: string) {
  const normalized = String(device || '').toLowerCase();
  if (normalized === 'desktop') return 'Desktop';
  if (normalized === 'mobile') return 'Mobile';
  if (normalized === 'tablet') return 'Tablet';
  if (normalized === 'bot') return 'Bot';
  return 'Unknown';
}

export function getAdsApiErrorMessage(error: unknown) {
  const apiError = error as AdsApiError;
  return apiError.response?.data?.message || apiError.message || 'Ошибка сохранения креатива';
}
