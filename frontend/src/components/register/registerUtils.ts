import { allowedRegisterEmailDomains } from './constants';
import type { RegisterState, RegisterTranslate } from './types';

export function validateRegisterEmail(value: string, t: RegisterTranslate) {
  const [local, domain] = value.toLowerCase().split('@');
  const message = t('auth.email_dot_error');
  if (!local || !domain) return message;
  if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return message;
  if (!allowedRegisterEmailDomains.includes(domain)) return message;
  return '';
}

export function getRegisterErrors(form: RegisterState, t: RegisterTranslate) {
  const list: string[] = [];
  if (!form.nickname || form.nickname.length < 2 || form.nickname.length > 30) {
    list.push(t('registration.nickname_2_30'));
  }
  if (form.preferredAgeFrom < 18 || form.preferredAgeFrom > 99) {
    list.push(t('registration.age_from_18_99'));
  }
  if (form.preferredAgeTo < 18 || form.preferredAgeTo > 99) {
    list.push(t('registration.age_to_18_99'));
  }
  if (form.preferredAgeTo < form.preferredAgeFrom) {
    list.push(t('registration.age_to_min'));
  }
  if (!form.birthDate) {
    list.push(t('registration.enter_dob'));
  } else if (getAgeFromBirthDate(form.birthDate) < 18) {
    list.push(t('registration.18plus'));
  }
  const emailError = validateRegisterEmail(form.email, t);
  if (emailError) list.push(emailError);
  if (!form.acceptRules) list.push(t('registration.accept_rules'));
  return list;
}

function getAgeFromBirthDate(value: string) {
  const birth = new Date(value);
  const now = new Date();
  return now.getFullYear() - birth.getFullYear() - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
}
