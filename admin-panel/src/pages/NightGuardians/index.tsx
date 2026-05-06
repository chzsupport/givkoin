import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Coins,
  RefreshCw,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react';
import api from '../../api/client';

interface SalarySettings {
  k: number;
  lm: number;
  stars: number;
}

interface ActiveGuardian {
  userId: string;
  nickname: string;
  email: string;
  sessionId: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  totalAnomalies: number;
}

interface RecentShift {
  userId: string;
  nickname: string;
  email: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  totalDurationSeconds: number;
  anomaliesCleared: number;
  payableHours: number;
  reward?: {
    k: number;
    lm: number;
    stars: number;
  };
  settlementStatus?: string;
  closeReason?: string | null;
  reviewStatus?: string;
}

interface SuspiciousDetail {
  anomalyId: string;
  reason: string;
  pagePath: string;
}

interface SuspiciousWindow {
  index: number;
  reason: string;
  claimedCount: number;
  acceptedCount: number;
  invalidCount: number;
  reportedAt: string | null;
  details: SuspiciousDetail[];
}

interface SuspiciousShift {
  userId: string;
  nickname: string;
  email: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  closeReason?: string | null;
  reward?: {
    k: number;
    lm: number;
    stars: number;
  };
  payableHours: number;
  totalDurationSeconds: number;
  totalAcceptedAnomalies: number;
  totalReportedAnomalies: number;
  mismatchCount: number;
  latestMismatch?: SuspiciousWindow | null;
  suspiciousWindows?: SuspiciousWindow[];
}

