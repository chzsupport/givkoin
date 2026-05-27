export type EmailTemplate = {
  _id: string;
  key: string;
  name: string;
  status: string;
  subject?: any;
  html?: any;
  text?: any;
  note?: string;
  publishedAt?: any;
  updatedAt?: any;
  createdAt?: any;
};

export type EmailTemplateVersion = {
  _id?: string;
  version?: number;
  createdAt?: any;
  changeNote?: string;
  snapshot?: {
    subject?: any;
    html?: any;
    text?: any;
  };
};
