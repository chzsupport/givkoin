import type { DailyStreakStateResponse, DayCellState } from "./types";

export function getRewardEmoji(day: number) {
  if (day % 3 === 0) return "🎁";
  return "💰";
}

export function isPrizeDay(day: number) {
  return day % 3 === 0;
}

export function buildDayState({
  currentDayIndex,
  state,
}: {
  currentDayIndex: number;
  state: DailyStreakStateResponse | null;
}) {
  const stateByDay = new Map<number, DayCellState>();
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
}

export function buildDayProgress(state: DailyStreakStateResponse | null) {
  const map = new Map<number, { done: number; total: 2 }>();
  const claimed = state?.claimedDays || [];
  const questDone = state?.questDoneDays || [];

  for (let day = 1; day <= 30; day += 1) {
    const markDone = claimed.includes(day) ? 1 : 0;
    const quest = questDone.includes(day) ? 1 : 0;
    map.set(day, { done: markDone + quest, total: 2 });
  }

  return map;
}
