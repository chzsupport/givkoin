export type FeedbackStatus = 'new' | 'archived';

export type FeedbackMessage = {
  _id: string;
  name?: string;
  email?: string;
  message?: string;
  status?: string;
  createdAt?: string;
  repliedAt?: string;
};
