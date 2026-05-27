export type WishUser = {
  nickname?: string;
  email?: string;
};

export type WishRow = {
  _id: string;
  text: string;
  status: string;
  supportCount: number;
  supportK: number;
  executorContact?: string;
  author?: WishUser;
  executor?: WishUser | null;
};

export type WishEditForm = {
  text: string;
  status: string;
  supportCount: number;
  supportK: number;
  executorContact: string;
};
