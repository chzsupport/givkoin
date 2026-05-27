export type AdsTotals = {
  potentialRevenue?: number;
  revenue?: number;
  impressions?: number;
};

export type AdsSessionTotals = {
  totalDurationSeconds?: number;
  sessions?: number;
  avgDurationSeconds?: number;
};

export type AdsDailyStat = {
  date: string;
  impressions: number;
  avgAdRate: number;
  revenue: number;
};

export type AdsTimeByPage = {
  page: string;
  totalDurationSeconds?: number;
};

export type AdsTimeByCountry = {
  country: string;
  sessions?: number;
  totalDurationSeconds?: number;
};

export type AdsTimeByDevice = {
  device: string;
  sessions?: number;
  totalDurationSeconds?: number;
};

export type AdsStats = {
  totals?: AdsTotals;
  sessionTotals?: AdsSessionTotals;
  byCountry?: unknown[];
  daily?: AdsDailyStat[];
  timeByPage?: AdsTimeByPage[];
  timeByCountry?: AdsTimeByCountry[];
  timeByDevice?: AdsTimeByDevice[];
};

export type AdCreative = {
  _id: string;
  name?: string;
  kind?: string;
  type?: string;
  content?: string;
  duration?: number;
  active?: boolean;
  priority?: number;
  targetPages?: string[];
  impressions?: number;
};

export type CreativeForm = {
  name: string;
  type: string;
  content: string;
  duration: number;
  active: boolean;
  priority: number;
  targetPages: string[];
};

export type AdsApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};
