'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiPatch } from '@/utils/api';
import { LANGUAGE_OPTIONS, getLanguageOptionLabel } from '@/constants/languages';
import { PageTitle } from '@/components/PageTitle';
import { Settings } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

export default function CabinetSettingsPage() {
  const { user, updateUser } = useAuth();
  const { language: siteLanguage, t } = useI18n();
  type PreferredGender = 'male' | 'female' | 'other' | 'any';
  const [email, setEmail] = useState(user?.email || '');
  const [language, setLanguage] = useState(user?.language || 'ru');
  const [preferredGender, setPreferredGender] = useState<PreferredGender>((user?.preferredGender as PreferredGender) || 'any');
  const [preferredAgeFrom, setPreferredAgeFrom] = useState<number>(user?.preferredAgeFrom ?? 18);
  const [preferredAgeTo, setPreferredAgeTo] = useState<number>(user?.preferredAgeTo ?? 30);
  const [notifications, setNotifications] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setEmail(user.email || '');
      setLanguage(user.language || 'ru');
      setPreferredGender((user.preferredGender as PreferredGender) || 'any');
      setPreferredAgeFrom(user.preferredAgeFrom ?? 18);
      setPreferredAgeTo(user.preferredAgeTo ?? 30);
    }
  }, [user]);

  const handleSave = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await apiPatch<{ message: string; user: unknown }>('/auth/profile', {
        language,
        preferredGender,
        preferredAgeFrom,
        preferredAgeTo,
      });
      if (res.user) {
        updateUser(res.user as never);
      }
      setMessage({ type: 'success', text: t('settings.saved') });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setMessage({ type: 'error', text: message || t('settings.save_error') });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full">
      <div className="relative z-10 px-4 md:px-6 py-6">
        <div className="space-y-6">
          <div className="text-center">
            <PageTitle
              title={t('settings.profile_title')}
              Icon={Settings}
              gradientClassName="from-white via-slate-200 to-emerald-200"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-emerald-200"
              size="h3"
              className="w-fit mx-auto"
            />
          </div>

          {message && (
            <div className={`rounded-xl p-4 text-secondary font-medium ${message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              }`}>
              {message.text}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* Профиль */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
              <h3 className="text-body font-bold text-white mb-4">{t('settings.profile')}</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-secondary font-medium text-white/70">{t('common.email')}</label>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white/70 outline-none transition-all cursor-not-allowed"
                  />
                  <p className="text-tiny text-white/40">{t('settings.email_support_only')}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-secondary font-medium text-white/70">{t('settings.native_language')}</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  >
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-slate-900">
                        {getLanguageOptionLabel(opt, siteLanguage === 'en' ? 'en' : 'ru')}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Предпочтения */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md">
              <h3 className="text-body font-bold text-white mb-4">{t('settings.preferences')}</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-secondary font-medium text-white/70">{t('settings.partner_gender')}</label>
                  <select
                    value={preferredGender}
                    onChange={(e) => setPreferredGender(e.target.value as PreferredGender)}
                    className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all"
                  >
                    <option value="any" className="bg-slate-900">{t('settings.gender_any')}</option>
                    <option value="female" className="bg-slate-900">{t('settings.gender_female')}</option>
                    <option value="male" className="bg-slate-900">{t('settings.gender_male')}</option>
                    <option value="other" className="bg-slate-900">{t('settings.gender_other')}</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="text-secondary font-medium text-white/70">{t('settings.partner_age')}</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex justify-between text-tiny text-white/70 mb-1">
                        <span>{t('settings.age_from')}: {preferredAgeFrom}</span>
                      </div>
                      <input
                        type="range"
                        min={18}
                        max={99}
                        value={preferredAgeFrom}
                        onChange={(e) => setPreferredAgeFrom(Math.min(Number(e.target.value), preferredAgeTo))}
                        className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex justify-between text-tiny text-white/70 mb-1">
                        <span>{t('settings.age_to')}: {preferredAgeTo}</span>
                      </div>
                      <input
                        type="range"
                        min={18}
                        max={99}
                        value={preferredAgeTo}
                        onChange={(e) => setPreferredAgeTo(Math.max(Number(e.target.value), preferredAgeFrom))}
                        className="w-full accent-emerald-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                  <p className="text-tiny text-white/50">
                    {t('settings.age_hint')}
                  </p>
                </div>
              </div>
            </div>

            {/* Уведомления и действия */}
            <div className="rounded-2xl border border-white/10 bg-black/20 p-5 backdrop-blur-md flex flex-col gap-4">
              <h3 className="text-body font-bold text-white">{t('settings.notifications_actions')}</h3>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-white">{t('settings.notifications')}</div>
                  <div className="text-tiny text-white/50">{t('settings.notifications_desc')}</div>
                </div>
                <button
                  onClick={() => setNotifications(!notifications)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${notifications ? 'bg-emerald-500' : 'bg-white/10'
                    }`}
                >
                  <span
                    className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${notifications ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div className="mt-auto space-y-3">
                <button className="text-secondary text-rose-400 hover:text-rose-300 transition-colors text-left">
                  {t('settings.change_password')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="w-full rounded-xl bg-emerald-600 px-6 py-2.5 text-secondary font-bold text-white shadow-lg shadow-emerald-900/20 hover:bg-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('settings.saving') : t('settings.save_changes')}
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
