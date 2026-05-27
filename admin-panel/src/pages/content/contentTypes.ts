export type PostStatus = 'draft' | 'scheduled' | 'published';

export type AdminPost = {
  _id?: string;
  id?: string;
  title?: unknown;
  content?: unknown;
  translations?: unknown;
  mediaUrl?: string;
  status?: PostStatus | string;
  scheduledAt?: string;
  createdAt?: string;
};

export type PostForm = {
  title: string;
  content: string;
  enTitle: string;
  enContent: string;
  mediaUrl: string;
  status: PostStatus;
  scheduledAt: string;
};

export type ApiError = {
  response?: {
    status?: number;
    data?: {
      message?: string;
    };
  };
};
