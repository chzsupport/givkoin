export type HumanCheckVariant = 'hold' | 'slider' | 'order' | 'rotate' | 'catch';

export type HumanCheckStatus = {
  required?: boolean;
  blocked?: boolean;
  blockedUntil?: string;
  challengeId?: string;
  variant?: HumanCheckVariant;
  attemptsLeft?: number;
  nextRequiredAt?: string;
};

export type HumanCheckResult = {
  blocked?: boolean;
  challengeFailed?: boolean;
  blockedUntil?: string;
  attemptsLeft?: number;
  nextRequiredAt?: string;
  message?: string;
};

export type ActiveChallenge = {
  challengeId: string;
  variant: HumanCheckVariant;
  attemptsLeft: number;
};

export type VariantProps = {
  disabled: boolean;
  resetKey: number;
  t: (key: string, fallback?: string) => string;
  onPass: () => void;
  onFail: () => void;
};
