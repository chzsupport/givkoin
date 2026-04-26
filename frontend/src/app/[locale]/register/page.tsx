'use client';

import { useMemo, useState, useEffect } from 'react';
import { apiPost } from '@/utils/api';
import { LANGUAGE_OPTIONS, getLanguageOptionLabel } from '@/constants/languages';
import { PageBackground } from '@/components/PageBackground';
import { useI18n } from '@/context/I18nContext';

type RegisterState = {
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

const allowedDomains = ['yahoo.com', 'gmail.com', 'mail.ru', 'yandex.ru', 'yandex.com', 'rambler.ru'];

const initialState: RegisterState = {
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

function validateEmail(value: string, t: (key: string) => string) {
  const [local, domain] = value.toLowerCase().split('@');
  const message = t('auth.email_dot_error');
  if (!local || !domain) return message;
  if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return message;
  if (!allowedDomains.includes(domain)) return message;
  return '';
}

export default function RegisterPage() {
  const { language: siteLanguage, t } = useI18n();
  const [form, setForm] = useState<RegisterState>(initialState);
  const [isReferralLocked, setIsReferralLocked] = useState(false);
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null);
  const [seedPhraseSaved, setSeedPhraseSaved] = useState(false);

  useEffect(() => {
    const referrer = localStorage.getItem('referrer');
    if (referrer) {
      setForm((prev) => ({ ...prev, referralCode: referrer }));
      setIsReferralLocked(true);
    }
  }, []);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const errors = useMemo(() => {
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
    } else {
      const birth = new Date(form.birthDate);
      const now = new Date();
      const age = now.getFullYear() - birth.getFullYear() - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
      if (age < 18) list.push(t('registration.18plus'));
    }
    const emailError = validateEmail(form.email, t);
    if (emailError) list.push(emailError);
    if (!form.acceptRules) list.push(t('registration.accept_rules'));
    return list;
  }, [form, t]);

  const updateField = <K extends keyof RegisterState>(key: K, value: RegisterState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
        payload
      );
      setMessage(res.message || t('registration.thank_you_confirm'));
      if (res.seedPhrase) {
        setSeedPhrase(res.seedPhrase);
        setSeedPhraseSaved(false);
      }
      setForm(initialState);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message || t('auth.registration_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageBackground />
      <div className="flex min-h-[calc(100vh-theme(spacing.20))] items-center justify-center px-4 py-12">
        <div className="card-glow w-full max-w-3xl backdrop-blur-xl border-white/10 bg-black/40 p-8 sm:p-10">
          <div className="text-center">
            <h1 className="text-h1 text-white">{t('auth.register')}</h1>
            <p className="mt-2 text-body text-white/60">{t('registration.trust_environment')}</p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <h3 className="text-secondary font-medium uppercase tracking-wider text-emerald-400">{t('settings.personal_details')}</h3>

                <div>
                  <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.nickname')}</label>
                  <input
                    className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    value={form.nickname}
                    onChange={(e) => updateField('nickname', e.target.value)}
                    required
                    minLength={2}
                    maxLength={30}
                    placeholder={t('registration.your_nickname')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.gender')}</label>
                    <select
                      className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                      value={form.gender}
                      onChange={(e) => updateField('gender', e.target.value as RegisterState['gender'])}
                    >
                      <option value="male" className="bg-slate-900">{t('registration.male')}</option>
                      <option value="female" className="bg-slate-900">{t('registration.female')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.native_language')}</label>
                    <select
                      className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                      value={form.language}
                      onChange={(e) => updateField('language', e.target.value)}
                    >
                      {LANGUAGE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-slate-900">
                          {getLanguageOptionLabel(opt, siteLanguage === 'en' ? 'en' : 'ru')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.partner_gender')}</label>
                  <select
                    className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    value={form.preferredGender}
                    onChange={(e) => updateField('preferredGender', e.target.value as RegisterState['preferredGender'])}
                  >
                    <option value="female" className="bg-slate-900">{t('registration.partner_female')}</option>
                    <option value="male" className="bg-slate-900">{t('registration.partner_male')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.dob')}</label>
                  <input
                    type="date"
                    className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    value={form.birthDate}
                    onChange={(e) => updateField('birthDate', e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-secondary font-medium uppercase tracking-wider text-emerald-400">{t('registration.preferences')}</h3>

                <div>
                  <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.partner_age_slider')}</label>
                  <div className="space-y-4 rounded-lg border border-white/5 bg-white/5 p-4">
                    <div>
                      <div className="flex justify-between text-tiny text-white/70 mb-1">
                        <span>{t('settings.age_from')}: {form.preferredAgeFrom}</span>
                      </div>
                      <input
                        type="range"
                        min={18}
                        max={99}
                        className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        value={form.preferredAgeFrom}
                        onChange={(e) =>
                          updateField('preferredAgeFrom', Math.min(Number(e.target.value), form.preferredAgeTo))
                        }
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-tiny text-white/70 mb-1">
                        <span>{t('settings.age_to')}: {form.preferredAgeTo}</span>
                      </div>
                      <input
                        type="range"
                        min={18}
                        max={99}
                        className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        value={form.preferredAgeTo}
                        onChange={(e) =>
                          updateField('preferredAgeTo', Math.max(Number(e.target.value), form.preferredAgeFrom))
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-6 border-t border-white/10">
              <h3 className="text-secondary font-medium uppercase tracking-wider text-emerald-400">{t('registration.referral_program')}</h3>
              <div>
                <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.inviter_nickname_optional')}</label>
                <input
                  className={`block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 ${isReferralLocked ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  value={form.referralCode}
                  onChange={(e) => updateField('referralCode', e.target.value)}
                  placeholder={t('registration.inviter_nickname')}
                  readOnly={isReferralLocked}
                />
              </div>
            </div>

            <div className="border-t border-white/10 pt-6">
              <h3 className="text-secondary font-medium uppercase tracking-wider text-emerald-400 mb-4">{t('registration.account')}</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.email_field')}</label>
                  <input
                    type="email"
                    className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                    placeholder={t('auth.enter_email')}
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    required
                  />
                  <p className="mt-1 text-tiny text-white/30">{t('auth.use_domains')}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <input
                type="checkbox"
                className="h-5 w-5 rounded border-white/30 bg-white/5 accent-emerald-500"
                checked={form.acceptRules}
                onChange={(e) => updateField('acceptRules', e.target.checked)}
              />
              <div className="flex-1 text-body text-white/80">
                {t('registration.i_read_and_accept')}{' '}
                <button
                  type="button"
                  onClick={() => setShowRules(true)}
                  className="text-emerald-400 hover:underline"
                >
                  {t('registration.givkoin_rules')}
                </button>
              </div>
            </div>

            {/* Messages */}
            {errors.length > 0 && (
              <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
                {errors[0]}
              </div>
            )}
            {message && (
              <div className="rounded-lg bg-emerald-500/10 p-3 text-body text-emerald-200 border border-emerald-500/20">
                {message}
              </div>
            )}
            {error && !message && (
              <div className="rounded-lg bg-rose-500/10 p-3 text-body text-rose-200 border border-rose-500/20">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="group relative flex w-full justify-center overflow-hidden rounded-lg bg-emerald-600 px-4 py-4 text-secondary font-bold text-white shadow-lg transition-all hover:bg-emerald-500 hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="relative z-10">{submitting ? t('auth.register_loading') : t('auth.register_btn')}</span>
              <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
            </button>
          </form>

          {/* Rules Modal */}
          {showRules && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
              <div className="card-glow w-full max-w-2xl bg-slate-900/90 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-h2 text-white">{t('registration.givkoin_rules')}</h2>
                  <button
                    onClick={() => setShowRules(false)}
                    className="rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4 text-white/80 leading-relaxed">
                  <p>1. {t('registration.rules_point_1')}</p>
                  <p>2. {t('registration.rules_point_2')}</p>
                  <p>3. {t('registration.rules_point_3')}</p>
                  <p className="text-white/50 text-tiny pt-4 border-t border-white/10">{t('registration.full_rules_hint')}</p>
                </div>
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => setShowRules(false)}
                    className="rounded-lg bg-emerald-600 px-6 py-2 text-secondary font-semibold text-white hover:bg-emerald-500"
                  >
                    {t('registration.got_it')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {seedPhrase && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm">
              <div className="card-glow w-full max-w-2xl bg-slate-900/90 p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-h2 text-white">{t('registration.your_seed')}</h2>
                  <button
                    onClick={() => {
                      if (!seedPhraseSaved) return;
                      setSeedPhrase(null);
                    }}
                    className={`rounded-full bg-white/10 p-2 text-white/60 hover:bg-white/20 hover:text-white transition-colors ${
                      seedPhraseSaved ? '' : 'opacity-50 cursor-not-allowed'
                    }`}
                    disabled={!seedPhraseSaved}
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-4 text-white/80 leading-relaxed">
                  <div className="rounded-lg border border-white/10 bg-black/30 p-4 font-mono text-sm break-words">
                    {seedPhrase}
                  </div>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-white/30 bg-white/5 accent-emerald-500"
                      checked={seedPhraseSaved}
                      onChange={(e) => setSeedPhraseSaved(e.target.checked)}
                    />
                    <div className="flex-1 text-body text-white/80">
                      {t('registration.i_saved_seed')}
                    </div>
                  </div>
                </div>
                <div className="mt-8 flex justify-end">
                  <button
                    onClick={() => {
                      if (!seedPhraseSaved) return;
                      setSeedPhrase(null);
                    }}
                    className={`rounded-lg px-6 py-2 text-secondary font-semibold text-white ${
                      seedPhraseSaved ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-white/10 opacity-50 cursor-not-allowed'
                    }`}
                    disabled={!seedPhraseSaved}
                  >
                    {t('registration.i_saved')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div >
      </div >
    </>
  );
}

