export function formatFeedbackDate(value?: string) {
  return value ? new Date(value).toLocaleString('ru-RU') : '';
}

export function getFeedbackPreview(message: string = '') {
  const text = String(message || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 160) return text;
  return `${text.slice(0, 160)}...`;
}
