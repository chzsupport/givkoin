import { Block } from '../../components/CmsOperationsUi';
import type { EmailTemplate } from './mailTypes';

export function MailTemplateList({
  templates,
  selectedId,
  query,
  isLoading,
  onQueryChange,
  onRefresh,
  onSelect,
}: {
  templates: EmailTemplate[];
  selectedId: string | null;
  query: string;
  isLoading: boolean;
  onQueryChange: (value: string) => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <Block title="Список">
      <div className="space-y-2">
        <button className="btn-secondary w-full" disabled={isLoading} onClick={onRefresh}>Обновить список</button>
        {isLoading && <div className="text-xs text-slate-400">Загрузка...</div>}
        <input
          className="input-field"
          placeholder="Поиск по key или названию"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <div className="space-y-1">
          {templates.map((template) => (
            <button
              key={template._id}
              type="button"
              onClick={() => onSelect(String(template._id))}
              className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${String(template._id) === String(selectedId)
                ? 'border-cyan-400/40 bg-cyan-500/10'
                : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
            >
              <div className="text-sm font-semibold text-white">{template.name || template.key}</div>
              <div className="text-xs text-slate-400">
                {template.key} · {template.status || 'draft'}
                {template?.updatedAt ? ` · обновлено: ${new Date(template.updatedAt as any).toLocaleString()}` : ''}
              </div>
            </button>
          ))}
          {!templates.length && <div className="text-xs text-slate-400">Пока пусто</div>}
        </div>
      </div>
    </Block>
  );
}
