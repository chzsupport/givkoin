import { useEffect, useMemo, useState } from 'react';
import { StateMessage } from '../../components/CmsOperationsUi';
import {
  cmsCreateEmailTemplate,
  cmsFetchEmailTemplates,
  cmsFetchEmailTemplateVersions,
  cmsImportEmailTemplateDefaults,
  cmsPatchEmailTemplate,
  cmsPublishEmailTemplate,
  cmsRollbackEmailTemplate,
} from '../../api/cms';
import {
  type ContentLanguage,
  updateLocalizedTextValue,
  normalizeLocalizedText,
} from '../../utils/localizedContent';
import { MailCreateBlock } from './MailCreateBlock';
import { MailHeader } from './MailHeader';
import { MailTemplateEditor } from './MailTemplateEditor';
import { MailTemplateList } from './MailTemplateList';
import { MailTemplateVersions } from './MailTemplateVersions';
import { filterAndSortTemplates, hasTemplateDraftChanges } from './mailHelpers';
import type { EmailTemplate, EmailTemplateVersion } from './mailTypes';

export default function MailTab() {
  const [language, setLanguage] = useState<ContentLanguage>('ru');
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [query, setQuery] = useState('');

  const [createKey, setCreateKey] = useState('');
  const [createName, setCreateName] = useState('');

  const [versions, setVersions] = useState<EmailTemplateVersion[]>([]);
  const [isVersionsLoading, setIsVersionsLoading] = useState(false);
  const [openedVersion, setOpenedVersion] = useState<number | null>(null);
  const [autoImportAttempted, setAutoImportAttempted] = useState(false);

  const selected = useMemo(() => templates.find((template) => String(template._id) === String(selectedId || '')) || null, [templates, selectedId]);
  const filteredTemplates = useMemo(() => filterAndSortTemplates(templates, query), [templates, query]);
  const isDirty = useMemo(() => hasTemplateDraftChanges(draft, selected), [draft, selected]);

  const loadTemplates = async (allowAutoImport = true) => {
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsFetchEmailTemplates({ limit: 200 });
      let rows = Array.isArray(data?.templates) ? data.templates : [];
      if (!rows.length && allowAutoImport && !autoImportAttempted) {
        setAutoImportAttempted(true);
        await cmsImportEmailTemplateDefaults();
        const retry = await cmsFetchEmailTemplates({ limit: 200 });
        rows = Array.isArray(retry?.templates) ? retry.templates : [];
        if (rows.length) {
          setOk('Стартовые шаблоны писем автоматически подгружены');
        }
      }
      setTemplates(rows);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить шаблоны');
    } finally {
      setIsLoading(false);
    }
  };

  const resetDraft = () => {
    if (!selected) return;
    if (isDirty && !window.confirm('Сбросить изменения и вернуть сохранённую версию?')) return;
    setDraft({ ...selected });
    setOk('Черновик сброшен');
  };

  const importDefaults = async () => {
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsImportEmailTemplateDefaults();
      setOk('Импорт выполнен');
      await loadTemplates();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось выполнить импорт');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (!selected) {
      setDraft(null);
      setVersions([]);
      setOpenedVersion(null);
      return;
    }
    setDraft({ ...selected });
    setVersions([]);
    setOpenedVersion(null);
  }, [selected?._id]);

  const loadVersions = async () => {
    if (!selectedId) return;
    setIsVersionsLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsFetchEmailTemplateVersions(selectedId);
      setVersions(Array.isArray(data?.versions) ? data.versions : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить версии');
    } finally {
      setIsVersionsLoading(false);
    }
  };

  const createTemplate = async () => {
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      const res = await cmsCreateEmailTemplate({
        key: createKey.trim(),
        name: createName.trim(),
        status: 'draft',
        subject: { ru: '', en: '' },
        html: { ru: '', en: '' },
        text: { ru: '', en: '' },
      });
      const created = res?.data?.template || res?.template || res?.data?.data?.template || null;
      setOk('Шаблон создан');
      setCreateKey('');
      setCreateName('');
      await loadTemplates();
      if (created?._id) setSelectedId(String(created._id));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось создать шаблон');
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!draft?._id) return;
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsPatchEmailTemplate(draft._id, {
        key: String(draft.key || '').trim(),
        name: String(draft.name || '').trim(),
        status: draft.status,
        subject: normalizeLocalizedText(draft.subject),
        html: normalizeLocalizedText(draft.html),
        text: normalizeLocalizedText(draft.text),
        note: String(draft.note || ''),
      });
      setOk('Сохранено');
      await loadTemplates();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось сохранить');
    } finally {
      setIsLoading(false);
    }
  };

  const publishTemplate = async () => {
    if (!draft?._id) return;
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsPublishEmailTemplate(draft._id);
      setOk('Опубликовано');
      await loadTemplates();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось опубликовать');
    } finally {
      setIsLoading(false);
    }
  };

  const rollback = async (version: number) => {
    if (!draft?._id) return;
    if (!window.confirm(`Откатить шаблон на версию ${version}?`)) return;
    setIsLoading(true);
    setError('');
    setOk('');
    try {
      await cmsRollbackEmailTemplate(draft._id, version);
      setOk('Откат выполнен');
      await loadTemplates();
      await loadVersions();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось откатить');
    } finally {
      setIsLoading(false);
    }
  };

  const setLocalizedField = (field: 'subject' | 'html' | 'text', nextValue: string) => {
    setDraft((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [field]: updateLocalizedTextValue(prev[field], language, nextValue),
      };
    });
  };

  const selectTemplate = (id: string) => {
    if (String(id) === String(selectedId || '')) return;
    if (isDirty && !window.confirm('Есть несохранённые изменения. Переключиться и потерять их?')) return;
    setSelectedId(String(id));
  };

  return (
    <div className="space-y-4">
      <MailHeader language={language} onLanguageChange={setLanguage} />

      <StateMessage error={error} ok={ok} />

      <MailCreateBlock
        createKey={createKey}
        createName={createName}
        isLoading={isLoading}
        onCreateKeyChange={setCreateKey}
        onCreateNameChange={setCreateName}
        onCreate={createTemplate}
        onImportDefaults={importDefaults}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <MailTemplateList
          templates={filteredTemplates}
          selectedId={selectedId}
          query={query}
          isLoading={isLoading}
          onQueryChange={setQuery}
          onRefresh={() => loadTemplates()}
          onSelect={selectTemplate}
        />

        <MailTemplateEditor
          draft={draft}
          language={language}
          isDirty={isDirty}
          isLoading={isLoading}
          onDraftChange={setDraft}
          onReset={resetDraft}
          onSetLocalizedField={setLocalizedField}
          onSave={saveTemplate}
          onPublish={publishTemplate}
          onLoadVersions={loadVersions}
        />

        <MailTemplateVersions
          draft={draft}
          language={language}
          versions={versions}
          isVersionsLoading={isVersionsLoading}
          isLoading={isLoading}
          openedVersion={openedVersion}
          onToggleVersion={(version) => setOpenedVersion((prev) => (prev === version ? null : version))}
          onRollback={rollback}
        />
      </div>
    </div>
  );
}
