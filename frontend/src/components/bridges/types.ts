export interface Bridge {
  _id: string;
  fromCountry: string;
  toCountry: string;
  status: 'building' | 'completed' | 'planning';
  currentStones: number;
  requiredStones: number;
  contributors: { user?: { _id: string; nickname: string } | null; stones: number }[];
  createdAt: string;
  updatedAt: string;
  lastContributionAt?: string;
}

export interface BridgesResponse {
  bridges: Bridge[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface BridgeStatsResponse {
  createdToday: number;
  stonesToday: number;
  limits: {
    newBridgesPerDay: number;
    existingBridgeStonesPerDay: number;
  };
  serverNow?: string;
}

export type BridgeTab = 'building' | 'my' | 'completed';
export type BridgeImageType = 'preview' | 'full';
