import type { DailyStreakStateResponse } from "./types";

type DailyStreakQuestChecklistProps = {
  day: number;
  currentDayIndex: number;
  state: DailyStreakStateResponse | null;
  isSubmitting: boolean;
  t: (key: string, fallback?: string) => string;
  onCompleteQuest: () => void;
};

export function DailyStreakQuestChecklist({
  day,
  currentDayIndex,
  state,
  isSubmitting,
  t,
  onCompleteQuest,
}: DailyStreakQuestChecklistProps) {
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
        onClick={onCompleteQuest}
        disabled={!canComplete}
        className={`mt-3 w-full rounded-xl border px-4 py-2 text-tiny font-bold uppercase tracking-widest transition-all active:scale-95 ${(!canComplete)
          ? "border-white/10 bg-white/5 text-white/40 cursor-not-allowed"
          : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15"}`}
      >
        {questCompleted ? t("daily_streak.mini_quest_done") : t("daily_streak.mini_quest_submit")}
      </button>
    </div>
  );
}
