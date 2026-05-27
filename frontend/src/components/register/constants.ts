import type { RegisterState } from './types';

export const allowedRegisterEmailDomains = ['yahoo.com', 'gmail.com', 'mail.ru', 'yandex.ru', 'yandex.com', 'rambler.ru'];

export const initialRegisterState: RegisterState = {
  nickname: '',
  gender: 'male',
  preferredGender: 'female',
  birthDate: '',
  preferredAgeFrom: 18,
  preferredAgeTo: 30,
  email: '',
  acceptRules: false,
  referralCode: '',
  language: 'ru',
};
