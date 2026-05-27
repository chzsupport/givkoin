export type Injury = {
  branchName?: string;
  severityPercent?: number;
  debuffPercent?: number;
  healedPercent?: number;
  requiredRadiance?: number;
  healedRadiance?: number;
  causedAt?: string;
};

export type BattleCurrentResponse = {
  status?: 'active' | 'idle' | 'pending' | string;
};

export type TreeStatusResponse = {
  healthPercent: number;
  injuries?: Injury[];
  isFruitAvailable: boolean;
};

export type SolarStatusResponse = {
  nextAvailableAt: string;
};

export type SolarPanelStatus = 'charging' | 'ready' | 'taking';

export type TreePanel = 'entity' | 'search' | 'solar';

export type UserResourceSnapshot = {
  k?: number;
  stars?: number;
  lumens?: number;
};

export type SolarShareResponse = {
  amountLm: number;
  kAward: number;
  starsAward: number;
  shareCountToday?: number;
  shareDailyLimit?: number;
  user?: UserResourceSnapshot;
};

export type CollectFruitResponse = {
  rewardType: 'k' | 'stars' | 'lumens';
  reward: number;
  user?: UserResourceSnapshot;
};

export type HealTreeResponse = {
  ok: boolean;
  lumens: number;
  starsAward: number;
  user?: UserResourceSnapshot;
};

export type SolarCollectResponse = {
  lmAward?: number;
  kAward?: number;
  user?: UserResourceSnapshot;
};

export type RadianceBurst = {
  id: string;
  startX: number;
  startY: number;
  midX: number;
  midY: number;
  endX: number;
  endY: number;
  size: number;
  delay: number;
};
