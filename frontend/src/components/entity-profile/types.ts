export type EntityProfileData = {
  _id: string;
  user: string;
  name: string;
  stage: number;
  mood: string;
  avatarUrl: string;
  satietyUntil: string | null;
  createdAt: string;
  updatedAt: string;
  history: { message: string; createdAt: string }[];
};

export type EntityMoodDiagnostics = {
  mood: string;
  rawMood: string;
  corePercent: number;
  additionalMet: number;
  confirmedCount: number;
  activeDebuff: boolean;
  isSated: boolean;
};
