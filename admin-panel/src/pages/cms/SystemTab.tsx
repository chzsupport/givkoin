import { useEffect, useState } from 'react';
import {
  cmsClearCache,
  cmsCreateBackup,
  cmsFetchBackups,
  cmsFetchSystemErrors,
  cmsRestoreBackup,
} from '../../api/cms';
import { Block, StateMessage } from '../../components/CmsOperationsUi';
import { formatDateTime, shortenText } from './cmsFormatters';

function requestDangerousJobPayload(options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) {
  const reason = prompt(`Причина операции: ${options.title}`);
  if (!reason || !reason.trim()) {
    alert('Причина обязательна');
    return null;
  }

  const impactPreview = prompt('Что изменится после выполнения?', options.impactPreviewDefault);
  if (!impactPreview || !impactPreview.trim()) {
    alert('Описание последствий обязательно');
    return null;
  }

  const typedPhrase = prompt(`Для подтверждения введите фразу:\n${options.confirmationPhrase}`);
  if (String(typedPhrase || '').trim() !== options.confirmationPhrase) {
    alert('Фраза подтверждения неверна');
    return null;
  }

  return {
    reason: reason.trim(),
    impactPreview: impactPreview.trim(),
    confirmationPhrase: options.confirmationPhrase,
  };
}

function SystemTab() {
  const [backups, setBackups] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [topRoutes, setTopRoutes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError('');
    try {
      const [backupsData, errorsData] = await Promise.all([
        cmsFetchBackups({ limit: 50 }),
        cmsFetchSystemErrors({ limit: 50 }),
      ]);
      setBackups(Array.isArray(backupsData?.backups) ? backupsData.backups : []);
      setErrors(Array.isArray(errorsData?.events) ? errorsData.events : []);
      setTopRoutes(Array.isArray(errorsData?.topRoutes) ? errorsData.topRoutes : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить системные данные');
      setBackups([]);
      setErrors([]);
      setTopRoutes([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const createBackupNow = async () => {
    const payload = requestDangerousJobPayload({
      title: 'Создание резервной копии',
      impactPreviewDefault: 'Будет создана новая резервная копия данных проекта.',
      confirmationPhrase: 'CREATE BACKUP',
    });
    if (!payload) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsCreateBackup(payload);
      setOk(data?.message || 'Запрос на создание резервной копии отправлен');
      await loadData();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось отправить создание резервной копии');
    } finally {
      setIsActionLoading(false);
    }
  };

  const restoreOneBackup = async (backup: any) => {
    const payload = requestDangerousJobPayload({
      title: `Восстановление копии ${backup?.backupId || backup?.fileName || ''}`,
      impactPreviewDefault: 'Текущие данные будут заменены содержимым выбранной резервной копии.',
      confirmationPhrase: 'RESTORE BACKUP',
    });
    if (!payload) return;
    if (!window.confirm('Подтвердите восстановление выбранной резервной копии.')) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsRestoreBackup({
        ...payload,
        backupId: backup?.backupId || null,
        backupPath: backup?.fullPath || null,
      });
      setOk(data?.message || 'Запрос на восстановление отправлен');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось отправить восстановление');
    } finally {
      setIsActionLoading(false);
    }
  };

  const clearSystemCache = async () => {
    if (!window.confirm('Очистить системный кэш?')) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      const data = await cmsClearCache({ zone: 'system' });
      setOk(data?.message || 'Кэш очищен');
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось очистить кэш');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">Резервные копии, системные ошибки и служебные действия</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadData()}>Обновить</button>
          <button className="btn-secondary" disabled={isActionLoading} onClick={clearSystemCache}>Очистить кэш</button>
          <button className="btn-primary" disabled={isActionLoading} onClick={createBackupNow}>Создать копию</button>
        </div>
      </div>

      <StateMessage error={error} ok={ok} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="Резервные копии">
          <div className="space-y-2 max-h-[620px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !backups.length && <div className="text-sm text-slate-400">Резервных копий пока нет</div>}
            {backups.map((backup) => (
              <div key={String(backup?.fullPath || backup?.backupId || backup?.fileName || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-white">{backup?.fileName || backup?.backupId || 'Резервная копия'}</div>
                    <div className="text-xs text-slate-400">
                      ID: {backup?.backupId || '—'} · {backup?.compressed ? 'Сжата' : 'Без сжатия'}
                    </div>
                  </div>
                  <button className="btn-secondary" disabled={isActionLoading} onClick={() => restoreOneBackup(backup)}>Восстановить</button>
                </div>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                  <div>Создана: {formatDateTime(backup?.createdAt)}</div>
                  <div>Размер: {Number(backup?.size || 0).toLocaleString()} байт</div>
                </div>
                <div className="mt-2 text-xs text-slate-400 break-all">{backup?.fullPath || '—'}</div>
              </div>
            ))}
          </div>
        </Block>

        <div className="space-y-4">
          <Block title="Частые маршруты с ошибками">
            {!topRoutes.length && <div className="text-sm text-slate-400">Статистика ошибок пока пуста</div>}
            <div className="space-y-2">
              {topRoutes.map((route) => (
                <div key={String(route?.route || '')} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <div className="font-semibold text-white">{route?.route || '—'}</div>
                  <div className="text-xs text-slate-400">Срабатываний: {route?.count || 0}</div>
                </div>
              ))}
            </div>
          </Block>

          <Block title="Последние системные ошибки">
            <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
              {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
              {!isLoading && !errors.length && <div className="text-sm text-slate-400">Ошибок пока нет</div>}
              {errors.map((item) => (
                <div key={String(item?._id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {item?.method || '—'} {item?.path || '—'}
                      </div>
                      <div className="text-xs text-slate-400">
                        Код: {item?.statusCode || '—'} · {item?.eventType || 'system_error'}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{formatDateTime(item?.createdAt)}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    Пользователь: {item?.user?.nickname || item?.user?.email || '—'} · Длительность: {item?.durationMs || 0} мс
                  </div>
                  {shortenText(item?.summary || item?.message || item?.meta?.message || '', 260) && (
                    <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-200 whitespace-pre-wrap break-words">
                      {shortenText(item?.summary || item?.message || item?.meta?.message || '', 260)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Block>
        </div>
      </div>
    </div>
  );
}

export default SystemTab;
