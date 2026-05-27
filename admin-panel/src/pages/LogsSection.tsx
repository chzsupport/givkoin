import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, XCircle } from 'lucide-react';
import { fetchAuditLogByIdV2, fetchAuditLogsV2 } from '../api/admin';
import { Badge } from '../components/ui';

function LogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [actionTypeFilter, setActionTypeFilter] = useState('');

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditLogsV2({
        page,
        limit: 50,
        actionType: actionTypeFilter || undefined,
      });
      setLogs(Array.isArray(data?.logs) ? data.logs : []);
      setTotalPages(Math.max(1, Number(data?.pagination?.totalPages) || 1));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [page, actionTypeFilter]);

  const openLogDetails = async (id: string) => {
    setLoadingDetails(true);
    try {
      const data = await fetchAuditLogByIdV2(id);
      setSelectedLog(data || null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Не удалось загрузить детали');
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Логи аудита</h2>
        <div className="flex items-center gap-2">
          <input
            className="input-field w-64"
            placeholder="Фильтр по действию"
            value={actionTypeFilter}
            onChange={(e) => {
              setPage(1);
              setActionTypeFilter(e.target.value);
            }}
          />
          <button onClick={() => loadLogs()} className="btn-secondary">
            <RefreshCw size={16} />
            Обновить
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="btn-secondary py-1 px-3 disabled:opacity-50"
          >
            Назад
          </button>
          <span className="flex items-center px-4 text-sm text-slate-400">
            Страница {page} из {totalPages}
          </span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="btn-secondary py-1 px-3 disabled:opacity-50"
          >
            Вперед
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50 backdrop-blur-xl">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 bg-white/5 text-xs font-bold uppercase tracking-wider text-slate-400">
              <th className="px-6 py-4">Дата</th>
              <th className="px-6 py-4">Модератор</th>
              <th className="px-6 py-4">Действие</th>
              <th className="px-6 py-4">Объект</th>
              <th className="px-6 py-4">Уровень</th>
              <th className="px-6 py-4">Детали</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-sm text-slate-300">
            {loading ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center">Загрузка...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-10 text-center">Логов нет</td></tr>
            ) : logs.map((log) => (
              <tr key={log._id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex flex-col">
                    <span className="text-white">{new Date(log.createdAt).toLocaleDateString()}</span>
                    <span className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="font-medium text-white">{log.actor?.nickname || log.actor?.email || 'Система'}</div>
                  <div className="text-xs text-slate-500">{log.actor?.email || '—'}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant="info">{log.actionType}</Badge>
                </td>
                <td className="px-6 py-4 text-xs text-slate-300">
                  <div>{log.entityType || '—'}</div>
                  <div className="text-slate-500">{log.entityId || '—'}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge variant={log.severity === 'high' ? 'warning' : 'default'}>
                    {log.severity || 'normal'}
                  </Badge>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => openLogDetails(log._id)}
                    className="text-blue-400 hover:text-blue-300 text-xs font-medium"
                  >
                    Показать детали
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AnimatePresence>
        {selectedLog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLog(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl glass-panel p-8 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Детали лога</h3>
                <button onClick={() => setSelectedLog(null)} className="text-slate-400 hover:text-white">
                  <XCircle size={24} />
                </button>
              </div>

              {loadingDetails ? (
                <div className="py-10 text-center text-slate-400">Загрузка...</div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">Время</p>
                      <p className="text-white font-mono">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">IP Адрес</p>
                      <p className="text-white font-mono">{selectedLog.ip || '—'}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">Модератор</p>
                      <p className="text-white">{selectedLog.actor?.nickname || selectedLog.actor?.email || 'Система'}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-1">Действие</p>
                      <p className="text-emerald-400 font-medium">{selectedLog.actionType}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-2">Было до</p>
                      <pre className="text-xs text-amber-300 font-mono overflow-x-auto p-2 rounded bg-black/30">
                        {JSON.stringify(selectedLog.before, null, 2)}
                      </pre>
                    </div>
                    <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-xs text-slate-400 mb-2">Стало после</p>
                      <pre className="text-xs text-emerald-300 font-mono overflow-x-auto p-2 rounded bg-black/30">
                        {JSON.stringify(selectedLog.after, null, 2)}
                      </pre>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-slate-400 mb-2">Мета-данные (детали)</p>
                    <pre className="text-xs text-blue-300 font-mono overflow-x-auto p-2 rounded bg-black/30">
                      {JSON.stringify(selectedLog.meta, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="btn-primary"
                >
                  Закрыть
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default LogsSection;
