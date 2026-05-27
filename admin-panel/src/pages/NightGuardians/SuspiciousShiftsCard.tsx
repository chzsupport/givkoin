import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import {
  compactPagePath,
  formatAdminK,
  formatCloseReason,
  formatDateTime,
  formatDurationSeconds,
  formatMismatchReason,
  formatStars,
} from './formatters';
import { Button, Card, StatTile } from './NightGuardiansUi';
import type { SuspiciousShift } from './types';

export function SuspiciousShiftsCard({
  suspiciousShifts,
  actionSessionId,
  onReview,
}: {
  suspiciousShifts: SuspiciousShift[];
  actionSessionId: string | null;
  onReview: (sessionId: string, action: 'approve' | 'penalize') => void;
}) {
  return (
    <Card
      title={
        <>
          <AlertTriangle className="h-5 w-5 text-amber-400" />
          Подозрительные смены ({suspiciousShifts.length})
        </>
      }
      subtitle="Здесь модератор видит, что заявил человек, что подтвердил сервер и где именно есть расхождения."
      className="mb-8"
    >
      {suspiciousShifts.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-slate-500">
          Сейчас подозрительных смен нет
        </div>
      ) : (
        <div className="space-y-5">
          {suspiciousShifts.map((shift) => {
            const reward = shift.reward || { k: 0, lm: 0, stars: 0 };
            const penaltyPreview = {
              k: Math.floor((Number(reward.k) || 0) * 0.8),
              lm: Math.floor((Number(reward.lm) || 0) * 0.8),
              stars: Number(((Number(reward.stars) || 0) * 0.8).toFixed(4)),
            };

            return (
              <div key={shift.sessionId} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-white">{shift.nickname}</div>
                    <div className="mt-1 text-sm text-slate-400">{shift.email}</div>
                    <div className="mt-3 grid gap-1 text-sm text-slate-300">
                      <div>Начало: {formatDateTime(shift.startedAt)}</div>
                      <div>Конец: {formatDateTime(shift.endedAt)}</div>
                      <div>Закрытие: {formatCloseReason(shift.closeReason)}</div>
                      <div>Длительность: {formatDurationSeconds(shift.totalDurationSeconds)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
                      Окон с расхождением: {shift.mismatchCount}
                    </span>
                    <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-300">
                      Часов к оплате: {shift.payableHours}
                    </span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <StatTile
                    label="Заявлено человеком"
                    value={shift.totalReportedAnomalies}
                    accent="text-amber-200"
                  />
                  <StatTile
                    label="Подтвердил сервер"
                    value={shift.totalAcceptedAnomalies}
                    accent="text-emerald-300"
                  />
                  <StatTile
                    label="Награда за смену"
                    value={`${formatAdminK(reward.k)} K`}
                    hint={`${Number(reward.lm) || 0} люменов и ${formatStars(reward.stars)} звезды`}
                    accent="text-yellow-300"
                  />
                  <StatTile
                    label="Штраф 80%"
                    value={`${formatAdminK(penaltyPreview.k)} K`}
                    hint={`${penaltyPreview.lm} люменов и ${formatStars(penaltyPreview.stars)} звезды`}
                    accent="text-rose-300"
                  />
                </div>

                <div className="mt-5 space-y-3">
                  {(Array.isArray(shift.suspiciousWindows) && shift.suspiciousWindows.length > 0
                    ? shift.suspiciousWindows
                    : (shift.latestMismatch ? [shift.latestMismatch] : [])
                  ).map((window) => (
                    <div key={`${shift.sessionId}_${window.index}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="font-medium text-white">
                          Окно {window.index + 1}: {formatMismatchReason(window.reason)}
                        </div>
                        <div className="text-xs text-slate-500">
                          Отчёт пришёл: {formatDateTime(window.reportedAt)}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <div className="text-xs text-slate-400">Заявлено</div>
                          <div className="mt-1 text-lg font-semibold text-amber-200">{window.claimedCount}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <div className="text-xs text-slate-400">Подтверждено</div>
                          <div className="mt-1 text-lg font-semibold text-emerald-300">{window.acceptedCount}</div>
                        </div>
                        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                          <div className="text-xs text-slate-400">Лишних или неверных</div>
                          <div className="mt-1 text-lg font-semibold text-rose-300">{window.invalidCount}</div>
                        </div>
                      </div>

                      <div className="mt-4">
                        <div className="text-sm font-medium text-slate-300">Где расхождение</div>
                        {window.details.length === 0 ? (
                          <div className="mt-2 text-sm text-slate-500">
                            По этому окну нет детального списка, но общий отчёт не совпал с сервером.
                          </div>
                        ) : (
                          <div className="mt-3 space-y-2">
                            {window.details.map((detail) => (
                              <div
                                key={`${window.index}_${detail.anomalyId}_${detail.pagePath}`}
                                className="rounded-lg border border-rose-500/10 bg-rose-500/5 p-3"
                              >
                                <div className="text-sm text-white">{formatMismatchReason(detail.reason)}</div>
                                <div className="mt-1 text-xs text-slate-400">{compactPagePath(detail.pagePath)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <Button
                    onClick={() => onReview(shift.sessionId, 'approve')}
                    variant="success"
                    disabled={actionSessionId === shift.sessionId}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Всё в порядке
                  </Button>
                  <Button
                    onClick={() => onReview(shift.sessionId, 'penalize')}
                    variant="danger"
                    disabled={actionSessionId === shift.sessionId}
                  >
                    <XCircle className="h-4 w-4" />
                    Оштрафовать
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