const Card = ({
  title,
  subtitle,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={`rounded-xl border border-white/10 bg-white/5 p-6 ${className}`}>
    {(title || subtitle) && (
      <div className="mb-6">
        {title ? <div className="flex items-center gap-2 text-xl font-semibold text-white">{title}</div> : null}
        {subtitle ? <div className="mt-2 text-sm text-slate-400">{subtitle}</div> : null}
      </div>
    )}
    {children}
  </div>
);

const Button = ({
  children,
  onClick,
  className = '',
  variant = 'primary',
  disabled = false,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const palette =
    variant === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white'
      : variant === 'success'
        ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
        : variant === 'secondary'
          ? 'bg-white/10 hover:bg-white/20 text-white'
          : 'bg-blue-600 hover:bg-blue-500 text-white';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-medium transition-all ${palette} ${disabled ? 'cursor-not-allowed opacity-60' : ''} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-white focus:border-blue-500 focus:outline-none ${className}`}
  />
);

function getErrorMessage(error: unknown, fallback = 'Ошибка') {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message || error.response?.data?.error;
    if (message) return String(message);
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatAdminK(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(number);
}

function formatStars(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.0000';
  return number.toFixed(4);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return date.toLocaleString('ru-RU');
}

function formatDurationSeconds(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}

function formatLiveDuration(value: string | null | undefined) {
  if (!value) return 'Нет данных';
  const startedAtMs = new Date(value).getTime();
  if (!Number.isFinite(startedAtMs)) return 'Нет данных';
  const diffMinutes = Math.max(0, Math.floor((Date.now() - startedAtMs) / 60000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  return `${hours} ч ${minutes} мин`;
}

function formatCloseReason(reason: string | null | undefined) {
  switch (String(reason || '').trim()) {
    case 'manual_exit':
      return 'Вышел сам';
    case 'heartbeat_timeout':
      return 'Пропал сигнал';
    case 'empty_windows':
      return 'Нет отчётов 15 минут';
    case 'low_hour_activity':
      return 'Не добрал минимум за час';
    case 'shift_window_closed':
      return 'Смена закончилась';
    default:
      return 'Без пометки';
  }
}

function formatReviewStatus(status: string | null | undefined) {
  switch (String(status || '').trim()) {
    case 'approved':
      return 'Проверено: всё в порядке';
    case 'penalized':
      return 'Проверено: штраф';
    case 'pending':
      return 'Ждёт проверки';
    default:
      return 'Чисто';
  }
}

function formatSettlementStatus(status: string | null | undefined) {
  switch (String(status || '').trim()) {
    case 'queued':
      return 'Ждёт оплату';
    case 'settled':
      return 'Оплачено';
    case 'failed':
      return 'Ошибка оплаты';
    default:
      return 'Нет оплаты';
  }
}

function formatMismatchReason(reason: string | null | undefined) {
  switch (String(reason || '').trim()) {
    case 'unexpected_anomaly':
      return 'Сервер не выдавал такую аномалию';
    case 'wrong_page':
      return 'Указана не та страница';
    case 'wrong_time':
      return 'Указано не то время';
    case 'report_mismatch':
      return 'Отчёт не совпал с сервером';
    default:
      return 'Есть расхождение';
  }
}

function compactPagePath(value: string | null | undefined) {
  const path = String(value || '').trim();
  if (!path) return 'Страница не указана';
  return path;
}

function StatTile({
  label,
  value,
  hint,
  accent = 'text-white',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent}`}>{value}</div>
      {hint ? <div className="mt-2 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function NightGuardiansPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [actionSessionId, setActionSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);

  const [settings, setSettings] = useState<SalarySettings>({ k: 0, lm: 0, stars: 0 });
  const [activeGuardians, setActiveGuardians] = useState<ActiveGuardian[]>([]);
  const [recentShifts, setRecentShifts] = useState<RecentShift[]>([]);
  const [suspiciousShifts, setSuspiciousShifts] = useState<SuspiciousShift[]>([]);

  const summary = useMemo(() => {
    const recentPaidHours = recentShifts.reduce((sum, row) => sum + Math.max(0, Number(row.payableHours) || 0), 0);
    return {
      activeCount: activeGuardians.length,
      suspiciousCount: suspiciousShifts.length,
      recentCount: recentShifts.length,
      recentPaidHours,
    };
  }, [activeGuardians.length, recentShifts, suspiciousShifts.length]);

  const fetchData = async (silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [settingsRes, dataRes] = await Promise.all([
        api.get('/night-shift/admin/settings'),
        api.get('/night-shift/admin/data'),
      ]);

      setSettings({
        k: Number(settingsRes.data?.settings?.k) || 0,
        lm: Number(settingsRes.data?.settings?.lm) || 0,
        stars: Number(settingsRes.data?.settings?.stars) || 0,
      });
      setActiveGuardians(Array.isArray(dataRes.data?.active) ? dataRes.data.active : []);
      setRecentShifts(Array.isArray(dataRes.data?.recentShifts) ? dataRes.data.recentShifts : []);
      setSuspiciousShifts(Array.isArray(dataRes.data?.suspicious) ? dataRes.data.suspicious : []);
      setLastLoadedAt(new Date());
    } catch (nextError) {
      setError(getErrorMessage(nextError, 'Не удалось загрузить данные ночной смены'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    try {
      await api.post('/night-shift/admin/settings', {
        k: Number(settings.k) || 0,
        lm: Number(settings.lm) || 0,
        stars: Number(settings.stars) || 0,
      });
      alert('Оплата ночной смены сохранена');
      await fetchData(true);
    } catch (nextError) {
      alert(getErrorMessage(nextError, 'Ошибка сохранения'));
    } finally {
      setSavingSettings(false);
    }
  };

  const handleReview = async (sessionId: string, action: 'approve' | 'penalize') => {
    if (!sessionId) return;

    if (action === 'penalize') {
      const confirmed = window.confirm('Подтвердить штраф 80% за эту ночную смену?');
      if (!confirmed) return;
    }

    setActionSessionId(sessionId);
    setError(null);

    try {
      await api.post('/night-shift/admin/review', { sessionId, action });
      alert(action === 'approve' ? 'Смена отмечена как чистая' : 'Штраф применён');
      await fetchData(true);
    } catch (nextError) {
      alert(getErrorMessage(nextError, 'Не удалось завершить проверку'));
    } finally {
      setActionSessionId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-900 pb-12 text-slate-200">
        <main className="container mx-auto px-4 py-8">
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
            Загрузка раздела ночной смены...
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-900 pb-12 text-slate-200">
      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-blue-500" />
              <h1 className="text-3xl font-bold text-white">Ночная смена</h1>
            </div>
            <p className="mt-3 max-w-3xl text-sm text-slate-400">
              Смена жёстко работает по серверу с 19:00 до 06:00. Один человек не может брать две смены подряд.
              Здесь модератор видит тех, кто сейчас на посту, последние завершённые смены и подозрительные отчёты.
            </p>
            <p className="mt-2 text-xs text-slate-500">
              Последнее обновление: {lastLoadedAt ? lastLoadedAt.toLocaleString('ru-RU') : 'ещё не загружено'}
            </p>
          </div>

          <Button onClick={() => fetchData(true)} variant="secondary" disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Обновить
          </Button>
        </div>

        {error ? (
          <div className="mb-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Сейчас на посту"
            value={summary.activeCount}
            hint="Только те, у кого смена ещё идёт"
            accent="text-emerald-400"
          />
          <StatTile
            label="Ждут проверки"
            value={summary.suspiciousCount}
            hint="Сомнительные отчёты ночной смены"
            accent="text-amber-300"
          />
          <StatTile
            label="Последние смены"
            value={summary.recentCount}
            hint="Список завершённых смен"
            accent="text-blue-300"
          />
          <StatTile
            label="Оплаченных часов"
            value={summary.recentPaidHours}
            hint="Сумма по последним сменам на экране"
            accent="text-purple-300"
          />
        </div>

        <Card
          title={
            <>
              <Coins className="h-5 w-5 text-yellow-500" />
              Оплата ночной смены
            </>
          }
          subtitle="Меняется только оплата за полный час. Само расписание фиксировано и не редактируется."
          className="mb-8"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-400">K за час</label>
              <Input
                type="number"
                value={settings.k}
                onChange={(event) => setSettings((prev) => ({ ...prev, k: Number(event.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-400">Люмены за час</label>
              <Input
                type="number"
                value={settings.lm}
                onChange={(event) => setSettings((prev) => ({ ...prev, lm: Number(event.target.value) }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-400">Звёзды за час</label>
              <Input
                type="number"
                step="0.0001"
                value={settings.stars}
                onChange={(event) => setSettings((prev) => ({ ...prev, stars: Number(event.target.value) }))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSaveSettings} disabled={savingSettings} className="w-full">
                <Coins className="h-4 w-4" />
                {savingSettings ? 'Сохраняю...' : 'Сохранить оплату'}
              </Button>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            При штрафе модератор снимает 80% именно от награды конкретной смены.
          </div>
        </Card>

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
                        onClick={() => handleReview(shift.sessionId, 'approve')}
                        variant="success"
                        disabled={actionSessionId === shift.sessionId}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Всё в порядке
                      </Button>
                      <Button
                        onClick={() => handleReview(shift.sessionId, 'penalize')}
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
      </main>
    </div>
  );
}

