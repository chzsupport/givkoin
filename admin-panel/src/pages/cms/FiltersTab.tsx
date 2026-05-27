import { useEffect, useState } from 'react';
import {
  cmsCreateModerationRule,
  cmsDeleteModerationRule,
  cmsFetchModerationHits,
  cmsFetchModerationRules,
  cmsPatchModerationRule,
  cmsResolveModerationHit,
} from '../../api/cms';
import { Block, StateMessage } from '../../components/CmsOperationsUi';
import {
  formatDateTime,
  formatFilterActionLabel,
  formatFilterTypeLabel,
  formatScopeLabel,
  formatStatusLabel,
  shortenText,
} from './cmsFormatters';

export default function FiltersTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [hits, setHits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPattern, setCreatePattern] = useState('');
  const [createType, setCreateType] = useState('bad_word');
  const [createAction, setCreateAction] = useState('flag');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [rulesData, hitsData] = await Promise.all([
        cmsFetchModerationRules(),
        cmsFetchModerationHits({ limit: 80 }),
      ]);
      setRules(Array.isArray(rulesData?.rules) ? rulesData.rules : []);
      setHits(Array.isArray(hitsData?.hits) ? hitsData.hits : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить фильтры');
      setRules([]);
      setHits([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createRule = async () => {
    if (!createName.trim() || !createPattern.trim()) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsCreateModerationRule({
        name: createName.trim(),
        pattern: createPattern.trim(),
        type: createType,
        action: createAction,
        scopes: ['all'],
        isEnabled: true,
      });
      setCreateName('');
      setCreatePattern('');
      setOk('Правило создано');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось создать правило');
    } finally {
      setIsActionLoading(false);
    }
  };

  const toggleRule = async (rule: any) => {
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsPatchModerationRule(String(rule?._id || ''), { isEnabled: !Boolean(rule?.isEnabled) });
      setOk(Boolean(rule?.isEnabled) ? 'Правило отключено' : 'Правило включено');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось обновить правило');
    } finally {
      setIsActionLoading(false);
    }
  };

  const removeRule = async (rule: any) => {
    if (!window.confirm(`Удалить правило "${rule?.name || 'без названия'}"?`)) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsDeleteModerationRule(String(rule?._id || ''));
      setOk('Правило удалено');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось удалить правило');
    } finally {
      setIsActionLoading(false);
    }
  };

  const resolveHit = async (hitId: string, status: 'resolved' | 'false_positive') => {
    const note = prompt(
      status === 'false_positive'
        ? 'Комментарий: почему это ложное срабатывание'
        : 'Комментарий: что было сделано по срабатыванию',
      ''
    );
    if (note == null) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsResolveModerationHit(hitId, { status, note: String(note || '').trim() });
      setOk(status === 'false_positive' ? 'Срабатывание отмечено как ложное' : 'Срабатывание закрыто');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось обновить срабатывание');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">Правила фильтрации и последние срабатывания</div>
        <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadData()}>Обновить</button>
      </div>

      <StateMessage error={error} ok={ok} />

      <Block title="Новое правило">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className="input-field" placeholder="Название правила" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={createType} onChange={(e) => setCreateType(e.target.value)}>
            <option value="bad_word">Запрещённое слово</option>
            <option value="blocked_domain">Заблокированный домен</option>
            <option value="spam_pattern">Спам-шаблон</option>
          </select>
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={createAction} onChange={(e) => setCreateAction(e.target.value)}>
            <option value="flag">Пометить</option>
            <option value="hide">Скрыть</option>
            <option value="mute">Заглушить</option>
            <option value="block">Блокировать</option>
          </select>
          <button className="btn-primary" disabled={isActionLoading || !createName.trim() || !createPattern.trim()} onClick={createRule}>Создать правило</button>
        </div>
        <textarea
          className="input-field min-h-[90px]"
          placeholder="Что искать: слово, домен или шаблон"
          value={createPattern}
          onChange={(e) => setCreatePattern(e.target.value)}
        />
      </Block>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="Правила">
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !rules.length && <div className="text-sm text-slate-400">Правил пока нет</div>}
            {rules.map((rule) => (
              <div key={String(rule?._id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{rule?.name || 'Без названия'}</div>
                    <div className="text-xs text-slate-400">
                      {formatFilterTypeLabel(String(rule?.type || ''))} · {formatFilterActionLabel(String(rule?.action || ''))} · {rule?.isEnabled ? 'Включено' : 'Отключено'}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button className="btn-secondary" disabled={isActionLoading} onClick={() => toggleRule(rule)}>
                      {rule?.isEnabled ? 'Выключить' : 'Включить'}
                    </button>
                    <button className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10" disabled={isActionLoading} onClick={() => removeRule(rule)}>
                      Удалить
                    </button>
                  </div>
                </div>
                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 break-words">
                  {rule?.pattern || '—'}
                </div>
                {rule?.description && <div className="mt-2 text-xs text-slate-400">{rule.description}</div>}
              </div>
            ))}
          </div>
        </Block>

        <Block title="Последние срабатывания">
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !hits.length && <div className="text-sm text-slate-400">Срабатываний пока нет</div>}
            {hits.map((hit) => (
              <div key={String(hit?._id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      {hit?.rule?.name || 'Без правила'} · {formatStatusLabel(String(hit?.status || 'open'))}
                    </div>
                    <div className="text-xs text-slate-400">
                      {hit?.user?.nickname || hit?.user?.email || 'Без пользователя'} · {formatScopeLabel(String(hit?.scope || 'all'))}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">{formatDateTime(hit?.createdAt)}</div>
                </div>
                <div className="mt-2 text-xs text-slate-300">
                  Тип правила: {formatFilterTypeLabel(String(hit?.rule?.type || hit?.ruleType || ''))}
                </div>
                {shortenText(hit?.matchedText || hit?.excerpt || hit?.content || hit?.text || hit?.meta?.summary || '') && (
                  <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
                    {shortenText(hit?.matchedText || hit?.excerpt || hit?.content || hit?.text || hit?.meta?.summary || '', 260)}
                  </div>
                )}
                {String(hit?.status || '') !== 'resolved' && String(hit?.status || '') !== 'false_positive' && (
                  <div className="mt-3 flex flex-col sm:flex-row gap-2">
                    <button className="btn-secondary" disabled={isActionLoading} onClick={() => resolveHit(String(hit?._id || ''), 'resolved')}>Закрыть</button>
                    <button className="btn-secondary" disabled={isActionLoading} onClick={() => resolveHit(String(hit?._id || ''), 'false_positive')}>Ложное срабатывание</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Block>
      </div>
    </div>
  );
}
