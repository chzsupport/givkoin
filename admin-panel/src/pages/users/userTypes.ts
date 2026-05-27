export type ApprovalPayload = {
  reason: string;
  impactPreview: string;
  confirmationPhrase: string;
};

export type RequestApprovalPayload = (options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) => ApprovalPayload | null;

export type UserStatus = 'active' | 'banned' | 'pending';
export type EditableResourceField = 'k' | 'lives' | 'stars' | 'lumens' | 'complaintChips';

export type AdminUser = {
  _id: string;
  nickname?: string;
  email?: string;
  status?: UserStatus | string;
  k?: number;
  lives?: number;
  stars?: number;
  lumens?: number;
  complaintChips?: number;
};

export type ChatMessage = {
  _id: string;
  content?: string;
  translatedContent?: string;
  createdAt?: string;
  sender?: {
    nickname?: string;
  };
};

export type UserFilters = {
  status: string;
  minLives: string;
  minStars: string;
  showFilters: boolean;
};

export type UserSearchParams = {
  search: string;
  page: number;
  limit: number;
  status?: string;
  minLives?: string;
  minStars?: string;
};

export type EditUserForm = {
  k: number;
  lives: number;
  stars: number;
  lumens: number;
  complaintChips: number;
  status: UserStatus;
};

export type ApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
};
