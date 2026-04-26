 'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useAuth } from "@/context/AuthContext";
import { useI18n } from "@/context/I18nContext";
import { useBoost } from "@/context/BoostContext";
import { apiGet, apiPost } from "@/utils/api";
import { getCachedDailyStreakState, setCachedDailyStreakState } from "@/utils/sessionWarmup";

type DailyStreakStateResponse = {
  serverDay: string;
  cycleStartDay: string | null;
  claimedDays: number[];
  missedDays: number[];
  questDoneDays: number[];
  lastSeenServerDay: string | null;
  lastWelcomeShownServerDay: string | null;
  currentDayIndex: number;
  today: {
    day: number;
    tasks: {
      energyCollected: boolean;
      bridgeStoneLaid: boolean;
      rouletteSpins3: boolean;
    };
    claim: {
      clickedToday: boolean;
    };
    quest: {
      completedToday: boolean;
    };
  };
};

type DailyStreakActionResponse = {
  ok: boolean;
  already?: boolean;
  scReward?: number;
  user?: {
    sc?: number;
  };
  state: DailyStreakStateResponse;
};

function getRewardEmoji(day: number) {
  if (day % 3 === 0) return "🎁";
  return "💰";
}

function isPrizeDay(day: number) {
  return day % 3 === 0;
}

type DailyStreakCalendarProps = {
  enableWelcomeModal?: boolean;
  inline?: boolean;
  displayMode?: "summary" | "full";
};

function MiniQuestInline({
  energyCollected,
  bridgeStoneLaid,
  rouletteSpins3,
  t,
}: {
  energyCollected?: boolean;
  bridgeStoneLaid?: boolean;
  rouletteSpins3?: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const Item = ({ ok, text }: { ok?: boolean; text: string }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="text-caption text-white/70">{text}</div>
      <div className="text-caption font-bold text-white/80">{ok ? "✓" : "—"}</div>
    </div>
  );

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-label text-white/50">{t("daily_streak.day_tasks")}</div>
      <div className="space-y-1">
        <Item ok={energyCollected} text={t("daily_streak.task_collect_charge")} />
        <Item ok={bridgeStoneLaid} text={t("daily_streak.task_place_stone")} />
        <Item ok={rouletteSpins3} text={t("daily_streak.task_roulette_3")} />
      </div>
    </div>
  );
}

