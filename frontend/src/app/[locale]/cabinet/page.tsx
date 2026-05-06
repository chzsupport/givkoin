'use client';

import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatNumber, formatUserK } from '@/utils/formatters';
import { useI18n } from '@/context/I18nContext';

export default function CabinetPage() {
  const { user } = useAuth();
  const { language, t } = useI18n();



  return (
    <div className="relative w-full">


      <div className="relative z-10 px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full"
          >
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 lg:p-8 backdrop-blur-md">
              <div className="flex flex-col items-center">
                <h2 className="text-h3 mb-1">{user?.nickname || t('cabinet.player')}</h2>
                <p className="text-secondary text-white/40 mb-8">{user?.email || '—'}</p>

                {/* Сетка данных */}
                <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors hover:bg-white/10">
                    <div className="text-tiny uppercase tracking-wider text-white/40 mb-1">{t('cabinet.koin_label')}</div>
                    <div className="text-h3 text-amber-400">{formatUserK(user?.k ?? 0)}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors hover:bg-white/10">
                    <div className="text-tiny uppercase tracking-wider text-white/40 mb-1">{t('cabinet.lives')}</div>
                    <div className="text-h3 text-rose-400">{user?.lives ?? 0} / 5</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors hover:bg-white/10">
                    <div className="text-tiny uppercase tracking-wider text-white/40 mb-1">{t('cabinet.chips')}</div>
                    <div className="text-h3 text-cyan-400">{formatNumber(user?.complaintChips ?? 0, language)}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors hover:bg-white/10">
                    <div className="text-tiny uppercase tracking-wider text-white/40 mb-1">{t('cabinet.soul_stars')}</div>
                    <div className="text-h3 text-amber-400">{(user?.stars ?? 0).toFixed(3)} / 5</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors hover:bg-white/10">
                    <div className="text-tiny uppercase tracking-wider text-white/40 mb-1">{t('cabinet.email')}</div>
                    <div className="text-secondary font-medium text-white truncate">{user?.email || '—'}</div>
                  </div>

                  <div className="rounded-2xl bg-white/5 border border-white/5 p-4 transition-colors hover:bg-white/10">
                    <div className="text-tiny uppercase tracking-wider text-white/40 mb-1">{t('cabinet.registration_date')}</div>
                    <div className="text-secondary font-medium text-white">
                      {user?.entity?.createdAt
                        ? formatDate(user.entity.createdAt, language, {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })
                        : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>


    </div>
  );
}

