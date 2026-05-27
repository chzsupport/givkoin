 'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { apiGet, apiPost } from "@/utils/api";
import { getCachedDailyStreakState, setCachedDailyStreakState } from "@/utils/sessionWarmup";
import { DailyStreakCalendarGrid } from "@/components/cabinet/daily-streak/DailyStreakCalendarGrid";
import { DailyStreakQuestChecklist } from "@/components/cabinet/daily-streak/DailyStreakQuestChecklist";
import { MiniQuestInline } from "@/components/cabinet/daily-streak/MiniQuestInline";
import { buildDayProgress, buildDayState, getRewardEmoji } from "@/components/cabinet/daily-streak/dailyStreakUtils";
import type { DailyStreakActionResponse, DailyStreakCalendarProps, DailyStreakStateResponse } from "@/components/cabinet/daily-streak/types";

export function DailyStreakCalendar({
  enableWelcomeModal = true,
  inline = true,
  displayMode = "summary",
}: DailyStreakCalendarProps = {}) {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();

  const userId = (user as { _id?: string; id?: string } | null)?._id || (user as { _id?: string; id?: string } | null)?.id || "";

  const [state, setState] = useState<DailyStreakStateResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isClaimModalOpen, setIsClaimModalOpen] = useState(false);
  const [claimModalDay, setClaimModalDay] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refreshState = useCallback(async () => {
    const data = await apiGet<DailyStreakStateResponse>("/daily-streak/state");
    setState(data);
    if (userId) {
      setCachedDailyStreakState(userId, data);
    }
    return data;
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setState(null);
      setIsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const cachedState = getCachedDailyStreakState(userId);
    if (cachedState) {
      setState(cachedState);
      setIsLoading(false);
    }

    const load = async () => {
      if (!cachedState) setIsLoading(true);
      try {
        const data = await refreshState();
        if (cancelled) return;
        if (enableWelcomeModal && data.lastWelcomeShownServerDay !== data.serverDay) {
          setIsWelcomeOpen(true);
          apiPost<{ state: DailyStreakStateResponse }>("/daily-streak/welcome/seen", {})
            .then((response) => {
              if (!cancelled && response?.state) {
                setState(response.state);
                setCachedDailyStreakState(userId, response.state);
              }
            })
            .catch(() => {});
        }
      } catch {
        if (!cancelled) setState(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [enableWelcomeModal, refreshState, userId]);

  const currentDayIndex = state?.currentDayIndex || 1;

  const dayState = useMemo(() => {
    return buildDayState({ currentDayIndex, state });
  }, [currentDayIndex, state]);

  const dayProgress = useMemo(() => {
    return buildDayProgress(state);
  }, [state]);

  const openClaimModalForDay = (day: number) => {
    setClaimModalDay(day);
    setIsClaimModalOpen(true);
  };

  const completeQuest = async () => {
    setIsSubmitting(true);
    try {
      const response = await apiPost<DailyStreakActionResponse>("/daily-streak/quest/complete", {});
      setState(response.state);
      if (typeof response?.user?.k === "number" && user) {
        updateUser({ ...user, k: response.user.k });
      }
      if (userId) {
        setCachedDailyStreakState(userId, response.state);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onConfirmClaim = async () => {
    if (!claimModalDay) return;
    setIsSubmitting(true);
    try {
      const response = await apiPost<DailyStreakActionResponse>("/daily-streak/claim", {});
      setState(response.state);
      if (typeof response?.user?.k === "number" && user) {
        updateUser({ ...user, k: response.user.k });
      }
      if (userId) {
        setCachedDailyStreakState(userId, response.state);
      }
    } finally {
      setIsSubmitting(false);
      setIsClaimModalOpen(false);
    }
  };

  if (isLoading && !state) {
    if (!inline) return null;
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur-xl shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]" />
    );
  }

  const todayTasks = state?.today.tasks;
  const todayProgressDone = (state?.today.claim.clickedToday ? 1 : 0) + (state?.today.quest.completedToday ? 1 : 0);
  const isFullMode = displayMode === "full";
  const calendarGrid = (
    <DailyStreakCalendarGrid
      currentDayIndex={currentDayIndex}
      state={state}
      dayState={dayState}
      dayProgress={dayProgress}
      t={t}
      onOpenClaimDay={openClaimModalForDay}
    />
  );
  const renderQuestChecklist = (day: number) => (
    <DailyStreakQuestChecklist
      day={day}
      currentDayIndex={currentDayIndex}
      state={state}
      isSubmitting={isSubmitting}
      t={t}
      onCompleteQuest={() => void completeQuest()}
    />
  );

  return (
    <>
      {inline && !isFullMode && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur-xl shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-secondary font-bold text-white uppercase tracking-widest">{t("daily_streak.login_streak_title")}</div>
              <div className="mt-1 text-tiny text-white/50">{t("daily_streak.login_streak_desc")}</div>
            </div>
            <button
              type="button"
              onClick={() => setIsCalendarOpen(true)}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition-all active:scale-95"
            >
              {t("common.open")}
            </button>
          </div>

          <div className="mt-4">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-tiny uppercase tracking-widest text-white/50">{t("daily_streak.today")}</div>
                  <div className="text-2xl font-black text-white">{t("daily_streak.day")} {currentDayIndex}</div>
                </div>
                <div className="text-right">
                  <div className="text-tiny uppercase tracking-widest text-white/50">{t("daily_streak.progress")}</div>
                  <div className="mt-1 font-mono text-sm font-bold text-white/80">{todayProgressDone}/2</div>
                </div>
              </div>

              <MiniQuestInline
                t={t}
                energyCollected={todayTasks?.energyCollected}
                bridgeStoneLaid={todayTasks?.bridgeStoneLaid}
                rouletteSpins3={todayTasks?.rouletteSpins3}
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openClaimModalForDay(currentDayIndex)}
                  className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-tiny font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/15 transition-all active:scale-95"
                >
                  {t("daily_streak.mark_day")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(true)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition-all active:scale-95"
                >
                  {t("daily_streak.calendar")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {inline && isFullMode && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur-xl shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-secondary font-bold text-white uppercase tracking-widest">{t("daily_streak.attendance_calendar_title")}</div>
              <div className="mt-1 text-tiny text-white/50">{t("daily_streak.attendance_calendar_desc")}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-tiny text-white/70">
                {t("daily_streak.day")}: <span className="font-bold text-white">{currentDayIndex}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-2 text-tiny text-white/70">
                {t("daily_streak.today_progress")}: <span className="font-bold text-white">{todayProgressDone}/2</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCalendarOpen(true)}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition-all active:scale-95"
              >
                {t("daily_streak.fullscreen")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.85fr)]">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              {calendarGrid}
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-tiny uppercase tracking-widest text-white/50">{t("daily_streak.today")}</div>
                    <div className="text-2xl font-black text-white">{t("daily_streak.day")} {currentDayIndex}</div>
                  </div>
                  <div className="text-3xl opacity-80">{getRewardEmoji(currentDayIndex)}</div>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openClaimModalForDay(currentDayIndex)}
                    className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-tiny font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/15 transition-all active:scale-95"
                  >
                    {t("daily_streak.mark_day")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCalendarOpen(true)}
                    className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 hover:bg-white/10 transition-all active:scale-95"
                  >
                    {t("daily_streak.open_separately")}
                  </button>
                </div>
              </div>

              {renderQuestChecklist(currentDayIndex)}
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isCalendarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => setIsCalendarOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b18] p-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <div className="text-h3 text-white">{t("daily_streak.calendar_modal_title")}</div>
                  <div className="mt-1 text-tiny text-white/50">{t("daily_streak.calendar_modal_hint")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCalendarOpen(false)}
                  className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-all"
                >
                  ✕
                </button>
              </div>

              {calendarGrid}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isWelcomeOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => setIsWelcomeOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="w-full max-w-md rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/30 via-[#0b0b18] to-[#0b0b18] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 text-2xl">📅</div>
              <div className="text-secondary font-bold text-white uppercase tracking-widest">{t("daily_streak.welcome_title")}</div>
              <div className="mt-2 text-sm text-white/70">
                {t("daily_streak.welcome_question_prefix")} <span className="font-bold text-white">{t("daily_streak.day")} {currentDayIndex}</span>{t("daily_streak.welcome_question_suffix")}
              </div>
              <div className="mt-1 text-tiny text-white/50">{t("daily_streak.welcome_note")}</div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsWelcomeOpen(false);
                    openClaimModalForDay(currentDayIndex);
                  }}
                  className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-tiny font-bold uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/15 transition-all active:scale-95"
                >
                  {t("daily_streak.mark")}
                </button>
                <button
                  type="button"
                  onClick={() => setIsWelcomeOpen(false)}
                  className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-tiny font-bold uppercase tracking-widest text-white/60 hover:bg-white/10 transition-all active:scale-95"
                >
                  {t("daily_streak.later")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isClaimModalOpen && claimModalDay != null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            onClick={() => setIsClaimModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.95, y: 20, opacity: 0 }}
              className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl border border-white/10 bg-[#0b0b18] p-4 shadow-2xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-h3 text-white">{t("daily_streak.day")} {claimModalDay}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsClaimModalOpen(false)}
                  className="h-10 w-10 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 transition-all"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-tiny uppercase tracking-widest text-white/50">{t("daily_streak.day_progress")}</div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm text-white/70">{t("daily_streak.day_mark")}</div>
                  <div className="text-sm font-bold text-white">{state?.claimedDays.includes(claimModalDay) ? "✓" : "—"}</div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="text-sm text-white/70">{t("daily_streak.mini_quest")}</div>
                  <div className="text-sm font-bold text-white">{state?.questDoneDays.includes(claimModalDay) ? "✓" : "—"}</div>
                </div>
              </div>

              {!state?.claimedDays.includes(claimModalDay) && (
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm text-white">{t("daily_streak.claim_hint_title")}</div>
                  <div className="mt-1 text-tiny text-white/50">{t("daily_streak.claim_hint_desc")}</div>
                </div>
              )}

              {claimModalDay != null && renderQuestChecklist(claimModalDay)}

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onConfirmClaim()}
                  disabled={!!state?.claimedDays.includes(claimModalDay) || isSubmitting}
                  className={`flex-1 rounded-xl border px-4 py-3 text-tiny font-bold uppercase tracking-widest transition-all active:scale-95 ${state?.claimedDays.includes(claimModalDay)
                    ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"}`}
                >
                  {state?.claimedDays.includes(claimModalDay)
                    ? t("daily_streak.already_marked")
                    : isSubmitting
                      ? t("daily_streak.saving")
                      : t("daily_streak.mark_day")}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default DailyStreakCalendar;
