import { Block } from '../../components/CmsOperationsUi';
import { getLocalizedTextValue, type ContentLanguage } from '../../utils/localizedContent';
import type { EmailTemplate, EmailTemplateVersion } from './mailTypes';

export function MailTemplateVersions({
  draft,
  language,
  versions,
  isVersionsLoading,
  isLoading,
  openedVersion,
  onToggleVersion,
  onRollback,
}: {
  draft: EmailTemplate | null;
  language: ContentLanguage;
  versions: EmailTemplateVersion[];
  isVersionsLoading: boolean;
  isLoading: boolean;
  openedVersion: number | null;
  onToggleVersion: (version: number) => void;
  onRollback: (version: number) => void;
}) {
  return (
    <Block title="Версии">
      {!draft && <div className="text-sm text-slate-400">Выберите шаблон</div>}
      {draft && (
        <div className="space-y-2">
          {isVersionsLoading && <div className="text-xs text-slate-400">Загрузка...</div>}
          {!isVersionsLoading && !versions.length && <div className="text-sm text-slate-400">Версии не загружены</div>}
          <div className="space-y-2">
            {versions.map((version) => (
              <div key={`${version?._id || ''}_${version?.version || ''}`} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <div className="text-sm text-white font-semibold">Версия {version?.version}</div>
                    <div className="text-xs text-slate-400">
                      {version?.createdAt ? `Дата: ${new Date(version.createdAt as any).toLocaleString()}` : ''}
                      {version?.changeNote ? ` · ${String(version.changeNote)}` : ''}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => onToggleVersion(Number(version?.version))}
                    >
                      {openedVersion === Number(version?.version) ? 'Скрыть' : 'Показать'}
                    </button>
                    <button className="btn-secondary" disabled={isLoading} onClick={() => onRollback(Number(version?.version))}>Откатить</button>
                  </div>
                </div>

                {openedVersion === Number(version?.version) && (
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-slate-400">Тема ({language.toUpperCase()})</div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200 break-words">
                      {getLocalizedTextValue(version?.snapshot?.subject, language) || '—'}
                    </div>

                    <div className="text-xs text-slate-400">HTML ({language.toUpperCase()})</div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200 whitespace-pre-wrap break-words max-h-[200px] overflow-auto">
                      {getLocalizedTextValue(version?.snapshot?.html, language) || '—'}
                    </div>

                    <div className="text-xs text-slate-400">Текст ({language.toUpperCase()})</div>
                    <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs text-slate-200 whitespace-pre-wrap break-words max-h-[160px] overflow-auto">
                      {getLocalizedTextValue(version?.snapshot?.text, language) || '—'}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Block>
  );
}