export function DailyStreakCalendar({
  enableWelcomeModal = true,
  inline = true,
  displayMode = "summary",
}: DailyStreakCalendarProps) {
  const { user, updateUser } = useAuth();
  const { t } = useI18n();
  const boost = useBoost();

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
    const stateByDay = new Map<number, "claimed" | "active" | "locked" | "missed">();
    const claimed = state?.claimedDays || [];
    const missed = state?.missedDays || [];

    for (let day = 1; day <= 30; day += 1) {
      if (day > currentDayIndex) {
        stateByDay.set(day, "locked");
        continue;
      }
      if (claimed.includes(day)) {
        stateByDay.set(day, "claimed");
        continue;
      }
      if (day === currentDayIndex) {
        stateByDay.set(day, "active");
        continue;
      }
      stateByDay.set(day, missed.includes(day) ? "missed" : "locked");
    }

    return stateByDay;
  }, [currentDayIndex, state?.claimedDays, state?.missedDays]);

  const dayProgress = useMemo(() => {
    const map = new Map<number, { done: number; total: 2 }>();
    const claimed = state?.claimedDays || [];
    const questDone = state?.questDoneDays || [];

    for (let day = 1; day <= 30; day += 1) {
      const markDone = claimed.includes(day) ? 1 : 0;
      const quest = questDone.includes(day) ? 1 : 0;
      map.set(day, { done: markDone + quest, total: 2 });
    }

    return map;
  }, [state?.claimedDays, state?.questDoneDays]);

  const openClaimModalForDay = (day: number) => {
    setClaimModalDay(day);
    setIsClaimModalOpen(true);
  };

  const completeQuest = async () => {
    setIsSubmitting(true);
    try {
      const response = await apiPost<DailyStreakActionResponse>("/daily-streak/quest/complete", {});
      setState(response.state);
      if (typeof response?.user?.sc === "number" && user) {
        updateUser({ ...user, sc: response.user.sc });
      }
      if (userId) {
        setCachedDailyStreakState(userId, response.state);
      }

      boost.offerBoost({
        type: 'attendance_random_reward',
        label: t('boost.attendance_random_reward.label'),
        description: t('boost.attendance_random_reward.description'),
        rewardText: t('boost.attendance_random_reward.reward'),
        onReward: () => {
          apiPost('/boost/claim', { type: 'attendance_random_reward' }).catch(() => {});
        },
      });
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
      if (typeof response?.user?.sc === "number" && user) {
        updateUser({ ...user, sc: response.user.sc });
      }
      if (userId) {
        setCachedDailyStreakState(userId, response.state);
      }
    } finally {
      setIsSubmitting(false);
      setIsClaimModalOpen(false);
    }
  };

  const QuestChecklist = ({ day }: { day: number }) => {
    const isToday = day === currentDayIndex;
    const tasks = state?.today.tasks;
    const isQuestCompletedToday = !!tasks?.energyCollected && !!tasks?.bridgeStoneLaid && !!tasks?.rouletteSpins3;
    const questCompleted = day === currentDayIndex ? !!state?.today.quest.completedToday : !!state?.questDoneDays.includes(day);
    const canComplete = isToday && isQuestCompletedToday && !questCompleted && !isSubmitting;

    return (
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-tiny uppercase tracking-widest text-white/60">{t("daily_streak.mini_quest_title")}</div>
        <div className="space-y-2 text-sm text-white/80">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <span>1.</span>
              <span>{t("daily_streak.mini_quest_step_1")}</span>
            </div>
            <div className="text-sm font-bold text-white">{tasks?.energyCollected ? "✓" : "—"}</div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <span>2.</span>
              <span>{t("daily_streak.mini_quest_step_2")}</span>
            </div>
            <div className="text-sm font-bold text-white">{tasks?.bridgeStoneLaid ? "✓" : "—"}</div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <span>3.</span>
              <span>{t("daily_streak.mini_quest_step_3")}</span>
            </div>
            <div className="text-sm font-bold text-white">{tasks?.rouletteSpins3 ? "✓" : "—"}</div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void completeQuest()}
          disabled={!canComplete}
          className={`mt-3 w-full rounded-xl border px-4 py-2 text-tiny font-bold uppercase tracking-widest transition-all active:scale-95 ${(!canComplete)
            ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"}`}
        >
          {questCompleted ? t("daily_streak.mini_quest_done") : t("daily_streak.mini_quest_submit")}
        </button>
      </div>
    );
  };

  const DayCell = ({ day }: { day: number }) => {
    const st = dayState.get(day) || "locked";
    const rewardEmoji = getRewardEmoji(day);
    const progress = day === currentDayIndex
      ? {
        done: (state?.today.claim.clickedToday ? 1 : 0) + (state?.today.quest.completedToday ? 1 : 0),
        total: 2,
      }
      : (dayProgress.get(day) || { done: 0, total: 2 });

    const clickable = st === "active";

    return (
      <button
        type="button"
        onClick={() => clickable && openClaimModalForDay(day)}
        disabled={!clickable}
        className={`relative overflow-hidden rounded-2xl border p-3 text-left transition-all active:scale-[0.98]
          ${st === "claimed" ? "border-white/10 bg-white/5 opacity-50 cursor-default" : ""}
          ${st === "active" ? "border-emerald-500/40 bg-emerald-500/10 shadow-[0_0_25px_-8px_rgba(16,185,129,0.45)] cursor-pointer" : ""}
          ${st === "locked" ? "border-white/5 bg-white/5 opacity-30 cursor-not-allowed" : ""}
          ${st === "missed" ? "border-white/10 bg-white/5 opacity-25 cursor-not-allowed" : ""}`}
      >
        <div className="relative z-10 flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-black text-white">{t("daily_streak.day")} {day}</div>
            <div
              className={`mt-1 text-caption uppercase tracking-widest ${isPrizeDay(day) ? "text-amber-200/90" : "text-white/50"}`}
            >
              {isPrizeDay(day) ? t("daily_streak.prize_day") : t("daily_streak.normal_day")}
            </div>
          </div>
          <div className="text-2xl opacity-80">{rewardEmoji}</div>
        </div>

        <div className="relative z-10 mt-2 flex items-center justify-between text-caption text-white/60">
          <span>{t("daily_streak.progress")}</span>
          <span className="font-mono font-bold text-white/70">{progress.done}/{progress.total}</span>
        </div>

        {st === "claimed" && <div className="absolute bottom-2 right-2 text-white/70">✓</div>}
      </button>
    );
  };

  const CalendarGrid = () => (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-10">
      {Array.from({ length: 30 }).map((_, idx) => {
        const day = idx + 1;
        return <DayCell key={day} day={day} />;
      })}
    </div>
  );

  if (isLoading && !state) {
    if (!inline) return null;
    return (
      <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 backdrop-blur-xl shadow-[0_20px_60px_-40px_rgba(0,0,0,0.9)]" />
    );
  }

  const todayTasks = state?.today.tasks;
  const todayProgressDone = (state?.today.claim.clickedToday ? 1 : 0) + (state?.today.quest.completedToday ? 1 : 0);
  const isFullMode = displayMode === "full";

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
              <CalendarGrid />
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

              <QuestChecklist day={currentDayIndex} />
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

              <CalendarGrid />
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

              {claimModalDay != null && <QuestChecklist day={claimModalDay} />}

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
