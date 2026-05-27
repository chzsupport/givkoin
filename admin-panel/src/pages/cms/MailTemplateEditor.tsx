import { Block } from '../../components/CmsOperationsUi';
import { getLocalizedTextValue, type ContentLanguage } from '../../utils/localizedContent';
import type { EmailTemplate } from './mailTypes';

export function MailTemplateEditor({
  draft,
  language,
  isDirty,
  isLoading,
  onDraftChange,
  onReset,
  onSetLocalizedField,
  onSave,
  onPublish,
  onLoadVersions,
}: {
  draft: EmailTemplate | null;
  language: ContentLanguage;
  isDirty: boolean;
  isLoading: boolean;
  onDraftChange: (draft: EmailTemplate) => void;
  onReset: () => void;
  onSetLocalizedField: (field: 'subject' | 'html' | 'text', value: string) => void;
  onSave: () => void;
  onPublish: () => void;
  onLoadVersions: () => void;
}) {
  return (
    <Block title="Редактор">
      {!draft && <div className="text-sm text-slate-400">Выберите шаблон слева</div>}
      {draft && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="text-xs text-slate-400">
              {isDirty ? 'Есть несохранённые изменения' : 'Изменений нет'}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <button className="btn-secondary" disabled={isLoading} onClick={onReset}>Сбросить изменения</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input className="input-field" placeholder="key" value={draft.key || ''} onChange={(event) => onDraftChange({ ...draft, key: event.target.value })} />
            <input className="input-field" placeholder="Название" value={draft.name || ''} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} />
          </div>

          <div className="text-xs text-slate-400">
            {draft?.status ? `Статус: ${draft.status}` : ''}
            {draft?.publishedAt ? ` · опубликовано: ${new Date(draft.publishedAt as any).toLocaleString()}` : ''}
            {draft?.updatedAt ? ` · обновлено: ${new Date(draft.updatedAt as any).toLocaleString()}` : ''}
          </div>

          <input
            className="input-field"
            placeholder={language === 'ru' ? 'Тема письма (RU)' : 'Тема письма (EN)'}
            value={getLocalizedTextValue(draft.subject, language)}
            onChange={(event) => onSetLocalizedField('subject', event.target.value)}
          />

          <textarea
            className="input-field min-h-[140px]"
            placeholder={language === 'ru' ? 'HTML (RU)' : 'HTML (EN)'}
            value={getLocalizedTextValue(draft.html, language)}
            onChange={(event) => onSetLocalizedField('html', event.target.value)}
          />

          <textarea
            className="input-field min-h-[120px]"
            placeholder={language === 'ru' ? 'Текстовая версия (RU)' : 'Текстовая версия (EN)'}
            value={getLocalizedTextValue(draft.text, language)}
            onChange={(event) => onSetLocalizedField('text', event.target.value)}
          />

          <textarea
            className="input-field min-h-[80px]"
            placeholder="Заметка (для себя)"
            value={draft.note || ''}
            onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
          />

          <div className="flex flex-col sm:flex-row gap-2">
            <button className="btn-primary" disabled={isLoading || !isDirty} onClick={onSave}>Сохранить</button>
            <button className="btn-secondary" disabled={isLoading || !isDirty} onClick={onPublish}>Опубликовать</button>
            <button className="btn-secondary" disabled={isLoading || !draft._id} onClick={onLoadVersions}>Показать версии</button>
          </div>
        </div>
      )}
    </Block>
  );
}
