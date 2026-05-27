import { getRewardEmoji, isPrizeDay } from "./dailyStreakUtils";
import type { DailyStreakStateResponse, DayCellState } from "./types";

type DailyStreakDayCellProps = {
  day: number;
  currentDayIndex: number;
  state: DailyStreakStateResponse | null;
  dayState: Map<number, DayCellState>;
  dayProgress: Map<number, { done: number; total: 2 }>;
  t: (key: string, fallback?: string) => string;
  onOpenClaimDay: (day: number) => void;
};

export function DailyStreakDayCell({
  day,
  currentDayIndex,
  state,
  dayState,
  dayProgress,
  t,
  onOpenClaimDay,
}: DailyStreakDayCellProps) {
  const st = dayState.get(day) || "locked";
  const rewardEmoji = getRewardEmoji(day);
  const progress = day === currentDayIndex
    ? {
      done: (state?.today.claim.clickedToday ? 1 : 0) + (state?.today.quest.completedToday ? 1 : 0),
      total: 2 as const,
    }
    : (dayProgress.get(day) || { done: 0, total: 2 as const });

  const clickable = st === "active";

  return (
    <button
      type="button"
      onClick={() => clickable && onOpenClaimDay(day)}
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
}
