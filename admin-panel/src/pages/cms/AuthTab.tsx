import { useEffect, useMemo, useState } from 'react';
import {
  cmsFetchAuthEvents,
  cmsFetchUserSessions,
  cmsRevokeAllSessions,
  cmsRevokeSession,
} from '../../api/cms';
import { Block, StateMessage } from '../../components/CmsOperationsUi';
import {
  AUTH_EVENT_LABELS,
  formatAuthEventLabel,
  formatAuthResult,
  formatDateTime,
  formatReasonLabel,
  formatStatusLabel,
} from './cmsFormatters';

export default function AuthTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSessionsLoading, setIsSessionsLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadEvents = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await cmsFetchAuthEvents({
        limit: 120,
        ...(eventTypeFilter ? { eventType: eventTypeFilter } : {}),
        ...(resultFilter ? { result: resultFilter } : {}),
      });
      const rows: any[] = Array.isArray(data?.events) ? data.events : [];
      setEvents(rows);
      const hasSelected = rows.some((row) => String(row?.user?._id || '') === String(selectedUserId || ''));
      if (!hasSelected) {
        const firstUserId = String(rows.find((row) => row?.user?._id)?.user?._id || '').trim();
        setSelectedUserId(firstUserId);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить события авторизации');
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSessions = async (userId: string) => {
    if (!userId) {
      setSessions([]);
      return;
    }
    setIsSessionsLoading(true);
    setError('');
    try {
      const data = await cmsFetchUserSessions(userId);
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось загрузить сессии');
      setSessions([]);
    } finally {
      setIsSessionsLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [eventTypeFilter, resultFilter]);

  useEffect(() => {
    if (selectedUserId) {
      loadSessions(selectedUserId);
    } else {
      setSessions([]);
    }
  }, [selectedUserId]);

  const selectedUser = useMemo(() => {
    return events.find((row) => String(row?.user?._id || '') === String(selectedUserId || ''))?.user || null;
  }, [events, selectedUserId]);

  const revokeOne = async (sessionId: string) => {
    const reason = prompt('Причина завершения сессии', 'manual_admin_revoke');
    if (reason == null) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsRevokeSession(sessionId, { reason: String(reason || '').trim() || 'manual_admin_revoke' });
      setOk('Сессия завершена');
      await loadSessions(selectedUserId);
      await loadEvents();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось завершить сессию');
    } finally {
      setIsActionLoading(false);
    }
  };

  const revokeAll = async () => {
    if (!selectedUserId) return;
    if (!window.confirm('Завершить все сессии выбранного пользователя?')) return;
    const reason = prompt('Причина завершения всех сессий', 'manual_admin_revoke_all');
    if (reason == null) return;
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      await cmsRevokeAllSessions(selectedUserId, { reason: String(reason || '').trim() || 'manual_admin_revoke_all' });
      setOk('Все сессии пользователя завершены');
      await loadSessions(selectedUserId);
      await loadEvents();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Не удалось завершить все сессии');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div className="text-sm text-slate-300">История входов, ошибок и текущие сессии пользователя</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
            <option value="">Все события</option>
            {Object.entries(AUTH_EVENT_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select className="input-field pr-10" style={{ colorScheme: 'dark' }} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
            <option value="">Все результаты</option>
            <option value="success">Успех</option>
            <option value="failed">Ошибка</option>
            <option value="blocked">Заблокировано</option>
          </select>
          <button className="btn-secondary" disabled={isLoading || isActionLoading} onClick={() => loadEvents()}>Обновить</button>
        </div>
      </div>

      <StateMessage error={error} ok={ok} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Block title="События авторизации">
          <div className="space-y-2 max-h-[640px] overflow-auto pr-1">
            {isLoading && <div className="text-sm text-slate-400">Загрузка...</div>}
            {!isLoading && !events.length && <div className="text-sm text-slate-400">Событий пока нет</div>}
            {events.map((event) => {
              const eventUserId = String(event?.user?._id || '').trim();
              const isSelected = eventUserId && eventUserId === String(selectedUserId || '');
              return (
                <button
                  key={String(event?._id || `${eventUserId}_${event?.createdAt || ''}`)}
                  type="button"
                  onClick={() => eventUserId && setSelectedUserId(eventUserId)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${isSelected
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {event?.user?.nickname || event?.user?.email || event?.email || 'Неизвестный пользователь'}
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatAuthEventLabel(String(event?.eventType || ''))} · {formatAuthResult(String(event?.result || ''))}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{formatDateTime(event?.createdAt)}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                    <div>IP: {event?.ip || '—'}</div>
                    <div>Причина: {formatReasonLabel(String(event?.reason || ''))}</div>
                    <div>Метка браузера: {event?.deviceId || '—'}</div>
                    <div>Сессия: {event?.sessionId || '—'}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Block>

        <Block title="Сессии пользователя">
          {!selectedUserId && <div className="text-sm text-slate-400">Выберите событие слева, чтобы открыть сессии этого пользователя</div>}
          {selectedUserId && (
            <div className="space-y-3">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white">{selectedUser?.nickname || selectedUser?.email || selectedUserId}</div>
                  <div className="text-xs text-slate-400">{selectedUser?.email || 'Без email'} · {formatStatusLabel(String(selectedUser?.status || ''))}</div>
                </div>
                <button className="btn-secondary" disabled={isActionLoading || isSessionsLoading} onClick={revokeAll}>Завершить все сессии</button>
              </div>

              {isSessionsLoading && <div className="text-sm text-slate-400">Загрузка сессий...</div>}
              {!isSessionsLoading && !sessions.length && <div className="text-sm text-slate-400">У пользователя нет сохранённых сессий</div>}

              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {sessions.map((session) => (
                  <div key={String(session?._id || session?.sessionId || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {session?.isActive ? 'Активная сессия' : 'Завершённая сессия'}
                        </div>
                        <div className="text-xs text-slate-400">
                          Начало: {formatDateTime(session?.startedAt)} · Последняя активность: {formatDateTime(session?.lastSeenAt)}
                        </div>
                      </div>
                      {session?.isActive ? (
                        <button className="btn-secondary" disabled={isActionLoading} onClick={() => revokeOne(String(session.sessionId || session._id || ''))}>Завершить</button>
                      ) : (
                        <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-xs text-slate-400">
                          {session?.revokedAt ? `Завершена: ${formatDateTime(session.revokedAt)}` : 'Неактивна'}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                      <div>IP: {session?.ip || '—'}</div>
                      <div>Метка браузера: {session?.deviceId || '—'}</div>
                      <div>Отпечаток: {session?.fingerprint || '—'}</div>
                      <div>Причина завершения: {formatReasonLabel(String(session?.revokeReason || ''))}</div>
                    </div>
                    {session?.userAgent && (
                      <div className="mt-2 text-xs text-slate-400 break-words">
                        Браузер: {session.userAgent}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Block>
      </div>
    </div>
  );
}
