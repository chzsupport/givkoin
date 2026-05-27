import type { FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { apiPost } from '@/utils/api';
import { initialRegisterState } from './constants';
import { getRegisterErrors } from './registerUtils';
import type { RegisterState } from './types';

export function useRegisterFlow() {
  const { language: siteLanguage, t } = useI18n();
  const [form, setForm] = useState<RegisterState>(initialRegisterState);
  const [isReferralLocked, setIsReferralLocked] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null);
  const [seedPhraseSaved, setSeedPhraseSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    const referrer = localStorage.getItem('referrer');
    if (referrer) {
      setForm((prev) => ({ ...prev, referralCode: referrer }));
      setIsReferralLocked(true);
    }
  }, []);

  const errors = useMemo(() => {
    return getRegisterErrors(form, t);
  }, [form, t]);

  const updateField = <K extends keyof RegisterState>(key: K, value: RegisterState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage(null);
    setError(null);
    if (errors.length > 0) {
      setError(errors[0]);
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        acceptRules: form.acceptRules,
      };
      const res = await apiPost<{ message: string; confirmUrl?: string; seedPhrase?: string }>(
        '/auth/register',
        payload,
      );
      setMessage(res.message || t('registration.thank_you_confirm'));
      if (res.seedPhrase) {
        setSeedPhrase(res.seedPhrase);
        setSeedPhraseSaved(false);
      }
      setForm(initialRegisterState);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('auth.registration_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    error,
    errors,
    form,
    handleSubmit,
    isReferralLocked,
    message,
    seedPhrase,
    seedPhraseSaved,
    setSeedPhrase,
    setSeedPhraseSaved,
    setShowRules,
    showRules,
    siteLanguage,
    submitting,
    t,
    updateField,
  };
}
