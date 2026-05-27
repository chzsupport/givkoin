import { DailyStreakDayCell } from "./DailyStreakDayCell";
import type { DailyStreakStateResponse, DayCellState } from "./types";

type DailyStreakCalendarGridProps = {
  currentDayIndex: number;
  state: DailyStreakStateResponse | null;
  dayState: Map<number, DayCellState>;
  dayProgress: Map<number, { done: number; total: 2 }>;
  t: (key: string, fallback?: string) => string;
  onOpenClaimDay: (day: number) => void;
};

export function DailyStreakCalendarGrid({
  currentDayIndex,
  state,
  dayState,
  dayProgress,
  t,
  onOpenClaimDay,
}: DailyStreakCalendarGridProps) {
  return (
    <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-10">
      {Array.from({ length: 30 }).map((_, idx) => {
        const day = idx + 1;
        return (
          <DailyStreakDayCell
            key={day}
            day={day}
            currentDayIndex={currentDayIndex}
            state={state}
            dayState={dayState}
            dayProgress={dayProgress}
            t={t}
            onOpenClaimDay={onOpenClaimDay}
          />
        );
      })}
    </div>
  );
}
