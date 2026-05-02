'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/context/I18nContext';
import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';

const tabs = [
  { href: '/cabinet', labelKey: 'cabinet.overview', emoji: '🏠' },
  { href: '/cabinet/activity', labelKey: 'cabinet.activity', emoji: '⚡' },
  { href: '/cabinet/warehouse', labelKey: 'cabinet.warehouse', emoji: '📦' },
  { href: '/cabinet/history', labelKey: 'cabinet.history', emoji: '📜' },
  { href: '/cabinet/friends', labelKey: 'cabinet.friends', emoji: '👥' },
  { href: '/cabinet/notifications', labelKey: 'cabinet.notifications', emoji: '🔔' },
  { href: '/cabinet/referrals', labelKey: 'cabinet.referrals', emoji: '🪐' },
  { href: '/cabinet/settings', labelKey: 'cabinet.settings', emoji: '⚙️' },
];

export function CabinetNav({ className = '' }: { className?: string }) {
  const pathname = usePathname();
  const { localePath, t } = useI18n();
  const cleanPathname = normalizeSitePath(pathname || '/');

  return (
    <nav className={`flex flex-wrap justify-center gap-2 ${className}`}>
      {tabs.map((tab) => {
        const active = tab.href === '/cabinet'
          ? cleanPathname === tab.href
          : pathStartsWith(cleanPathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={localePath(tab.href)}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${active
              ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]'
              : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
              }`}
          >
            <span aria-hidden>{tab.emoji}</span>
            <span>{t(tab.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default CabinetNav;
