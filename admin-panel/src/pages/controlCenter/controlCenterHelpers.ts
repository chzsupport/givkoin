const ADMIN_UI_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  executed: 'Выполнено',
  failed: 'Ошибка',
  completed: 'Завершен',
  running: 'Выполняется',
};

export function formatAdminUiStatus(status: string) {
  return ADMIN_UI_STATUS_LABELS[String(status || '').trim()] || status || 'Неизвестно';
}
