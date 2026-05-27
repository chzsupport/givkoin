import { Zap } from 'lucide-react';
import { formatDateTime, formatLiveDuration } from './formatters';
import { Card } from './NightGuardiansUi';
import type { ActiveGuardian } from './types';

export function ActiveGuardiansCard({
  activeGuardians,
}: {
  activeGuardians: ActiveGuardian[];
}) {
  return (
    <Card
      title={
        <>
          <Zap className="h-5 w-5 text-emerald-500" />
          Сейчас на смене ({activeGuardians.length})
        </>
      }
      subtitle="Здесь показаны только те, кто прямо сейчас ещё держит пост."
      className="mb-8"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 text-sm text-slate-400">
              <th className="p-3">Ник</th>
              <th className="p-3">Почта</th>
              <th className="p-3">На посту</th>
              <th className="p-3">Последний сигнал</th>
              <th className="p-3">Подтверждено аномалий</th>
            </tr>
          </thead>
          <tbody>
            {activeGuardians.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  Сейчас никто не стоит на посту
                </td>
              </tr>
            ) : (
              activeGuardians.map((guardian) => (
                <tr key={guardian.sessionId} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-3 font-medium text-white">{guardian.nickname}</td>
                  <td className="p-3 text-slate-400">{guardian.email}</td>
                  <td className="p-3 text-blue-300">{formatLiveDuration(guardian.startedAt)}</td>
                  <td className="p-3 text-slate-300">{formatDateTime(guardian.lastSeenAt)}</td>
                  <td className="p-3">
                    <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-bold text-emerald-300">
                      {guardian.totalAnomalies}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
