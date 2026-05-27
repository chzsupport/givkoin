import { Clock } from 'lucide-react';
import {
  formatAdminK,
  formatCloseReason,
  formatDateTime,
  formatDurationSeconds,
  formatReviewStatus,
  formatSettlementStatus,
  formatStars,
} from './formatters';
import { Card } from './NightGuardiansUi';
import type { RecentShift } from './types';

export function RecentShiftsCard({
  recentShifts,
}: {
  recentShifts: RecentShift[];
}) {
  return (
    <Card
      title={
        <>
          <Clock className="h-5 w-5 text-blue-400" />
          Последние завершённые смены
        </>
      }
      subtitle="Здесь видно, чем закончилась смена, сколько подтверждено аномалий и что было с оплатой."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-white/10 text-sm text-slate-400">
              <th className="p-3">Конец смены</th>
              <th className="p-3">Человек</th>
              <th className="p-3">Длительность</th>
              <th className="p-3">Аномалии</th>
              <th className="p-3">Награда</th>
              <th className="p-3">Оплата</th>
              <th className="p-3">Проверка</th>
              <th className="p-3">Закрытие</th>
            </tr>
          </thead>
          <tbody>
            {recentShifts.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  История смен пока пуста
                </td>
              </tr>
            ) : (
              recentShifts.map((shift) => {
                const reward = shift.reward || { k: 0, lm: 0, stars: 0 };
                return (
                  <tr key={shift.sessionId} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3 text-slate-300">{formatDateTime(shift.endedAt)}</td>
                    <td className="p-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{shift.nickname}</span>
                        <span className="text-xs text-slate-500">{shift.email}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{formatDurationSeconds(shift.totalDurationSeconds)}</td>
                    <td className="p-3">
                      <div className="text-white">{shift.anomaliesCleared}</div>
                      <div className="text-xs text-slate-500">Часов к оплате: {shift.payableHours}</div>
                    </td>
                    <td className="p-3">
                      <div className="text-yellow-300">{formatAdminK(reward.k)} K</div>
                      <div className="text-xs text-slate-500">
                        {Number(reward.lm) || 0} люменов, {formatStars(reward.stars)} звезды
                      </div>
                    </td>
                    <td className="p-3 text-slate-300">{formatSettlementStatus(shift.settlementStatus)}</td>
                    <td className="p-3 text-slate-300">{formatReviewStatus(shift.reviewStatus)}</td>
                    <td className="p-3 text-slate-300">{formatCloseReason(shift.closeReason)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
