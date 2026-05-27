import { normalizeLocalizedText } from '../../utils/localizedContent';
import type { EmailTemplate } from './mailTypes';

export function filterAndSortTemplates(templates: EmailTemplate[], query: string) {
  const q = String(query || '').trim().toLowerCase();
  const rows = Array.isArray(templates) ? templates : [];
  const out = q
    ? rows.filter((template) => {
      const key = String(template?.key || '').toLowerCase();
      const name = String(template?.name || '').toLowerCase();
      return key.includes(q) || name.includes(q);
    })
    : rows;
  return [...out].sort((a, b) => {
    const aTime = a?.updatedAt ? new Date(a.updatedAt as any).getTime() : 0;
    const bTime = b?.updatedAt ? new Date(b.updatedAt as any).getTime() : 0;
    return bTime - aTime;
  });
}

export function hasTemplateDraftChanges(draft: EmailTemplate | null, selected: EmailTemplate | null) {
  if (!draft || !selected) return false;
  const pick = (template: any) => ({
    key: String(template?.key || ''),
    name: String(template?.name || ''),
    status: String(template?.status || ''),
    subject: normalizeLocalizedText(template?.subject),
    html: normalizeLocalizedText(template?.html),
    text: normalizeLocalizedText(template?.text),
    note: String(template?.note || ''),
  });
  try {
    return JSON.stringify(pick(draft)) !== JSON.stringify(pick(selected));
  } catch {
    return true;
  }
}
