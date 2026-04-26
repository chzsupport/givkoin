'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { CabinetNav } from '@/components/cabinet/CabinetNav';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';

import { PageBackground } from '@/components/PageBackground';

export default function CabinetLayout({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const { localePath, t } = useI18n();

  return (
    <>
      <PageBackground />
      <div className="flex flex-col w-full px-4 sm:px-6 lg:px-8 pt-[10px]">
        <div className="mx-auto w-full max-w-[1920px] flex flex-col">
          <div className="flex flex-col gap-4">
            <div className="flex w-full items-start justify-between shrink-0">
              <Link
                href={localePath('/tree')}
                className="rounded-full bg-white/10 px-6 py-2.5 text-secondary font-bold text-white hover:bg-white/20 transition-all backdrop-blur-md"
              >
                🌳 {t('nav.to_tree')}
              </Link>

              <button
                onClick={logout}
                className="rounded-lg border border-rose-500/30 px-4 py-2 text-secondary font-medium text-rose-400 hover:bg-rose-500/10 transition-colors backdrop-blur-md"
              >
                {t('nav.sign_out')}
              </button>
            </div>

            <div className="text-center shrink-0">
              <h1 className="text-h2 text-white tracking-tight">{t('cabinet.account')}</h1>
            </div>

            <div className="shrink-0">
              <CabinetNav />
            </div>

            <div className="w-full flex-1 min-h-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
