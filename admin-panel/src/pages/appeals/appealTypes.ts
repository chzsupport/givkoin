export type AppealParty = string | {
  _id?: string;
  nickname?: string;
};

export type AppealMessage = {
  sender?: string;
  sentAt?: string;
  createdAt?: string;
  content?: string;
};

export type Appeal = {
  _id: string;
  status?: string;
  reason?: string;
  createdAt?: string;
  complainant?: AppealParty;
  userId?: AppealParty;
  againstUser?: AppealParty;
  appealText?: string;
  messagesSnapshot?: AppealMessage[];
};

export type AppealFilters = {
  status: string;
  search: string;
  showFilters: boolean;
};

export type AppealAction = 'confirm' | 'decline';
