import { Badge, Card } from '../../components/ui';
import type { BattleRecord, DateValue, SuspiciousBattleRow } from './battleTypes';

function formatDate(value: DateValue, locale = 'ru') {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(locale);
}

export function BattleHistoryTab({
  battles,
  suspiciousRows,
  suspiciousLoading,
}: {
  battles: BattleRecord[];
  suspiciousRows: SuspiciousBattleRow[];
  suspiciousLoading: boolean;
}) {
  return (
    <>
      <Card title="История боёв с Мраком" subtitle="Результаты защиты Древа">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                <th className="pb-3 font-medium">Дата</th>
                <th className="pb-3 font-medium">Участников</th>
                <th className="pb-3 font-medium">Урон Света</th>
                <th className="pb-3 font-medium">Урон Мрака</th>
                <th className="pb-3 font-medium">Источник</th>
                <th className="pb-3 font-medium">Результат</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {battles.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Нет данных о боях</td></tr>
              ) : battles.map((battle) => (
                <tr key={battle._id} className="text-sm">
                  <td className="py-3 text-white">{formatDate(battle.createdAt, 'ru')}</td>
                  <td className="py-3 text-slate-300">{battle.attendanceCount || battle.attendance?.length || battle.participants?.length || 0}</td>
                  <td className="py-3 text-emerald-400">{(battle.lightDamage || 0).toLocaleString()}</td>
                  <td className="py-3 text-rose-400">{(battle.darknessDamage || 0).toLocaleString()}</td>
                  <td className="py-3 text-slate-300">
                    <div>{battle.scheduleSource || '—'}</div>
                    <div className="text-caption text-slate-500">{battle.scheduledIntervalHours ? `${battle.scheduledIntervalHours}ч` : '—'}</div>
                  </td>
                  <td className="py-3">
                    {Number(battle.lightDamage || 0) === Number(battle.darknessDamage || 0) ? (
                      <Badge variant="info">Ничья</Badge>
                    ) : Number(battle.lightDamage || 0) > Number(battle.darknessDamage || 0) ? (
                      <Badge variant="success">Победа Света</Badge>
                    ) : (
                      <Badge variant="error">Победа Мрака</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Подозрительные в боях" subtitle="Игроки, у которых отчеты выглядят невозможными">
        {suspiciousLoading ? (
          <div className="text-center text-slate-500 py-10">Загрузка...</div>
        ) : suspiciousRows.length === 0 ? (
          <div className="text-center text-slate-500 py-10">Нет подозрительных</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-xs uppercase text-slate-400">
                  <th className="pb-3 font-medium">Когда</th>
                  <th className="pb-3 font-medium">Игрок</th>
                  <th className="pb-3 font-medium">Бой</th>
                  <th className="pb-3 font-medium">Причины</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {suspiciousRows.map((row, idx) => (
                  <tr key={`${row.battleId || 'battle'}_${row.userId || 'user'}_${idx}`} className="text-sm">
                    <td className="py-3 text-slate-300">
                      {row.suspiciousAt ? new Date(row.suspiciousAt).toLocaleString('ru') : '—'}
                    </td>
                    <td className="py-3">
                      <div className="text-white font-semibold">{row.nickname || '—'}</div>
                      <div className="text-xs text-slate-500">{row.email || '—'}</div>
                    </td>
                    <td className="py-3 text-slate-300">
                      <div className="text-xs">{row.battleId ? String(row.battleId) : '—'}</div>
                      <div className="text-caption text-slate-500">
                        {row.startsAt ? `Старт: ${new Date(row.startsAt).toLocaleString('ru')}` : '—'}
                      </div>
                    </td>
                    <td className="py-3 text-slate-300">
                      <div className="space-y-1">
                        {(Array.isArray(row.suspiciousReasons) ? row.suspiciousReasons : []).slice(0, 5).map((r, i) => (
                          <div key={`${idx}_reason_${i}`} className="text-xs">{String(r)}</div>
                        ))}
                      </div>
                      {row.suspiciousEvidence ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-slate-400">доказательства</summary>
                          <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-black/30 p-3 text-caption text-slate-200">
                            {JSON.stringify(row.suspiciousEvidence, null, 2)}
                          </pre>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
