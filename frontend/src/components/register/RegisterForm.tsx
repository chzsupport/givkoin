import type { FormEvent } from 'react';
import { LANGUAGE_OPTIONS, getLanguageOptionLabel } from '@/constants/languages';
import { RegisterMessages } from './RegisterMessages';
import type { RegisterState, RegisterTranslate } from './types';

type RegisterFormProps = {
  error: string | null;
  errors: string[];
  form: RegisterState;
  isReferralLocked: boolean;
  message: string | null;
  siteLanguage: string;
  submitting: boolean;
  t: RegisterTranslate;
  onFieldChange: <K extends keyof RegisterState>(key: K, value: RegisterState[K]) => void;
  onRulesOpen: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function RegisterForm({
  error,
  errors,
  form,
  isReferralLocked,
  message,
  siteLanguage,
  submitting,
  t,
  onFieldChange,
  onRulesOpen,
  onSubmit,
}: RegisterFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <h3 className="text-secondary font-medium uppercase tracking-wider text-emerald-400">{t('settings.personal_details')}</h3>

          <div>
            <label className="block text-tiny font-medium text-white/50 mb-1">{t('registration.nickname')}</label>
            <input
              className="block w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-body text-white placeholder-white/20 transition-colors focus:border-emerald-500/50 focus:bg-white/10 focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
              value={form.nickname}
              onChange={(e) => onFieldChange('nickname', e.target.value)}
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
                onChange={(e) => onFieldChange('gender', e.target.value as RegisterState['gender'])}
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
                onChange={(e) => onFieldChange('language', e.target.value)}
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
              onChange={(e) => onFieldChange('preferredGender', e.target.value as RegisterState['preferredGender'])}
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
              onChange={(e) => onFieldChange('birthDate', e.target.value)}
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
                    onFieldChange('preferredAgeFrom', Math.min(Number(e.target.value), form.preferredAgeTo))
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
                    onFieldChange('preferredAgeTo', Math.max(Number(e.target.value), form.preferredAgeFrom))
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
            onChange={(e) => onFieldChange('referralCode', e.target.value)}
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
              onChange={(e) => onFieldChange('email', e.target.value)}
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
          onChange={(e) => onFieldChange('acceptRules', e.target.checked)}
        />
        <div className="flex-1 text-body text-white/80">
          {t('registration.i_read_and_accept')}{' '}
          <button
            type="button"
            onClick={onRulesOpen}
            className="text-emerald-400 hover:underline"
          >
            {t('registration.givkoin_rules')}
          </button>
        </div>
      </div>

      <RegisterMessages error={error} errors={errors} message={message} />

      <button
        type="submit"
        disabled={submitting}
        className="group relative flex w-full justify-center overflow-hidden rounded-lg bg-emerald-600 px-4 py-4 text-secondary font-bold text-white shadow-lg transition-all hover:bg-emerald-500 hover:shadow-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="relative z-10">{submitting ? t('auth.register_loading') : t('auth.register_btn')}</span>
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-emerald-600 to-teal-500 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    </form>
  );
}
