import { useEffect, useState } from 'react';
import {
  fetchPracticeAttendanceAudit,
  fetchPracticeGratitudeAudit,
} from '../../api/admin';
import { Card } from '../../components/ui';

type AuditUser = {
  _id?: string;
  nickname?: string;
  email?: string;
};

type GratitudeAuditRow = {
  _id: string;
  user?: AuditUser;
  dayKey?: string;
  completedCount?: number;
  completedIndexes?: Array<string | number>;
  updatedAt?: string;
};

type AttendanceAuditRow = {
  _id: string;
  user?: AuditUser;
  cycleStartDay?: string;
  currentDayIndex?: number;
  claimedDays?: Array<string | number>;
  missedDays?: Array<string | number>;
  questDoneDays?: Array<string | number>;
  lastSeenServerDay?: string;
};

export function GratitudeAudit() {
  const [rows, setRows] = useState<GratitudeAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPracticeGratitudeAudit({ page: 1, limit: 50 });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card title="Аудит благодарности" subtitle="Только факт выполнения: пользователь, день и количество заполненных слотов. Текст благодарностей не хранится.">
      {loading ? (
        <div className="text-center py-10 text-slate-500">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500">Записей пока нет.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-400">
                <th className="py-3 pr-4">Пользователь</th>
                <th className="py-3 pr-4">День</th>
                <th className="py-3 pr-4">Слоты</th>
                <th className="py-3 pr-4">Индексы</th>
                <th className="py-3">Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-white/5 text-slate-200">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.user?.nickname || row.user?._id || '—'}</div>
                    <div className="text-xs text-slate-500">{row.user?.email || ''}</div>
                  </td>
                  <td className="py-3 pr-4">{row.dayKey || '—'}</td>
                  <td className="py-3 pr-4">{row.completedCount || 0} / 3</td>
                  <td className="py-3 pr-4">{Array.isArray(row.completedIndexes) ? row.completedIndexes.join(', ') : '—'}</td>
                  <td className="py-3">{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function AttendanceAudit() {
  const [rows, setRows] = useState<AttendanceAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchPracticeAttendanceAudit({ page: 1, limit: 50 });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      console.error(e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card title="Аудит посещаемости" subtitle="Серверное состояние 30-дневного цикла, отмеченные дни, пропуски и мини-квесты.">
      {loading ? (
        <div className="text-center py-10 text-slate-500">Загрузка...</div>
      ) : rows.length === 0 ? (
        <div className="text-slate-500">Записей пока нет.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-slate-400">
                <th className="py-3 pr-4">Пользователь</th>
                <th className="py-3 pr-4">Старт цикла</th>
                <th className="py-3 pr-4">Текущий день</th>
                <th className="py-3 pr-4">Отмечено</th>
                <th className="py-3 pr-4">Пропущено</th>
                <th className="py-3 pr-4">Квест</th>
                <th className="py-3">Последний визит</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id} className="border-b border-white/5 text-slate-200 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-medium">{row.user?.nickname || row.user?._id || '—'}</div>
                    <div className="text-xs text-slate-500">{row.user?.email || ''}</div>
                  </td>
                  <td className="py-3 pr-4">{row.cycleStartDay || '—'}</td>
                  <td className="py-3 pr-4">День {row.currentDayIndex || 1}</td>
                  <td className="py-3 pr-4">{Array.isArray(row.claimedDays) && row.claimedDays.length ? row.claimedDays.join(', ') : '—'}</td>
                  <td className="py-3 pr-4">{Array.isArray(row.missedDays) && row.missedDays.length ? row.missedDays.join(', ') : '—'}</td>
                  <td className="py-3 pr-4">{Array.isArray(row.questDoneDays) && row.questDoneDays.length ? row.questDoneDays.join(', ') : '—'}</td>
                  <td className="py-3">{row.lastSeenServerDay || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
