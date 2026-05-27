export type WishStatus = 'open' | 'pending' | 'fulfilled';

export type WishDto = {
  id: string;
  text: string;
  status: WishStatus | 'supported' | 'archived';
  supportCount: number;
  supportK: number;
  authorId: string | null;
  executorId: string | null;
  executorName?: string | null;
  executor?: { id: string; nickname?: string | null } | null;
  createdAt: string;
  updatedAt?: string | null;
  takenAt?: string | null;
  fulfilledAt?: string | null;
  canEditUntil?: string | null;
};

export type Wish = {
  id: string;
  text: string;
  date: string;
  createdAt: string;
  canEditUntil: string | null;
  supports: number;
  supportK: number;
  status: WishStatus;
  isMine: boolean;
  executorId: string | null;
  executorName: string | null;
};

export type WishFeedResponse = {
  wishes: WishDto[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

export type WishScope = 'others' | 'mine';
export type GalaxyTab = 'create' | 'others' | 'mine';
