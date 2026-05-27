import axios from 'axios';

export function getErrorMessage(error: unknown, fallback = 'Ошибка') {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.response?.data?.error;
    if (message) return String(message);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function formatAdminK(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(number);
}

export function formatStars(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.0000';
  return number.toFixed(4);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return date.toLocaleString('ru-RU');
}

export function formatDurationSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}

export function formatLiveDuration(value: string | null | undefined) {
  if (!value) return 'Нет данных';
  const startedAtMs = new Date(value).getTime();
  if (!Number.isFinite(startedAtMs)) return 'Нет данных';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - startedAtMs) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}

export function formatCloseReason(reason: string | null | undefined) {
  switch (String(reason || '').trim()) {
    case 'manual_exit':
      return 'Вышел сам';
    case 'heartbeat_timeout':
      return 'Пропал сигнал';
    case 'empty_windows':
      return 'Нет отчётов 15 минут';
    case 'low_hour_activity':
      return 'Не добрал минимум за час';
    case 'shift_window_closed':
      return 'Смена закончилась';
    default:
      return 'Без пометки';
  }
}

export function formatReviewStatus(status: string | null | undefined) {
  switch (String(status || '').trim()) {
    case 'approved':
      return 'Проверено: всё в порядке';
    case 'penalized':
      return 'Проверено: штраф';
    case 'pending':
      return 'Ждёт проверки';
    default:
      return 'Чисто';
  }
}

export function formatSettlementStatus(status: string | null | undefined) {
  switch (String(status || '').trim()) {
    case 'queued':
      return 'Ждёт оплату';
    case 'settled':
      return 'Оплачено';
    case 'failed':
      return 'Ошибка оплаты';
    default:
      return 'Нет оплаты';
  }
}

export function formatMismatchReason(reason: string | null | undefined) {
  switch (String(reason || '').trim()) {
    case 'unexpected_anomaly':
      return 'Сервер не выдавал такую аномалию';
    case 'wrong_page':
      return 'Указана не та страница';
    case 'wrong_time':
      return 'Указано не то время';
    case 'report_mismatch':
      return 'Отчёт не совпал с сервером';
    default:
      return 'Есть расхождение';
  }
}

export function compactPagePath(value: string | null | undefined) {
  const path = String(value || '').trim();
  if (!path) return 'Страница не указана';
  return path;
}
