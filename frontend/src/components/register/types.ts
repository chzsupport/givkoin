export type RegisterState = {
  nickname: string;
  gender: 'male' | 'female';
  preferredGender: 'male' | 'female';
  birthDate: string;
  preferredAgeFrom: number;
  preferredAgeTo: number;
  email: string;
  acceptRules: boolean;
  referralCode: string;
  language: string;
};

export type RegisterTranslate = (key: string) => string;
