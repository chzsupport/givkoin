'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/context/ToastContext';
import { apiGet, apiPost } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';

type TreeBlessingStatus = {
  serverNow: number;
  rewardPercent: number;
  durationHours: number;
  waitSeconds: number;
  dailyLimit: number;
  usesToday: number;
  remainingUses: number;
  active: boolean;
  activeUntil: string | null;
  nextAvailableAt: string | null;
  canClaim: boolean;
  reason: 'available' | 'active' | 'daily_limit';
};

type TreeBlessingClaimResponse = TreeBlessingStatus & {
  ok: boolean;
};

const STATUS_REFRESH_MS = 60_000;

function pad(value: number) {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}

export function TreeBlessingPanel() {
  const toast = useToast();
  const { t } = useI18n();
  const [status, setStatus] = useState<TreeBlessingStatus | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [progressStartedAt, setProgressStartedAt] = useState<number | null>(null);
  const [tickNow, setTickNow] = useState(Date.now());

  const applyStatus = useCallback((nextStatus: TreeBlessingStatus) => {
    setStatus(nextStatus);
    const offset = Number(nextStatus.serverNow) - Date.now();
    setServerOffsetMs(Number.isFinite(offset) ? offset : 0);
  }, []);

  const loadStatus = useCallback(async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const response = await apiGet<TreeBlessingStatus>('/practice/tree-blessing/status');
      applyStatus(response);
    } catch (error: unknown) {
      if (!silent) {
        const message = error instanceof Error ? error.message : '';
        toast.error(t('common.error'), message || t('practice.tree_blessing.load_error'));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [applyStatus, t, toast]);

  useEffect(() => {
    loadStatus().catch(() => {});
  }, [loadStatus]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (progressStartedAt == null) {
        loadStatus(true).catch(() => {});
      }
    }, STATUS_REFRESH_MS);

    return () => window.clearInterval(interval);
  }, [loadStatus, progressStartedAt]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTickNow(Date.now());
    }, progressStartedAt == null ? 1000 : 100);

    return () => window.clearInterval(interval);
  }, [progressStartedAt]);

  const waitSeconds = status?.waitSeconds ?? 30;
  const progressDurationMs = waitSeconds * 1000;
  const progressElapsedMs = progressStartedAt == null ? 0 : Math.max(0, tickNow - progressStartedAt);
  const progressPercent = progressStartedAt == null
    ? 0
    : Math.max(0, Math.min(100, (progressElapsedMs / progressDurationMs) * 100));
  const progressLeftMs = Math.max(0, progressDurationMs - progressElapsedMs);

  const serverNowMs = Date.now() + serverOffsetMs;
  const activeUntilMs = status?.activeUntil ? new Date(status.activeUntil).getTime() : 0;
  const isActiveNow = activeUntilMs > serverNowMs;
  const activeLeftMs = isActiveNow ? activeUntilMs - serverNowMs : 0;
  const remainingUses = status?.remainingUses ?? 0;
  const dailyLimit = status?.dailyLimit ?? 3;
  const rewardPercent = status?.rewardPercent ?? 10;
  const durationHours = status?.durationHours ?? 3;
  const limitReached = !isActiveNow && remainingUses <= 0;
  const canStart = Boolean(status) && !isLoading && !isClaiming && progressStartedAt == null && !isActiveNow && remainingUses > 0;

  const finishClaim = useCallback(async () => {
    setIsClaiming(true);
    try {
      const response = await apiPost<TreeBlessingClaimResponse>('/practice/tree-blessing/claim', {});
      applyStatus(response);
      toast.success(
        t('practice.tree_blessing.toast_title'),
        `${t('practice.tree_blessing.toast_success_prefix')} ${rewardPercent}% ${t('practice.tree_blessing.toast_success_middle')} ${durationHours} ${t('practice.tree_blessing.toast_success_suffix')}`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '';
      toast.error(t('common.error'), message || t('practice.tree_blessing.claim_error'));
      await loadStatus(true);
    } finally {
      setProgressStartedAt(null);
      setIsClaiming(false);
    }
  }, [applyStatus, durationHours, loadStatus, rewardPercent, t, toast]);

  useEffect(() => {
    if (progressStartedAt == null || isClaiming || progressPercent < 100) return;
    finishClaim().catch(() => {});
  }, [finishClaim, isClaiming, progressPercent, progressStartedAt]);

  const handleStart = () => {
    if (!canStart) return;
    setProgressStartedAt(Date.now());
    setTickNow(Date.now());
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative overflow-hidden rounded-[28px] border border-amber-400/20 bg-[linear-gradient(135deg,rgba(71,33,5,0.92),rgba(9,28,36,0.9),rgba(8,8,18,0.96))] px-5 py-6 sm:px-8 sm:py-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-10 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-amber-300/15 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />
          <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-emerald-300/10 blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="mb-4 inline-flex items-center rounded-full border border-amber-300/20 bg-white/5 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.35em] text-amber-200/85">
            {t('practice.tree_blessing.title')}
          </div>

          {isLoading && !status ? (
            <div className="w-full max-w-2xl">
              <div className="text-lg font-semibold text-white/90">{t('practice.tree_blessing.loading_title')}</div>
              <div className="mt-2 text-sm text-white/55">{t('practice.tree_blessing.loading_desc')}</div>
            </div>
          ) : !status ? (
            <div className="w-full max-w-2xl">
              <div className="text-lg font-semibold text-white/90">{t('practice.tree_blessing.no_status_title')}</div>
              <div className="mt-2 text-sm text-white/55">{t('practice.tree_blessing.no_status_desc')}</div>
              <button
                type="button"
                onClick={() => loadStatus().catch(() => {})}
                className="mt-5 inline-flex items-center justify-center rounded-2xl border border-amber-300/30 bg-amber-500/10 px-6 py-3 text-sm font-bold text-amber-100 transition hover:bg-amber-500/20"
              >
                {t('practice.tree_blessing.refresh')}
              </button>
            </div>
          ) : progressStartedAt != null ? (
            <div className="w-full max-w-3xl">
              <div className="text-xl font-semibold text-white">{t('practice.tree_blessing.progress_title')}</div>
              <div className="mt-2 text-sm text-white/65">{t('practice.tree_blessing.progress_desc')}</div>

              <div className="mt-6 rounded-[24px] border border-amber-300/15 bg-black/25 px-4 py-5 sm:px-6">
                <div className="mb-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.28em] text-white/55">
                  <span>{isClaiming ? t('practice.tree_blessing.progress_state_claiming') : t('practice.tree_blessing.progress_state_filling')}</span>
                  <span className="font-bold text-amber-200">{Math.round(progressPercent)}%</span>
                </div>

                <div className="h-3 w-full overflow-hidden rounded-full border border-white/10 bg-neutral-900/80 shadow-inner">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-yellow-700 via-amber-400 to-yellow-200 transition-[width] duration-100 ease-linear shadow-[0_0_30px_rgba(251,191,36,0.45)]"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="mt-3 text-sm text-white/70">
                  {isClaiming
                    ? t('practice.tree_blessing.progress_last_step')
                    : `${t('practice.tree_blessing.time_left_prefix')} ${formatDuration(progressLeftMs)}`}
                </div>
              </div>
            </div>
          ) : isActiveNow ? (
            <div className="w-full max-w-3xl">
              <div className="text-2xl font-semibold text-white">{t('practice.tree_blessing.active_title')}</div>
              <div className="mt-3 text-[1.15rem] font-bold text-amber-200 sm:text-[1.35rem]">
                +{rewardPercent}% {t('practice.tree_blessing.active_bonus_middle')} {durationHours} {t('practice.tree_blessing.active_bonus_suffix')}
              </div>
              <div className="mt-4 text-sm text-white/70">{t('practice.tree_blessing.repeat_prefix')} {formatDuration(activeLeftMs)}</div>
              <div className="mt-2 text-sm text-white/55">
                {remainingUses > 0
                  ? `${t('practice.tree_blessing.today_left_prefix')} ${remainingUses} ${t('practice.tree_blessing.today_left_middle')} ${dailyLimit}.`
                  : t('practice.tree_blessing.today_last')}
              </div>
            </div>
          ) : limitReached ? (
            <div className="w-full max-w-3xl">
              <div className="text-2xl font-semibold text-white">{t('practice.tree_blessing.limit_reached_title')}</div>
              <div className="mt-3 text-[1.15rem] font-bold text-amber-200 sm:text-[1.35rem]">
                {t('practice.tree_blessing.limit_reached_prefix')} {dailyLimit} {t('practice.tree_blessing.limit_reached_suffix')}
              </div>
              <div className="mt-4 text-sm text-white/60">{t('practice.tree_blessing.limit_reached_desc')}</div>
            </div>
          ) : (
            <div className="w-full max-w-3xl">
              <div className="text-2xl font-semibold text-white">{t('practice.tree_blessing.ready_title')}</div>
              <div className="mt-3 text-[1.1rem] font-bold text-amber-200 sm:text-[1.3rem]">
                {t('practice.tree_blessing.ready_subtitle')}
              </div>
              <div className="mt-3 text-sm text-white/65">
                {t('practice.tree_blessing.ready_desc_prefix')} {waitSeconds} {t('practice.tree_blessing.ready_desc_suffix')}
              </div>

              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className="mt-6 inline-flex min-w-[220px] items-center justify-center rounded-2xl border border-amber-300/40 bg-gradient-to-r from-amber-500 to-yellow-400 px-8 py-3 text-sm font-bold uppercase tracking-[0.22em] text-[#261300] transition hover:scale-[1.02] hover:brightness-105 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('practice.tree_blessing.claim')}
              </button>

              <div className="mt-4 text-sm text-white/55">
                {t('practice.tree_blessing.today_available_prefix')} {remainingUses} {t('practice.tree_blessing.today_available_middle')} {dailyLimit}.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
