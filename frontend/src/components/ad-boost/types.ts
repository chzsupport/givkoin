export type AdBoostOffer = {
  id: string;
  type: string;
  title?: string;
  description?: string;
  page?: string;
  expiresAt?: string;
};

export type ShopBoosts = {
  battleDamage?: { pending?: boolean; battleId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
  battleLumensDiscount?: { pending?: boolean; battleId?: string; activatedAt?: string; discountPercent?: number; adBoosted?: boolean };
  weakZoneDamage?: { pending?: boolean; battleId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
  chatK?: { pending?: boolean; chatId?: string; activatedAt?: string; bonusPercent?: number; adBoosted?: boolean };
  solarExtraLmCharges?: number;
  solarExtraLmAmount?: number;
  solarFocusAdBoosted?: boolean;
  referralBlessingUntil?: string;
  referralBlessingPercent?: number;
  referralBlessingAdBoosted?: boolean;
  referralManualBoost?: {
    cycleKey?: string;
    watchedSteps?: number[];
    completed?: boolean;
    percent?: number;
    completedAt?: string | null;
    activeUntil?: string | null;
  };
  practiceTreeBlessingUntil?: string;
  practiceTreeBlessingPercent?: number;
  practiceTreeBlessingAdBoosted?: boolean;
};

export type StartResponse = {
  sessionId: string;
  creativeId?: string;
};

export type CompleteResponse = {
  ok: boolean;
  offerType?: string;
  title?: string;
  result?: {
    k?: number;
    lumens?: number;
    stars?: number;
    shopBoosts?: ShopBoosts;
    rouletteExtraSpins?: number;
    lotteryFreeTickets?: number;
    referralManualBoost?: {
      watchedSteps?: number[];
      completed?: boolean;
      active?: boolean;
      activeUntil?: string | null;
      percent?: number;
    };
  };
};

export type DaoAdEventManager = {
  addEventListener?: (eventType: string, callback: () => void) => void;
};

export type DaoVideoInstance = {
  loadAd: (callback: () => void, onError?: () => void) => void;
  preroll: (options: { videoId: string }) => void;
  destroy?: () => void;
  adsManager?: DaoAdEventManager;
};

export type DaoVideoConstructor = new (config: {
  sourceId: number;
  tagUrl: string;
  allAdsComplete?: () => void;
  notSupported?: () => void;
}) => DaoVideoInstance;

export type AdBoostStatus = 'idle' | 'loading' | 'playing' | 'rewarding' | 'rewarded';
export type AdBoostTranslate = (key: string) => string;
