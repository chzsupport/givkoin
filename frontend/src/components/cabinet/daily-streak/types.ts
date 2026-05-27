export type DailyStreakStateResponse = {
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

export type DailyStreakActionResponse = {
  ok: boolean;
  already?: boolean;
  kReward?: number;
  user?: {
    k?: number;
  };
  state: DailyStreakStateResponse;
};

export type DailyStreakCalendarProps = {
  enableWelcomeModal?: boolean;
  inline?: boolean;
  displayMode?: "summary" | "full";
};

export type DayCellState = "claimed" | "active" | "locked" | "missed";
