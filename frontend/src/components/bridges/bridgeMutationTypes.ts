import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { useAuth } from '@/context/AuthContext';
import type { Bridge, BridgesResponse, BridgeStatsResponse, BridgeTab } from './types';

type AuthState = ReturnType<typeof useAuth>;

export type BridgeAuthUser = NonNullable<AuthState['user']>;

export type BridgeToast = {
  error: (title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
};

export type FetchBridgesOptions = {
  silent?: boolean;
  append?: boolean;
  pageOverride?: number;
  tabOverride?: BridgeTab;
};

export type BridgeMutationContext = {
  activeTab: BridgeTab;
  bridges: Bridge[];
  selectedBridge: Bridge | null;
  bridgeStats: BridgeStatsResponse | null;
  createdToday: number;
  stonesToday: number;
  newBridgeLimit: number;
  existingStoneLimit: number;
  selectedBridgeDistance: number | null;
  countryFrom: string;
  countryTo: string;
  userId: string;
  user: AuthState['user'];
  refreshUser: AuthState['refreshUser'];
  updateUser: AuthState['updateUser'];
  toast: BridgeToast;
  t: (key: string) => string;
  setBridges: Dispatch<SetStateAction<Bridge[]>>;
  setSelectedBridge: Dispatch<SetStateAction<Bridge | null>>;
  setShowCreateModal: Dispatch<SetStateAction<boolean>>;
  paginationRef: MutableRefObject<BridgesResponse['pagination']>;
  pendingMutationsRef: MutableRefObject<number>;
  persistBridgeStats: (nextStats: BridgeStatsResponse | null) => void;
  persistBridgeList: (tab: BridgeTab, nextBridges: Bridge[], pagination?: BridgesResponse['pagination']) => void;
  fetchBridgeStats: (options?: { silent?: boolean }) => Promise<void>;
  fetchBridges: (options?: FetchBridgesOptions) => Promise<void>;
};

export type LayBridgeStoneParams = BridgeMutationContext & {
  bridgeId: string;
  pendingBridgeIds: Record<string, boolean>;
  setPendingBridgeIds: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export type CreateBridgeParams = BridgeMutationContext & {
  isCreatingBridge: boolean;
  setIsCreatingBridge: Dispatch<SetStateAction<boolean>>;
};
